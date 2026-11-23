/**
 * Computes the transpose of a row-major 2D matrix stored in a {@link Float64Array}.
 *
 * Uses the closed-form row-major index permutation:
 * `out[c * rows + r] = matrix[r * cols + c]`
 * for `0 <= r < rows` and `0 <= c < cols`, returning a new {@link Float64Array}
 * representing the `cols x rows` transposed matrix without mutating the input.
 *
 * When both `rows` and `cols` are omitted, `matrix` is interpreted as a square
 * `n x n` matrix where `n = Math.sqrt(matrix.length)` must be a positive integer.
 *
 * @param {Float64Array} matrix - Row-major input matrix of length `rows * cols`.
 * @param {number} [rows] - Number of rows (positive safe integer). Omit together with `cols` for square matrices.
 * @param {number} [cols] - Number of columns (positive safe integer). Omit together with `rows` for square matrices.
 * @returns {Float64Array} A new `Float64Array` containing the `cols x rows` transposed matrix in row-major order.
 * @throws {TypeError} If `matrix` is not a `Float64Array`, or if only one of `rows`/`cols` is provided or either is not a number.
 * @throws {RangeError} If dimensions are non-positive, non-integer, not safe integers, not a perfect square when omitted, or `rows * cols !== matrix.length`.
 */
export function transposeTypedSeries(matrix, rows, cols) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('matrix must be a Float64Array');
	}

	const len = matrix.length;
	let rCount;
	let cCount;

	if (rows === undefined && cols === undefined) {
		if (len === 0) {
			throw new RangeError('matrix must be non-empty');
		}
		const n = Math.round(Math.sqrt(len));
		if (n * n !== len) {
			throw new RangeError(
				`When rows and cols are omitted, matrix.length (${len}) must be a positive perfect square`,
			);
		}
		rCount = n;
		cCount = n;
	} else {
		if (typeof rows !== 'number' || typeof cols !== 'number') {
			throw new TypeError('rows and cols must both be numbers when specified');
		}
		if (!Number.isSafeInteger(rows) || rows <= 0 || !Number.isSafeInteger(cols) || cols <= 0) {
			throw new RangeError('rows and cols must be positive safe integers');
		}
		if (rows * cols !== len) {
			throw new RangeError(
				`Dimension mismatch: rows * cols (${rows * cols}) does not equal matrix.length (${len})`,
			);
		}
		rCount = rows;
		cCount = cols;
	}

	const out = new Float64Array(len);
	for (let r = 0; r < rCount; r++) {
		const rowOffset = r * cCount;
		for (let c = 0; c < cCount; c++) {
			out[c * rCount + r] = matrix[rowOffset + c];
		}
	}

	return out;
}
