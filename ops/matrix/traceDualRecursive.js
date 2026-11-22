/**
 * @typedef {Object} Dual
 * @property {number} v - Primal value (finite real number).
 * @property {number} d - Forward-mode derivative component (finite real number).
 */

/**
 * Validates that a value is a dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} entry - Candidate dual number.
 * @param {number} row - Row index for error reporting.
 * @param {number} col - Column index for error reporting.
 * @throws {TypeError} If the entry is not a non-null non-array object or `v`/`d` are not numbers.
 * @throws {RangeError} If `v` or `d` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
function assertValidDual(entry, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(`Expected dual number object { v, d } at matrix[${row}][${col}]`)
	}
	const { v, d } = entry
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`Expected numeric v and d properties at matrix[${row}][${col}]`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`Expected finite v and d values at matrix[${row}][${col}]`)
	}
}

/**
 * Validates that `matrix` is a non-empty square 2D array of finite dual numbers `{ v, d }`.
 *
 * @param {unknown} matrix - Candidate matrix.
 * @throws {TypeError} If `matrix` or any row is not an array, or any entry is not a valid dual object.
 * @throws {RangeError} If `matrix` is empty, non-square, ragged, or contains non-finite dual components.
 */
function validateDualSquareMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a 2D array of dual numbers')
	}
	const n = matrix.length
	if (n === 0) {
		throw new RangeError('Expected matrix to be non-empty')
	}
	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected matrix[${i}] to be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(`Expected square ${n}x${n} matrix, but row ${i} has length ${row.length}`)
		}
		for (let j = 0; j < n; j++) {
			assertValidDual(row[j], i, j)
		}
	}
}

/**
 * Recursively sums the main diagonal entries over the half-open index range `[lo, hi)`
 * using pairwise divide-and-conquer summation.
 *
 * @param {Dual[][]} matrix - Validated non-empty square matrix of dual numbers.
 * @param {number} lo - Inclusive start index (`0 <= lo < hi`).
 * @param {number} hi - Exclusive end index (`lo < hi <= matrix.length`).
 * @returns {Dual} Sum of diagonal entries `matrix[i][i]` for `lo <= i < hi`.
 */
function sumDiagonalRange(matrix, lo, hi) {
	if (hi - lo === 1) {
		const entry = matrix[lo][lo]
		return { v: entry.v, d: entry.d }
	}
	const mid = lo + Math.floor((hi - lo) / 2)
	const left = sumDiagonalRange(matrix, lo, mid)
	const right = sumDiagonalRange(matrix, mid, hi)
	return {
		v: left.v + right.v,
		d: left.d + right.d,
	}
}

/**
 * Computes the matrix trace (sum of main diagonal entries) of a square `n × n` matrix
 * of dual numbers `{ v, d }`, carrying forward-mode derivatives alongside primal values.
 *
 * Uses a recursive divide-and-conquer summation over the diagonal index range `[lo, hi)`,
 * achieving `O(log n)` recursion depth and pairwise floating-point summation accuracy.
 * Since trace is linear, `d/dt tr(A(t)) = tr(dA/dt)`.
 *
 * @param {Dual[][]} matrix - Non-empty square `n × n` 2D array of finite dual numbers `{ v, d }`.
 * @returns {Dual} The trace as a new dual number `{ v, d }`.
 * @throws {TypeError} If `matrix` or any row is not an array, or any element is not a dual object with numeric `v` and `d`.
 * @throws {RangeError} If `matrix` is empty, non-square, ragged, or contains non-finite `v` or `d` values.
 *
 * @example
 * traceDualRecursive([
 *   [{ v: 2, d: 1 }, { v: 5, d: 0 }],
 *   [{ v: -1, d: 3 }, { v: 4, d: -2 }],
 * ])
 * // => { v: 6, d: -1 }
 */
export function traceDualRecursive(matrix) {
	validateDualSquareMatrix(matrix)
	return sumDiagonalRange(matrix, 0, matrix.length)
}
