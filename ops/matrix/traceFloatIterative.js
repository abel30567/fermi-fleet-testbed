/**
 * Computes the trace of a square matrix of IEEE-754 float64 numbers using a
 * straightforward iterative summation along the main diagonal.
 *
 * The trace of an n x n matrix A is defined as:
 *   tr(A) = sum_{i = 0}^{n - 1} A[i][i]
 *
 * @param {number[][]} matrix - A non-empty square 2D array of finite numbers.
 * @returns {number} The sum of the main diagonal entries of `matrix`.
 * @throws {TypeError} If `matrix` is not a 2D array or contains non-number entries.
 * @throws {RangeError} If `matrix` is empty, not square, or contains non-finite numbers (NaN, +/-Infinity).
 */
export function traceFloatIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of finite numbers')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(`matrix must be square: row ${i} has length ${row.length}, expected ${n}`)
		}
		for (let j = 0; j < n; j++) {
			const value = row[j]
			if (typeof value !== 'number') {
				throw new TypeError(`matrix[${i}][${j}] must be a number`)
			}
			if (!Number.isFinite(value)) {
				throw new RangeError(`matrix[${i}][${j}] must be a finite number`)
			}
		}
	}

	let sum = 0
	for (let i = 0; i < n; i++) {
		sum += matrix[i][i]
	}

	return sum
}
