/**
 * Computes the exact inverse of a square matrix over the rational numbers using
 * iterative Gauss-Jordan elimination on the augmented matrix [A | I].
 *
 * Each entry in the returned matrix is a canonical exact rational object
 * `{ num: BigInt, den: BigInt }` in lowest terms with `den > 0n` (and `den === 1n`
 * when `num === 0n`).
 *
 * Input matrix entries may be `{ num: BigInt, den: BigInt }` (also accepting safe
 * integer numbers for `num`/`den`, or bare `BigInt` / safe integer scalars as
 * shorthand for `{ num, den: 1n }`). The input matrix is never mutated.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 *
 * @param {Array<Array<Rational | bigint | number>>} matrix - Non-empty square matrix (n x n).
 * @returns {Array<Array<Rational>>} Exact inverse matrix with each entry in lowest terms.
 * @throws {TypeError} If `matrix` is not a valid non-empty square matrix of exact rationals.
 * @throws {RangeError} If any rational entry has a zero denominator.
 * @throws {Error} If `matrix` is singular (not invertible).
 */
export function inverseRationalIterative(matrix) {
	if (!Array.isArray(matrix) || matrix.length === 0) {
		throw new TypeError('Input must be a non-empty square 2D array')
	}

	const n = matrix.length
	const aug = new Array(n)

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row) || row.length !== n) {
			throw new TypeError(`Matrix must be square: row ${i} has invalid length`)
		}

		const augRow = new Array(2 * n)
		for (let j = 0; j < n; j++) {
			augRow[j] = toRational(row[j], i, j)
		}
		for (let j = 0; j < n; j++) {
			augRow[n + j] = { num: i === j ? 1n : 0n, den: 1n }
		}
		aug[i] = augRow
	}

	// Iterative Gauss-Jordan elimination on [A | I] -> [I | A^-1]
	for (let col = 0; col < n; col++) {
		let pivotRow = -1
		for (let row = col; row < n; row++) {
			if (aug[row][col].num !== 0n) {
				pivotRow = row
				break
			}
		}

		if (pivotRow === -1) {
			throw new Error('Matrix is singular and cannot be inverted')
		}

		if (pivotRow !== col) {
			const tmp = aug[col]
			aug[col] = aug[pivotRow]
			aug[pivotRow] = tmp
		}

		const pivot = aug[col][col]
		const pivotRowArr = aug[col]
		pivotRowArr[col] = { num: 1n, den: 1n }

		if (pivot.num !== 1n || pivot.den !== 1n) {
			for (let j = col + 1; j < 2 * n; j++) {
				if (pivotRowArr[j].num !== 0n) {
					pivotRowArr[j] = ratDiv(pivotRowArr[j], pivot)
				}
			}
		}

		for (let row = 0; row < n; row++) {
			if (row === col) continue
			const targetRowArr = aug[row]
			const factor = targetRowArr[col]
			if (factor.num === 0n) continue

			targetRowArr[col] = { num: 0n, den: 1n }
			for (let j = col + 1; j < 2 * n; j++) {
				const pivotVal = pivotRowArr[j]
				if (pivotVal.num !== 0n) {
					targetRowArr[j] = ratSub(targetRowArr[j], ratMul(factor, pivotVal))
				}
			}
		}
	}

	const inverse = new Array(n)
	for (let i = 0; i < n; i++) {
		const invRow = new Array(n)
		const augRow = aug[i]
		for (let j = 0; j < n; j++) {
			const entry = augRow[n + j]
			invRow[j] = { num: entry.num, den: entry.den }
		}
		inverse[i] = invRow
	}

	return inverse
}

/**
 * Iterative Euclidean GCD for BigInt values.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcdBigInt(a, b) {
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
 * Normalizes a rational pair (num, den) into lowest terms with den > 0n.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalize(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator cannot be zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcdBigInt(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Validates and converts an integer component (BigInt or safe integer Number) to BigInt.
 * @param {unknown} value
 * @param {string} label
 * @returns {bigint}
 */
function toBigIntComponent(value, label) {
	if (typeof value === 'bigint') {
		return value
	}
	if (typeof value === 'number' && Number.isSafeInteger(value)) {
		return BigInt(value)
	}
	throw new TypeError(`Invalid ${label}: expected BigInt or safe integer`)
}

/**
 * Validates and normalizes a matrix entry into a canonical Rational.
 * @param {unknown} entry
 * @param {number} row
 * @param {number} col
 * @returns {Rational}
 */
function toRational(entry, row, col) {
	if (typeof entry === 'bigint') {
		return { num: entry, den: 1n }
	}
	if (typeof entry === 'number' && Number.isSafeInteger(entry)) {
		return { num: BigInt(entry), den: 1n }
	}
	if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
		if (!('num' in entry) || !('den' in entry)) {
			throw new TypeError(
				`Invalid matrix entry at (${row}, ${col}): expected { num, den }`
			)
		}
		const num = toBigIntComponent(entry.num, `numerator at (${row}, ${col})`)
		const den = toBigIntComponent(entry.den, `denominator at (${row}, ${col})`)
		return normalize(num, den)
	}
	throw new TypeError(
		`Invalid matrix entry at (${row}, ${col}): expected rational { num, den }, BigInt, or safe integer`
	)
}

/**
 * Computes a - b for two normalized rationals.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratSub(a, b) {
	if (b.num === 0n) return { num: a.num, den: a.den }
	if (a.num === 0n) return { num: -b.num, den: b.den }
	const g = gcdBigInt(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	return normalize(a.num * bDenReduced - b.num * aDenReduced, aDenReduced * b.den)
}

/**
 * Computes a * b for two normalized rationals using cross-cancellation.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratMul(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Computes a / b for two normalized rationals.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratDiv(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero')
	}
	if (a.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const invB =
		b.num < 0n ? { num: -b.den, den: -b.num } : { num: b.den, den: b.num }
	return ratMul(a, invB)
}
