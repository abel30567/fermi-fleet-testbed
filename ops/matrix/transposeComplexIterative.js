/**
 * Computes the algebraic transpose (A^T) of a matrix of complex numbers
 * represented as `{ re, im }` objects using a straightforward iterative algorithm.
 *
 * Note: This computes the plain transpose (preserving imaginary signs), not the
 * conjugate (Hermitian) transpose. Each entry in the returned matrix is a fresh
 * `{ re, im }` object, leaving the input matrix unmodified.
 *
 * @param {Array<Array<{ re: number, im: number }>>} matrix - Rectangular 2D array of complex numbers.
 * @returns {Array<Array<{ re: number, im: number }>>} The transposed complex matrix.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any entry is not a valid `{ re: number, im: number }` object.
 * @throws {RangeError} If rows do not all have the same length (ragged matrix), or any `re`/`im` component is non-finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function transposeComplexIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be an array of rows.');
	}

	const rows = matrix.length;
	if (rows === 0) {
		return [];
	}

	let cols = -1;
	for (let i = 0; i < rows; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${i} to be an array.`);
		}

		if (cols === -1) {
			cols = row.length;
		} else if (row.length !== cols) {
			throw new RangeError(
				`Ragged matrix: row ${i} has length ${row.length}, expected ${cols}.`,
			);
		}

		for (let j = 0; j < cols; j++) {
			const cell = row[j];
			if (cell === null || typeof cell !== 'object' || Array.isArray(cell)) {
				throw new TypeError(
					`Expected entry at [${i}][${j}] to be a { re, im } complex number object.`,
				);
			}
			if (typeof cell.re !== 'number' || typeof cell.im !== 'number') {
				throw new TypeError(
					`Expected numeric re and im properties at [${i}][${j}].`,
				);
			}
			if (!Number.isFinite(cell.re) || !Number.isFinite(cell.im)) {
				throw new RangeError(
					`Expected finite re and im values at [${i}][${j}].`,
				);
			}
		}
	}

	if (cols === 0) {
		return [];
	}

	const transposed = new Array(cols);
	for (let j = 0; j < cols; j++) {
		const outRow = new Array(rows);
		for (let i = 0; i < rows; i++) {
			const entry = matrix[i][j];
			outRow[i] = { re: entry.re, im: entry.im };
		}
		transposed[j] = outRow;
	}

	return transposed;
}
