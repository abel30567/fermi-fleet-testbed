/**
 * Computes the greatest common divisor of two non-negative BigInts
 * using the iterative Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} Greatest common divisor of `a` and `b`.
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validates that a value is a rational object `{ num: bigint, den: bigint }`
 * with a non-zero denominator.
 *
 * @param {unknown} value - Candidate rational value.
 * @param {number} row - Row index for diagnostic error messages.
 * @param {number} col - Column index for diagnostic error messages.
 * @throws {TypeError} If the entry is not an object with bigint `num` and `den`.
 * @throws {RangeError} If `den === 0n`.
 */
function validateRational(value, row, col) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must be a rational object { num: bigint, den: bigint }`
		)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must have bigint 'num' and 'den' properties`
		)
	}
	if (value.den === 0n) {
		throw new RangeError(
			`Matrix entry at [${row}][${col}] has a zero denominator`
		)
	}
}

/**
 * Normalizes a validated rational `{ num, den }` into canonical lowest terms:
 * `den > 0n`, `gcd(|num|, den) === 1n`, and zero represented as `{ num: 0n, den: 1n }`.
 *
 * @param {{ num: bigint, den: bigint }} r - Validated rational number.
 * @returns {{ num: bigint, den: bigint }} Normalized rational in lowest terms.
 */
function normalizeRational(r) {
	let { num, den } = r
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
 * Adds two normalized exact rationals and returns the sum in lowest terms.
 *
 * Uses the denominator GCD `g = gcd(a.den, b.den)` to minimize intermediate
 * integer sizes and reduces by `gcd(|num|, g)` (since `a` and `b` are already
 * in lowest terms, no other common factors can divide both numerator and lcm).
 *
 * @param {{ num: bigint, den: bigint }} a - Normalized rational addend.
 * @param {{ num: bigint, den: bigint }} b - Normalized rational addend.
 * @returns {{ num: bigint, den: bigint }} Exact sum in lowest terms.
 */
function addRational(a, b) {
	if (a.num === 0n) {
		return { num: b.num, den: b.den }
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den }
	}
	const g = gcdBigInt(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	const num = a.num * bDenReduced + b.num * aDenReduced
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g2 = gcdBigInt(num, g)
	return {
		num: num / g2,
		den: aDenReduced * bDenReduced * (g / g2),
	}
}

/**
 * Recursively sums the main diagonal entries `matrix[i][i]` for `lo <= i < hi`
 * using divide-and-conquer binary splitting.
 *
 * @param {Array<Array<{ num: bigint, den: bigint }>>} matrix - Validated square matrix.
 * @param {number} lo - Inclusive lower diagonal index.
 * @param {number} hi - Exclusive upper diagonal index (`hi > lo`).
 * @returns {{ num: bigint, den: bigint }} Exact partial diagonal sum in lowest terms.
 */
function sumDiagonalRange(matrix, lo, hi) {
	if (hi - lo === 1) {
		return normalizeRational(matrix[lo][lo])
	}
	const mid = lo + Math.floor((hi - lo) / 2)
	const leftSum = sumDiagonalRange(matrix, lo, mid)
	const rightSum = sumDiagonalRange(matrix, mid, hi)
	return addRational(leftSum, rightSum)
}

/**
 * Computes the exact trace (sum of main diagonal entries) of a non-empty square
 * matrix of exact BigInt rationals `{ num: bigint, den: bigint }`.
 *
 * Algorithm:
 * Validates that `matrix` is a non-empty `n x n` square array of valid rational
 * entries, then evaluates `sum_{i=0}^{n-1} matrix[i][i]` using recursive
 * divide-and-conquer binary splitting over the diagonal index range `[lo, hi)`.
 * Balancing additions in a binary tree of depth `O(log n)` reduces intermediate
 * denominator growth compared to linear accumulation while keeping every
 * intermediate and final rational in canonical lowest terms.
 *
 * @param {Array<Array<{ num: bigint, den: bigint }>>} matrix
 *   Non-empty `n x n` square matrix of rational numbers `{ num: bigint, den: bigint }`
 *   with `den !== 0n`. Unreduced entries and negative denominators are accepted.
 * @returns {{ num: bigint, den: bigint }}
 *   Exact trace in lowest terms with `den > 0n`, `gcd(|num|, den) === 1n`,
 *   and zero normalized to `{ num: 0n, den: 1n }`.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or
 *   any matrix entry is not an object with `bigint` `num` and `den` properties.
 * @throws {RangeError} If `matrix` is empty, not square (`row.length !== matrix.length`),
 *   or any matrix entry has `den === 0n`.
 */
export function traceRationalRecursive(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Matrix must be an array of rows')
	}
	const n = matrix.length
	if (n === 0) {
		throw new RangeError('Matrix must be non-empty')
	}

	for (let i = 0; i < n; i++) {
		if (!Array.isArray(matrix[i])) {
			throw new TypeError(`Matrix row ${i} must be an array`)
		}
	}

	for (let i = 0; i < n; i++) {
		if (matrix[i].length !== n) {
			throw new RangeError(
				`Matrix must be square: expected row ${i} to have length ${n}, got ${matrix[i].length}`
			)
		}
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		for (let j = 0; j < n; j++) {
			validateRational(row[j], i, j)
		}
	}

	return sumDiagonalRange(matrix, 0, n)
}
