/**
 * @fileoverview Recursive (divide-and-conquer) matrix trace over closed IEEE-754
 * intervals `[lo, hi]` with directed outward rounding guaranteeing mathematical
 * enclosure.
 */

const f64View = new Float64Array(1)
const u64View = new BigUint64Array(f64View.buffer)

/**
 * Returns the smallest IEEE-754 binary64 value strictly greater than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x
	if (x === -Infinity) return -Number.MAX_VALUE
	if (x === 0) return Number.MIN_VALUE

	f64View[0] = x
	if (x > 0) {
		u64View[0] += 1n
	} else {
		u64View[0] -= 1n
	}
	const result = f64View[0]
	return result === 0 ? 0 : result
}

/**
 * Returns the largest IEEE-754 binary64 value strictly less than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	const result = -nextUp(-x)
	return result === 0 ? 0 : result
}

/**
 * Computes the exact error-free sum `s + e = a + b` using Dekker's FastTwoSum
 * for finite inputs whose rounded sum does not overflow.
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function fastTwoSum(a, b) {
	let x = a
	let y = b
	if (Math.abs(x) < Math.abs(y)) {
		x = b
		y = a
	}
	const s = x + y
	const e = y - (s - x)
	return [s, e]
}

/**
 * Computes `a + b` rounded toward `-Infinity` (greatest float `<= a + b`).
 * Precondition: `a` and `b` are not `+Infinity` and not `NaN`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addDown(a, b) {
	if (a === -Infinity || b === -Infinity) return -Infinity
	const s = a + b
	if (s === Infinity) return Number.MAX_VALUE
	if (s === -Infinity) return -Infinity

	const [sum, err] = fastTwoSum(a, b)
	const result = err < 0 ? nextDown(sum) : sum
	return result === 0 ? 0 : result
}

/**
 * Computes `a + b` rounded toward `+Infinity` (smallest float `>= a + b`).
 * Precondition: `a` and `b` are not `-Infinity` and not `NaN`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addUp(a, b) {
	if (a === Infinity || b === Infinity) return Infinity
	const s = a + b
	if (s === Infinity) return Infinity
	if (s === -Infinity) return -Number.MAX_VALUE

	const [sum, err] = fastTwoSum(a, b)
	const result = err > 0 ? nextUp(sum) : sum
	return result === 0 ? 0 : result
}

/**
 * Adds two intervals with outward rounding so the returned interval encloses
 * `{ x + y | x in a, y in b }`.
 *
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {[number, number]}
 */
function intervalAdd(a, b) {
	return [addDown(a[0], b[0]), addUp(a[1], b[1])]
}

/**
 * Validates that `matrix` is a square 2D array of valid finite `[lo, hi]`
 * intervals with `lo <= hi`.
 *
 * @param {unknown} matrix
 */
function validateIntervalMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of [lo, hi] intervals')
	}
	const n = matrix.length
	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} length ${n}, got ${row.length}`
			)
		}
		for (let j = 0; j < n; j++) {
			const cell = row[j]
			if (!Array.isArray(cell)) {
				throw new TypeError(`matrix[${i}][${j}] must be a [lo, hi] interval array`)
			}
			if (cell.length !== 2) {
				throw new RangeError(
					`matrix[${i}][${j}] must have length 2, got ${cell.length}`
				)
			}
			const [lo, hi] = cell
			if (typeof lo !== 'number' || typeof hi !== 'number') {
				throw new TypeError(
					`matrix[${i}][${j}] bounds must be numbers`
				)
			}
			if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
				throw new RangeError(
					`matrix[${i}][${j}] bounds must be finite numbers`
				)
			}
			if (lo > hi) {
				throw new RangeError(
					`matrix[${i}][${j}] has inverted bounds: lo (${lo}) > hi (${hi})`
				)
			}
		}
	}
}

/**
 * Recursively sums the diagonal intervals of `matrix` over indices `[start, end)`
 * using pairwise divide-and-conquer with outward rounding.
 *
 * @param {[number, number][][]} matrix
 * @param {number} start
 * @param {number} end
 * @returns {[number, number]}
 */
function sumDiagonalRange(matrix, start, end) {
	if (end - start === 1) {
		const [lo, hi] = matrix[start][start]
		return [lo === 0 ? 0 : lo, hi === 0 ? 0 : hi]
	}
	const mid = start + ((end - start) >>> 1)
	const left = sumDiagonalRange(matrix, start, mid)
	const right = sumDiagonalRange(matrix, mid, end)
	return intervalAdd(left, right)
}

/**
 * Computes the trace of a square interval matrix using a recursive
 * divide-and-conquer summation with IEEE-754 outward rounding.
 *
 * Each entry `matrix[i][j]` is a closed interval `[lo, hi]` with finite
 * bounds `lo <= hi`. The returned interval `[traceLo, traceHi]` is guaranteed
 * to enclose the true trace of every real matrix contained in `matrix`:
 *
 *     traceLo <= sum_{i=0}^{n-1} A[i][i] <= traceHi
 *
 * For an empty `0 x 0` matrix `[]`, returns `[0, 0]`.
 *
 * @param {[number, number][][]} matrix Square `n x n` matrix of `[lo, hi]` intervals.
 * @returns {[number, number]} Outward-rounded `[lo, hi]` interval enclosing the matrix trace.
 * @throws {TypeError} If `matrix`, any row, any interval, or any bound has an invalid type.
 * @throws {RangeError} If `matrix` is non-square or any interval has invalid length, non-finite bounds, or `lo > hi`.
 */
export function traceIntervalRecursive(matrix) {
	validateIntervalMatrix(matrix)
	const n = matrix.length
	if (n === 0) {
		return [0, 0]
	}
	return sumDiagonalRange(matrix, 0, n)
}
