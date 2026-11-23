const DECIMAL_RE = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/
const MAX_PRECISION = 100000
const MAX_EXPONENT = 100000
const BLOCK_SIZE = 32

/**
 * Parses a decimal string into an exact arbitrary-precision BigInt representation:
 *   value = sign * unscaled * 10^exp10
 * without any IEEE-754 floating-point conversion.
 *
 * @param {unknown} raw
 * @param {number} row
 * @param {number} col
 * @returns {{ sign: number, unscaled: bigint, exp10: bigint }}
 */
function parseDecimal(raw, row, col) {
	if (typeof raw !== 'string') {
		throw new TypeError(`Invalid entry at [${row}][${col}]: expected decimal string`)
	}
	const trimmed = raw.trim()
	const match = DECIMAL_RE.exec(trimmed)
	if (!match) {
		throw new RangeError(`Invalid decimal string at [${row}][${col}]: ${JSON.stringify(raw)}`)
	}

	const [, signStr, intPart, fracAfterDot, fracOnly, expStr] = match
	const digits = fracOnly !== undefined ? fracOnly : `${intPart}${fracAfterDot ?? ''}`
	const fracLen = fracOnly !== undefined ? fracOnly.length : (fracAfterDot ? fracAfterDot.length : 0)

	const unscaled = BigInt(digits)
	if (unscaled === 0n) {
		return { sign: 0, unscaled: 0n, exp10: 0n }
	}

	const sign = signStr === '-' ? -1 : 1
	const exp10 = (expStr !== undefined ? BigInt(expStr) : 0n) - BigInt(fracLen)
	return { sign, unscaled, exp10 }
}

/**
 * Rounds a parsed decimal to `precision` fractional decimal places using
 * exact BigInt round-half-even (banker's rounding), then formats it as a
 * canonical decimal string (no leading/trailing redundant zeros, no `-0`).
 *
 * @param {{ sign: number, unscaled: bigint, exp10: bigint }} parsed
 * @param {number | undefined} precision
 * @param {number} row
 * @param {number} col
 * @returns {string}
 */
function formatDecimal(parsed, precision, row, col) {
	let { sign, unscaled, exp10 } = parsed
	if (sign === 0 || unscaled === 0n) {
		return '0'
	}

	if (precision !== undefined) {
		const targetExp = -BigInt(precision)
		if (exp10 < targetExp) {
			const dropBig = targetExp - exp10
			const digitsStr = unscaled.toString()
			if (dropBig > BigInt(digitsStr.length)) {
				return '0'
			}

			const drop = Number(dropBig)
			const splitIdx = digitsStr.length - drop
			let quotient = splitIdx === 0 ? 0n : BigInt(digitsStr.slice(0, splitIdx))
			const firstDropped = digitsStr.charCodeAt(splitIdx) - 48

			let roundUp = false
			if (firstDropped > 5) {
				roundUp = true
			} else if (firstDropped === 5) {
				let hasNonZeroTail = false
				for (let i = splitIdx + 1; i < digitsStr.length; i++) {
					if (digitsStr.charCodeAt(i) !== 48) {
						hasNonZeroTail = true
						break
					}
				}
				if (hasNonZeroTail || (quotient & 1n) === 1n) {
					roundUp = true
				}
			}

			if (roundUp) {
				quotient += 1n
			}
			if (quotient === 0n) {
				return '0'
			}
			unscaled = quotient
			exp10 = targetExp
		}
	}

	if (exp10 > BigInt(MAX_EXPONENT) || exp10 < -BigInt(MAX_EXPONENT)) {
		throw new RangeError(
			`Exponent out of supported range at [${row}][${col}]: ${exp10.toString()}`
		)
	}

	const prefix = sign < 0 ? '-' : ''
	const digits = unscaled.toString()
	const exp = Number(exp10)

	if (exp >= 0) {
		return `${prefix}${digits}${'0'.repeat(exp)}`
	}

	let fracDigits = -exp
	let end = digits.length
	while (fracDigits > 0 && end > 0 && digits.charCodeAt(end - 1) === 48) {
		end--
		fracDigits--
	}

	const trimmedDigits = end === digits.length ? digits : digits.slice(0, end)
	if (fracDigits === 0) {
		return `${prefix}${trimmedDigits}`
	}
	if (trimmedDigits.length > fracDigits) {
		const split = trimmedDigits.length - fracDigits
		return `${prefix}${trimmedDigits.slice(0, split)}.${trimmedDigits.slice(split)}`
	}
	return `${prefix}0.${'0'.repeat(fracDigits - trimmedDigits.length)}${trimmedDigits}`
}

/**
 * Transposes a rectangular matrix of arbitrary-precision decimal strings with
 * optional fractional precision rounding and canonical normalization.
 *
 * All parsing, rounding (round-half-even / banker's rounding), and formatting
 * are performed via exact BigInt decimal arithmetic with zero floating-point
 * conversion. Transposition uses cache-friendly blocked tiling and never
 * mutates the input matrix.
 *
 * @param {readonly (readonly string[])[]} matrix Non-empty rectangular 2D array of decimal strings.
 * @param {number} [precision] Optional non-negative integer specifying the maximum number of
 *   fractional decimal places to retain (rounded half-to-even). When omitted, exact
 *   arbitrary precision is preserved in canonical decimal form.
 * @returns {string[][]} The transposed matrix of canonically normalized decimal strings.
 * @throws {TypeError} If `matrix` is not an array of arrays, an entry is not a string,
 *   or `precision` is not an integer when provided.
 * @throws {RangeError} If `matrix` is empty or ragged, an entry is not a valid decimal
 *   string, an expanded exponent exceeds safe limits, or `precision` is out of range.
 */
export function transposeDecimalStable(matrix, precision) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of decimal strings')
	}
	if (matrix.length === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	if (precision !== undefined) {
		if (typeof precision !== 'number' || !Number.isInteger(precision)) {
			throw new TypeError('precision must be a non-negative integer')
		}
		if (precision < 0 || precision > MAX_PRECISION) {
			throw new RangeError(`precision must be between 0 and ${MAX_PRECISION}`)
		}
	}

	const rows = matrix.length
	if (!Array.isArray(matrix[0])) {
		throw new TypeError('matrix row 0 must be an array')
	}
	const cols = matrix[0].length
	if (cols === 0) {
		throw new RangeError('matrix rows must be non-empty')
	}

	for (let r = 1; r < rows; r++) {
		if (!Array.isArray(matrix[r])) {
			throw new TypeError(`matrix row ${r} must be an array`)
		}
		if (matrix[r].length !== cols) {
			throw new RangeError(
				`matrix must be rectangular: row ${r} has length ${matrix[r].length}, expected ${cols}`
			)
		}
	}

	const result = Array.from({ length: cols }, () => new Array(rows))

	for (let r0 = 0; r0 < rows; r0 += BLOCK_SIZE) {
		const rMax = Math.min(r0 + BLOCK_SIZE, rows)
		for (let c0 = 0; c0 < cols; c0 += BLOCK_SIZE) {
			const cMax = Math.min(c0 + BLOCK_SIZE, cols)
			for (let r = r0; r < rMax; r++) {
				const srcRow = matrix[r]
				for (let c = c0; c < cMax; c++) {
					const parsed = parseDecimal(srcRow[c], r, c)
					result[c][r] = formatDecimal(parsed, precision, r, c)
				}
			}
		}
	}

	return result
}
