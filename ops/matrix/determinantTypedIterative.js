/**
 * Computes the determinant of a square matrix stored in row-major order in a
 * Float64Array using straightforward iterative Gaussian elimination with
 * partial pivoting.
 *
 * The input Float64Array is never mutated.
 *
 * @param {Float64Array} matrix - Flat row-major square matrix of length `n * n`.
 * @param {number} [n] - Optional matrix dimension (number of rows/columns).
 *   When omitted, inferred as `Math.sqrt(matrix.length)`.
 * @returns {number} The determinant of the matrix (1 for a 0x0 matrix).
 * @throws {TypeError} If `matrix` is not a Float64Array, or `n` is provided and not an integer.
 * @throws {RangeError} If `n` is negative, `matrix.length` is not a perfect square,
 *   or `matrix.length !== n * n`.
 */
export function determinantTypedIterative(matrix, n) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('Expected matrix to be a Float64Array');
	}

	let size;
	if (n === undefined) {
		size = Math.round(Math.sqrt(matrix.length));
		if (size * size !== matrix.length) {
			throw new RangeError(
				`Expected matrix length to be a perfect square (n * n), got ${matrix.length}`,
			);
		}
	} else {
		if (typeof n !== 'number' || !Number.isInteger(n)) {
			throw new TypeError('Expected matrix dimension n to be an integer');
		}
		if (n < 0) {
			throw new RangeError(`Expected matrix dimension n to be non-negative, got ${n}`);
		}
		if (matrix.length !== n * n) {
			throw new RangeError(
				`Expected matrix length ${n * n} for dimension ${n}, got ${matrix.length}`,
			);
		}
		size = n;
	}

	if (size === 0) {
		return 1;
	}

	// Copy into a working buffer while checking for NaN entries so NaN is never
	// masked by an early zero-pivot exit.
	const work = new Float64Array(matrix.length);
	for (let i = 0; i < matrix.length; i++) {
		const value = matrix[i];
		if (Number.isNaN(value)) {
			return Number.NaN;
		}
		work[i] = value;
	}

	if (size === 1) {
		const det = work[0];
		return det === 0 ? 0 : det;
	}

	if (size === 2) {
		const det = work[0] * work[3] - work[1] * work[2];
		return det === 0 ? 0 : det;
	}

	let sign = 1;
	let det = 1;

	for (let col = 0; col < size; col++) {
		// Partial pivoting: select the row with the largest absolute value in `col`.
		let pivotRow = col;
		let maxAbs = Math.abs(work[col * size + col]);
		for (let row = col + 1; row < size; row++) {
			const candidateAbs = Math.abs(work[row * size + col]);
			if (candidateAbs > maxAbs) {
				maxAbs = candidateAbs;
				pivotRow = row;
			}
		}

		if (maxAbs === 0) {
			return 0;
		}

		if (pivotRow !== col) {
			const colRowOffset = col * size;
			const pivotRowOffset = pivotRow * size;
			for (let k = col; k < size; k++) {
				const tmp = work[colRowOffset + k];
				work[colRowOffset + k] = work[pivotRowOffset + k];
				work[pivotRowOffset + k] = tmp;
			}
			sign = -sign;
		}

		const colRowOffset = col * size;
		const pivot = work[colRowOffset + col];
		det *= pivot;

		for (let row = col + 1; row < size; row++) {
			const rowOffset = row * size;
			const factor = work[rowOffset + col] / pivot;
			if (factor === 0) {
				continue;
			}
			work[rowOffset + col] = 0;
			for (let k = col + 1; k < size; k++) {
				work[rowOffset + k] -= factor * work[colRowOffset + k];
			}
		}
	}

	const result = sign * det;
	return result === 0 ? 0 : result;
}
