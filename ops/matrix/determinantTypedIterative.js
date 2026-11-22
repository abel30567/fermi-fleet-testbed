/**
 * Computes the determinant of an n × n real matrix stored in row-major order
 * inside a Float64Array, using iterative Gaussian elimination with partial
 * pivoting.
 *
 * The input Float64Array is never mutated; elimination operates on an internal
 * Float64Array copy.
 *
 * Algorithm:
 * 1. Validate inputs and copy `matrix` into a working Float64Array of length n².
 * 2. For each column `col` from 0 to n - 1:
 *    - Search rows `col .. n - 1` for the pivot row with maximum |entry|.
 *    - If the largest pivot magnitude is 0, the matrix is singular; return 0.
 *    - If `pivotRow !== col`, swap rows `col` and `pivotRow` (from column `col`
 *      onward) and negate the running determinant sign.
 *    - Multiply the running determinant by the pivot element.
 *    - Eliminate all entries below the pivot in column `col`.
 * 3. Return the accumulated determinant (normalizing -0 to 0).
 *
 * Time complexity: O(n³). Space complexity: O(n²).
 *
 * @param {Float64Array} matrix - Row-major Float64Array of length n * n containing finite values.
 * @param {number} [n] - Optional non-negative integer matrix dimension. If omitted, inferred as
 *   sqrt(matrix.length).
 * @returns {number} The determinant of the matrix (1 for a 0 × 0 matrix).
 * @throws {TypeError} If `matrix` is not a Float64Array, or if `n` is provided and not a number.
 * @throws {RangeError} If `n` is negative or non-integer, if `matrix.length !== n * n`
 *   (or not a perfect square when `n` is omitted), or if any element is NaN or ±Infinity.
 */
export function determinantTypedIterative(matrix, n) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('matrix must be a Float64Array')
	}

	const len = matrix.length
	let size

	if (n === undefined) {
		size = Math.round(Math.sqrt(len))
		if (size * size !== len) {
			throw new RangeError(
				`matrix length (${len}) must be a perfect square (n * n) when n is omitted`
			)
		}
	} else {
		if (typeof n !== 'number') {
			throw new TypeError('n must be a number')
		}
		if (!Number.isInteger(n) || n < 0) {
			throw new RangeError('n must be a non-negative integer')
		}
		if (n * n !== len) {
			throw new RangeError(
				`matrix length (${len}) does not match n * n (${n * n})`
			)
		}
		size = n
	}

	// Copy into working buffer while validating that all entries are finite.
	const work = new Float64Array(len)
	for (let i = 0; i < len; i++) {
		const value = matrix[i]
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`matrix element at index ${i} must be a finite number`
			)
		}
		work[i] = value
	}

	if (size === 0) {
		return 1
	}

	let det = 1

	for (let col = 0; col < size; col++) {
		// Partial pivoting: locate row >= col with largest absolute entry in `col`.
		let pivotRow = col
		let maxAbs = Math.abs(work[col * size + col])

		for (let row = col + 1; row < size; row++) {
			const candidateAbs = Math.abs(work[row * size + col])
			if (candidateAbs > maxAbs) {
				maxAbs = candidateAbs
				pivotRow = row
			}
		}

		// Exact zero pivot column means the matrix is singular.
		if (maxAbs === 0) {
			return 0
		}

		// Swap pivot row into position `col` if needed; each swap flips sign.
		if (pivotRow !== col) {
			const colOffset = col * size
			const pivotOffset = pivotRow * size
			for (let k = col; k < size; k++) {
				const tmp = work[colOffset + k]
				work[colOffset + k] = work[pivotOffset + k]
				work[pivotOffset + k] = tmp
			}
			det = -det
		}

		const pivotRowOffset = col * size
		const pivot = work[pivotRowOffset + col]
		det *= pivot

		// Eliminate entries below the pivot in column `col`.
		for (let row = col + 1; row < size; row++) {
			const rowOffset = row * size
			const factor = work[rowOffset + col] / pivot
			if (factor === 0) {
				continue
			}
			work[rowOffset + col] = 0
			for (let k = col + 1; k < size; k++) {
				work[rowOffset + k] -= factor * work[pivotRowOffset + k]
			}
		}
	}

	return det === 0 ? 0 : det
}
