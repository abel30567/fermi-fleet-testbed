const R_ZERO = Object.freeze({ num: 0n, den: 1n })
const R_ONE = Object.freeze({ num: 1n, den: 1n })
const DECIMAL_RE = /^[+-]?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/
const MAX_EXPONENT_ABS = 100_000

/**
 * Computes the greatest common divisor of two BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Constructs a normalized rational number `{ num, den }` with `den > 0n` and `gcd(|num|, den) === 1n`.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function makeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Division by zero in rational arithmetic')
	}
	if (num === 0n) {
		return R_ZERO
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Subtracts two normalized rational numbers: `a - b`.
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratSub(a, b) {
	if (b.num === 0n) return a
	if (a.num === 0n) return { num: -b.num, den: b.den }
	const g = gcd(a.den, b.den)
	const ad = a.den / g
	const bd = b.den / g
	return makeRational(a.num * bd - b.num * ad, ad * b.den)
}

/**
 * Multiplies two normalized rational numbers with cross-reduction.
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratMul(a, b) {
	if (a.num === 0n || b.num === 0n) return R_ZERO
	const g1 = gcd(a.num, b.den)
	const g2 = gcd(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Divides two normalized rational numbers: `a / b`.
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratDiv(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero in rational arithmetic')
	}
	if (a.num === 0n) return R_ZERO
	const bInv = b.num < 0n
		? { num: -b.den, den: -b.num }
		: { num: b.den, den: b.num }
	return ratMul(a, bInv)
}

/**
 * Compares the absolute values of two normalized rational numbers.
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {-1 | 0 | 1}
 */
function ratAbsCompare(a, b) {
	const absA = a.num < 0n ? -a.num : a.num
	const absB = b.num < 0n ? -b.num : b.num
	const lhs = absA * b.den
	const rhs = absB * a.den
	if (lhs < rhs) return -1
	if (lhs > rhs) return 1
	return 0
}

/**
 * Parses an arbitrary-precision decimal string into an exact normalized rational number.
 * Supports optional leading sign, fractional digits, and scientific notation (`e`/`E`).
 * @param {unknown} raw
 * @param {number} rowIndex
 * @param {number} colIndex
 * @returns {{ num: bigint, den: bigint }}
 */
function parseDecimalString(raw, rowIndex, colIndex) {
	if (typeof raw !== 'string') {
		throw new TypeError(
			`Matrix entry at [${rowIndex}][${colIndex}] must be a decimal string, got ${raw === null ? 'null' : typeof raw}`
		)
	}
	const trimmed = raw.trim()
	const match = DECIMAL_RE.exec(trimmed)
	if (!match) {
		throw new RangeError(
			`Invalid decimal string at [${rowIndex}][${colIndex}]: ${JSON.stringify(raw)}`
		)
	}

	const negative = trimmed.startsWith('-')
	const intPart = match[1] ?? ''
	const fracPart = match[2] ?? match[3] ?? ''
	const expStr = match[4]

	const digits = (intPart + fracPart).replace(/^0+/, '')
	if (digits.length === 0) {
		return R_ZERO
	}

	let exp = 0
	if (expStr !== undefined) {
		exp = Number(expStr)
		if (!Number.isSafeInteger(exp)) {
			throw new RangeError(
				`Exponent out of supported range at [${rowIndex}][${colIndex}]: ${JSON.stringify(raw)}`
			)
		}
	}

	const totalExp = exp - fracPart.length
	if (Math.abs(totalExp) > MAX_EXPONENT_ABS) {
		throw new RangeError(
			`Exponent out of supported range at [${rowIndex}][${colIndex}]: ${JSON.stringify(raw)}`
		)
	}

	let mantissa = BigInt(digits)
	if (negative) mantissa = -mantissa

	if (totalExp >= 0) {
		return { num: mantissa * (10n ** BigInt(totalExp)), den: 1n }
	}
	return makeRational(mantissa, 10n ** BigInt(-totalExp))
}

/**
 * Formats an exact rational number as a normalized decimal string rounded to `precision`
 * fractional digits using round-half-away-from-zero. Trailing fractional zeros and
 * redundant decimal points are stripped, and zero is always formatted as `"0"`.
 * @param {{ num: bigint, den: bigint }} q
 * @param {number} precision
 * @returns {string}
 */
function formatRational(q, precision) {
	if (q.num === 0n) return '0'

	const negative = q.num < 0n
	const absNum = negative ? -q.num : q.num
	const scale = 10n ** BigInt(precision)
	const scaled = absNum * scale

	let quotient = scaled / q.den
	const remainder = scaled % q.den
	if (remainder * 2n >= q.den) {
		quotient += 1n
	}

	if (quotient === 0n) return '0'

	const sign = negative ? '-' : ''
	if (precision === 0) {
		return sign + quotient.toString()
	}

	const raw = quotient.toString().padStart(precision + 1, '0')
	const splitAt = raw.length - precision
	const intPart = raw.slice(0, splitAt)
	const fracPart = raw.slice(splitAt).replace(/0+$/, '')

	return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`
}

/**
 * Validates that a value is a non-string iterable.
 * @param {unknown} value
 * @param {string} label
 */
function assertIterable(value, label) {
	if (
		value == null ||
		typeof value === 'string' ||
		typeof value[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(`${label} must be an iterable (not a string)`)
	}
}

/**
 * Validates the precision argument.
 * @param {unknown} precision
 */
function assertPrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError(
			`precision must be a non-negative integer, got ${precision === null ? 'null' : typeof precision}`
		)
	}
	if (!Number.isInteger(precision) || precision < 0 || precision > MAX_EXPONENT_ABS) {
		throw new RangeError(
			`precision must be an integer between 0 and ${MAX_EXPONENT_ABS}, got ${precision}`
		)
	}
}

/**
 * Internal generator that lazily consumes the matrix iterable, computes the exact
 * rational inverse via Gauss-Jordan elimination with partial pivoting, and lazily
 * formats and yields each row of the inverse matrix as decimal strings.
 * @param {Iterable<Iterable<string>>} matrix
 * @param {number} precision
 * @returns {Generator<string[], void, unknown>}
 */
function* inverseRowsGenerator(matrix, precision) {
	const a = []
	let n = -1
	let rowIndex = 0

	for (const rawRow of matrix) {
		if (n !== -1 && rowIndex >= n) {
			throw new RangeError(`Matrix must be square: expected ${n} rows, got more than ${n}`)
		}
		assertIterable(rawRow, `Row ${rowIndex}`)

		const row = []
		let colIndex = 0
		for (const rawCell of rawRow) {
			if (n !== -1 && colIndex >= n) {
				throw new RangeError(
					`Matrix row ${rowIndex} has more than ${n} columns (matrix must be square and non-ragged)`
				)
			}
			row.push(parseDecimalString(rawCell, rowIndex, colIndex))
			colIndex += 1
		}

		if (rowIndex === 0) {
			if (colIndex === 0) {
				throw new RangeError('Matrix must be non-empty: first row has 0 columns')
			}
			n = colIndex
		} else if (colIndex !== n) {
			throw new RangeError(
				`Matrix row ${rowIndex} has ${colIndex} columns, expected ${n} (matrix must be square and non-ragged)`
			)
		}

		a.push(row)
		rowIndex += 1
	}

	if (rowIndex === 0) {
		throw new RangeError('Matrix must be non-empty')
	}
	if (rowIndex !== n) {
		throw new RangeError(`Matrix must be square: expected ${n} rows, got ${rowIndex}`)
	}

	// Build augmented identity matrix in exact rational form.
	const inv = Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? R_ONE : R_ZERO))
	)

	// Exact rational Gauss-Jordan elimination with partial pivoting.
	for (let col = 0; col < n; col += 1) {
		let pivotRow = col
		for (let r = col + 1; r < n; r += 1) {
			if (ratAbsCompare(a[r][col], a[pivotRow][col]) > 0) {
				pivotRow = r
			}
		}

		if (a[pivotRow][col].num === 0n) {
			throw new RangeError('Matrix is singular and cannot be inverted')
		}

		if (pivotRow !== col) {
			const tmpA = a[col]
			a[col] = a[pivotRow]
			a[pivotRow] = tmpA

			const tmpInv = inv[col]
			inv[col] = inv[pivotRow]
			inv[pivotRow] = tmpInv
		}

		const pivotVal = a[col][col]
		if (pivotVal.num !== 1n || pivotVal.den !== 1n) {
			a[col][col] = R_ONE
			for (let j = col + 1; j < n; j += 1) {
				if (a[col][j].num !== 0n) {
					a[col][j] = ratDiv(a[col][j], pivotVal)
				}
			}
			for (let j = 0; j < n; j += 1) {
				if (inv[col][j].num !== 0n) {
					inv[col][j] = ratDiv(inv[col][j], pivotVal)
				}
			}
		}

		for (let r = 0; r < n; r += 1) {
			if (r === col) continue
			const factor = a[r][col]
			if (factor.num === 0n) continue

			a[r][col] = R_ZERO
			for (let j = col + 1; j < n; j += 1) {
				if (a[col][j].num !== 0n) {
					a[r][j] = ratSub(a[r][j], ratMul(factor, a[col][j]))
				}
			}
			for (let j = 0; j < n; j += 1) {
				if (inv[col][j].num !== 0n) {
					inv[r][j] = ratSub(inv[r][j], ratMul(factor, inv[col][j]))
				}
			}
		}
	}

	// Lazily format and yield each row of the inverse matrix on demand.
	for (let i = 0; i < n; i += 1) {
		yield inv[i].map((q) => formatRational(q, precision))
	}
}

/**
 * Computes the inverse of a square matrix of arbitrary-precision decimal strings using
 * exact BigInt rational arithmetic, returning a generator that consumes input iterables
 * lazily and yields each formatted row of the inverse matrix on demand.
 *
 * - Input rows and elements are consumed lazily when the returned generator is iterated;
 *   invalid rows, ragged dimensions, excess rows, or invalid decimal strings fail fast
 *   without pulling further items from the input iterables.
 * - Intermediate arithmetic is performed exactly over `Q` using `BigInt`, avoiding
 *   accumulated rounding error and ensuring exact singularity detection.
 * - Output entries are formatted lazily row-by-row to at most `precision` fractional
 *   digits using round-half-away-from-zero, with trailing fractional zeros removed.
 *
 * @param {Iterable<Iterable<string>>} matrix - Square matrix represented as an iterable of row iterables of decimal strings.
 * @param {number} [precision=20] - Maximum number of fractional decimal digits in each output string (non-negative integer).
 * @returns {Generator<string[], void, unknown>} Generator yielding each row of the inverse matrix as an array of decimal strings.
 * @throws {TypeError} If `matrix` or any row is not a non-string iterable, an entry is not a string, or `precision` is not a number.
 * @throws {RangeError} If `matrix` is empty, ragged, non-square, singular, contains an invalid decimal string, or `precision` is invalid.
 */
export function inverseDecimalLazy(matrix, precision = 20) {
	assertPrecision(precision)
	assertIterable(matrix, 'matrix')
	return inverseRowsGenerator(matrix, precision)
}
