/**
 * Computes the trace (sum of main diagonal elements) of a square matrix stored
 * in a flat `Float64Array` (row-major or column-major order) using a
 * straightforward iterative loop.
 *
 * For an `n x n` matrix `A`, `trace(A) = sum_{i=0}^{n-1} A[i * n + i]`.
 * An empty `0 x 0` matrix has a trace of `0`.
 *
 * @param {Float64Array} matrix - Flat `Float64Array` of length `n * n` holding matrix entries.
 * @param {number} [size] - Optional explicit matrix dimension `n` (must satisfy `matrix.length === n * n`).
 * @returns {number} The sum of the elements on the main diagonal.
 * @throws {TypeError} If `matrix` is not a `Float64Array`.
 * @throws {RangeError} If `size` is not a non-negative integer, or if `matrix.length` does not match a square matrix.
 */
export function traceTypedIterative(matrix, size) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('matrix must be a Float64Array');
	}

	let n;
	if (size !== undefined) {
		if (typeof size !== 'number' || !Number.isInteger(size) || size < 0) {
			throw new RangeError('size must be a non-negative integer');
		}
		if (matrix.length !== size * size) {
			throw new RangeError(
				`matrix length (${matrix.length}) must equal size * size (${size * size})`,
			);
		}
		n = size;
	} else {
		n = Math.round(Math.sqrt(matrix.length));
		if (n * n !== matrix.length) {
			throw new RangeError(
				`matrix length (${matrix.length}) must be a perfect square (n * n)`,
			);
		}
	}

	let sum = 0;
	for (let i = 0; i < n; i++) {
		sum += matrix[i * n + i];
	}
	return sum;
}
