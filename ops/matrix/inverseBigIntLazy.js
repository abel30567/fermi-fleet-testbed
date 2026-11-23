/**
 * Exact BigInt fixed-point matrix inverse via rational Gauss-Jordan elimination,
 * consuming input iterables and yielding output rows lazily via a generator.
 *
 * All intermediate elimination steps are performed over exact reduced BigInt
 * rationals `(num / den)` with `den > 0n` and `gcd(|num|, den) === 1n`.
 * Output entries are scaled by `scale` (default `10n ** 18n`) using round
 * half-to-even so every entry is within 0.5 ULP of the true inverse entry
 * (and exact whenever the scaled rational is an integer).
 *
 * @module ops/matrix/inverseBigIntLazy
 */

/** Default fixed-point scaling factor (10^18). */
export const SCALE = 10n ** 18n

/** Canonical rational zero (0 / 1). */
const ZERO = [0n, 1n]

/** Canonical rational one (1 / 1). */
const ONE = [1n, 1n]

/**
 * Compute the non-negative greatest common divisor of two BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	while (b !== 0n) {
		const t = a % b
		a = b
		b = t
	}
	return a
}

/**
 * Construct a normalized reduced rational `[num, den]` with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} [den=1n]
 * @returns {[bigint, bigint]}
 */
function rat(num, den = 1n) {
	if (den === 0n) {
		throw new RangeError('Division by zero in rational arithmetic')
	}
	if (num === 0n) return ZERO
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	return [num / g, den / g]
}

/**
 * Exact subtraction `a - b` of two reduced rationals.
 *
 * @param {[bigint, bigint]} a
 * @param {[bigint, bigint]} b
 * @returns {[bigint, bigint]}
 */
function ratSub(a, b) {
	if (b[0] === 0n) return a
	if (a[0] === 0n) return [-b[0], b[1]]
	const g = gcd(a[1], b[1])
	const aDenReduced = a[1] / g
	const bDenReduced = b[1] / g
	const num = a[0] * bDenReduced - b[0] * aDenReduced
	const den = aDenReduced * b[1]
	return rat(num, den)
}

/**
 * Exact multiplication `a * b` of two reduced rationals using cross-cancellation.
 *
 * @param {[bigint, bigint]} a
 * @param {[bigint, bigint]} b
 * @returns {[bigint, bigint]}
 */
function ratMul(a, b) {
	if (a[0] === 0n || b[0] === 0n) return ZERO
	const g1 = gcd(a[0], b[1])
	const g2 = gcd(b[0], a[1])
	return [(a[0] / g1) * (b[0] / g2), (a[1] / g2) * (b[1] / g1)]
}

/**
 * Exact division `a / b` of two reduced rationals.
 *
 * @param {[bigint, bigint]} a
 * @param {[bigint, bigint]} b
 * @returns {[bigint, bigint]}
 */
function ratDiv(a, b) {
	if (b[0] === 0n) {
		throw new RangeError('Division by zero in rational arithmetic')
	}
	if (a[0] === 0n) return ZERO
	const invB = b[0] < 0n ? [-b[1], -b[0]] : [b[1], b[0]]
	return ratMul(a, invB)
}

/**
 * Convert a reduced rational `[num, den]` to a fixed-point BigInt scaled by `scale`,
 * using round half-to-even (banker's rounding).
 *
 * @param {[bigint, bigint]} value
 * @param {bigint} scale
 * @returns {bigint}
 */
function ratToFixed([num, den], scale) {
	if (num === 0n) return 0n
	const scaled = num * scale
	if (den === 1n) return scaled
	const neg = scaled < 0n
	const absScaled = neg ? -scaled : scaled
	let q = absScaled / den
	const r = absScaled % den
	const twiceR = r * 2n
	if (twiceR > den || (twiceR === den && (q & 1n) === 1n)) {
		q += 1n
	}
	return neg ? -q : q
}

/**
 * Check whether a value is a non-string iterable.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isIterableSequence(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value !== 'string' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Internal generator performing lazy consumption, validation, exact rational
 * Gauss-Jordan elimination, and lazy fixed-point row emission.
 *
 * @param {Iterable<Iterable<bigint>>} matrix
 * @param {bigint} scale
 * @returns {Generator<bigint[], void, unknown>}
 */
function* inverseGenerator(matrix, scale) {
	/** @type {[bigint, bigint][][]} */
	const left = []
	let numCols = -1

	for (const rawRow of matrix) {
		if (!isIterableSequence(rawRow)) {
			throw new TypeError(`Matrix row ${left.length} must be an iterable of BigInts`)
		}

		/** @type {[bigint, bigint][]} */
		const row = []
		let colIdx = 0
		for (const entry of rawRow) {
			if (typeof entry !== 'bigint') {
				throw new TypeError(
					`Matrix entry at (${left.length}, ${colIdx}) must be a BigInt, received ${typeof entry}`
				)
			}
			row.push(entry === 0n ? ZERO : [entry, 1n])
			colIdx++
		}

		if (numCols === -1) {
			if (row.length === 0) {
				throw new RangeError('Matrix rows must not be empty')
			}
			numCols = row.length
		} else if (row.length !== numCols) {
			throw new RangeError(
				`Matrix is ragged: expected ${numCols} columns at row ${left.length}, got ${row.length}`
			)
		}

		left.push(row)
	}

	const n = left.length
	if (n === 0) {
		throw new RangeError('Matrix must not be empty')
	}
	if (n !== numCols) {
		throw new RangeError(`Matrix must be square: got ${n}x${numCols}`)
	}

	/** @type {[bigint, bigint][][]} */
	const right = Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? ONE : ZERO))
	)

	// Gauss-Jordan elimination over Q (exact BigInt rationals)
	for (let col = 0; col < n; col++) {
		let pivotRow = -1
		for (let r = col; r < n; r++) {
			if (left[r][col][0] !== 0n) {
				pivotRow = r
				break
			}
		}

		if (pivotRow === -1) {
			throw new RangeError('Matrix is singular and cannot be inverted')
		}

		if (pivotRow !== col) {
			const tmpLeft = left[col]
			left[col] = left[pivotRow]
			left[pivotRow] = tmpLeft

			const tmpRight = right[col]
			right[col] = right[pivotRow]
			right[pivotRow] = tmpRight
		}

		const pivot = left[col][col]
		if (pivot[0] !== 1n || pivot[1] !== 1n) {
			left[col][col] = ONE
			for (let j = col + 1; j < n; j++) {
				if (left[col][j][0] !== 0n) {
					left[col][j] = ratDiv(left[col][j], pivot)
				}
			}
			for (let j = 0; j < n; j++) {
				if (right[col][j][0] !== 0n) {
					right[col][j] = ratDiv(right[col][j], pivot)
				}
			}
		}

		const pivotLeftRow = left[col]
		const pivotRightRow = right[col]

		for (let r = 0; r < n; r++) {
			if (r === col) continue
			const factor = left[r][col]
			if (factor[0] === 0n) continue

			left[r][col] = ZERO
			const targetLeftRow = left[r]
			for (let j = col + 1; j < n; j++) {
				if (pivotLeftRow[j][0] !== 0n) {
					targetLeftRow[j] = ratSub(targetLeftRow[j], ratMul(factor, pivotLeftRow[j]))
				}
			}

			const targetRightRow = right[r]
			for (let j = 0; j < n; j++) {
				if (pivotRightRow[j][0] !== 0n) {
					targetRightRow[j] = ratSub(targetRightRow[j], ratMul(factor, pivotRightRow[j]))
				}
			}
		}
	}

	// Lazily convert and yield each row of the inverse as fixed-point BigInts
	for (let i = 0; i < n; i++) {
		const invRow = right[i]
		const scaledRow = new Array(n)
		for (let j = 0; j < n; j++) {
			scaledRow[j] = ratToFixed(invRow[j], scale)
		}
		yield scaledRow
	}
}

/**
 * Compute the inverse of a square matrix of exact BigInt integers and yield
 * each row of the inverse lazily as fixed-point BigInts scaled by `scale`
 * (default `10n ** 18n`).
 *
 * Input iterables (both the outer row sequence and each inner row sequence) are
 * not consumed until the returned generator is iterated.
 *
 * @param {Iterable<Iterable<bigint>>} matrix - Square matrix of BigInt entries.
 * @param {bigint} [scale=SCALE] - Positive BigInt fixed-point scaling factor (default 10^18).
 * @returns {Generator<bigint[], void, unknown>} Generator yielding each scaled BigInt row of `matrix^-1`.
 * @throws {TypeError} If `matrix` or any row is not an iterable, any entry is not a BigInt, or `scale` is not a BigInt.
 * @throws {RangeError} If `scale <= 0n`, or `matrix` is empty, ragged, non-square, or singular.
 */
export function inverseBigIntLazy(matrix, scale = SCALE) {
	if (!isIterableSequence(matrix)) {
		throw new TypeError('Matrix must be an iterable of row iterables')
	}
	if (typeof scale !== 'bigint') {
		throw new TypeError(`Scale must be a BigInt, received ${typeof scale}`)
	}
	if (scale <= 0n) {
		throw new RangeError('Scale must be a positive BigInt')
	}
	return inverseGenerator(matrix, scale)
}
