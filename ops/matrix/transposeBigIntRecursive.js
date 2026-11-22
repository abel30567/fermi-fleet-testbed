/**
 * Fixed-point scaling factor (10^18) used across BigInt math operations
 * when representing non-integer values. Matrix transposition is an exact
 * element-preserving permutation, so both unscaled integers and SCALE-scaled
 * fixed-point BigInts are transposed without loss of precision.
 */
export const SCALE = 10n ** 18n;

/**
 * Recursively transposes a submatrix of `src` into `dst` using cache-oblivious
 * divide-and-conquer splitting along the longer dimension.
 *
 * Recursion depth is bounded by ceil(log2(rowCount)) + ceil(log2(colCount)),
 * avoiding stack overflow even for very large matrices or long vectors.
 *
 * @param {bigint[][]} src - Source matrix.
 * @param {bigint[][]} dst - Pre-allocated destination matrix of transposed dimensions.
 * @param {number} rowStart - Starting row index in `src`.
 * @param {number} rowCount - Number of rows in the current submatrix.
 * @param {number} colStart - Starting column index in `src`.
 * @param {number} colCount - Number of columns in the current submatrix.
 */
function transposeBlock(src, dst, rowStart, rowCount, colStart, colCount) {
	if (rowCount === 1 && colCount === 1) {
		dst[colStart][rowStart] = src[rowStart][colStart];
		return;
	}

	if (rowCount >= colCount) {
		const mid = rowCount >>> 1;
		transposeBlock(src, dst, rowStart, mid, colStart, colCount);
		transposeBlock(src, dst, rowStart + mid, rowCount - mid, colStart, colCount);
	} else {
		const mid = colCount >>> 1;
		transposeBlock(src, dst, rowStart, rowCount, colStart, mid);
		transposeBlock(src, dst, rowStart, rowCount, colStart + mid, colCount - mid);
	}
}

/**
 * Computes the transpose of a 2D rectangular matrix of exact BigInt values
 * using a cache-oblivious recursive divide-and-conquer algorithm.
 *
 * For an m x n matrix A, returns an n x m matrix A^T such that:
 *   A^T[j][i] === A[i][j] for all 0 <= i < m, 0 <= j < n.
 *
 * Because transposition only permutes entries and performs no divisions,
 * results are exact BigInts with zero rounding error (preserving any
 * fixed-point 10^18 scaling already present in the input entries).
 *
 * Algorithm:
 *   Recursively bisects the larger dimension (rows or columns) of the active
 *   submatrix until reaching 1 x 1 base blocks, writing each entry directly
 *   to its transposed coordinate in the pre-allocated output matrix.
 *   Time complexity: O(m * n). Auxiliary call-stack depth: O(log m + log n).
 *
 * @param {bigint[][]} matrix - Rectangular 2D array of BigInt values (or empty array `[]`).
 * @returns {bigint[][]} The transposed matrix (returns `[]` for an empty input `[]`).
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any element is not a `bigint`.
 * @throws {RangeError} If rows are empty (`cols === 0`) or rows do not all have the same length (ragged matrix).
 */
export function transposeBigIntRecursive(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of BigInt values');
	}

	const rows = matrix.length;
	if (rows === 0) {
		return [];
	}

	if (!Array.isArray(matrix[0])) {
		throw new TypeError('matrix row 0 must be an array');
	}

	const cols = matrix[0].length;
	if (cols === 0) {
		throw new RangeError('matrix rows must be non-empty (at least 1 column)');
	}

	for (let r = 0; r < rows; r++) {
		const row = matrix[r];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${r} must be an array`);
		}
		if (row.length !== cols) {
			throw new RangeError(
				`matrix must be rectangular: row ${r} has length ${row.length}, expected ${cols}`,
			);
		}
		for (let c = 0; c < cols; c++) {
			if (typeof row[c] !== 'bigint') {
				throw new TypeError(
					`matrix[${r}][${c}] must be a BigInt, received ${typeof row[c]}`,
				);
			}
		}
	}

	const result = Array.from({ length: cols }, () => new Array(rows));
	transposeBlock(matrix, result, 0, rows, 0, cols);
	return result;
}
