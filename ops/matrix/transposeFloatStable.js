/**
 * Cache-blocking tile size (32x32 float64 elements = 8 KiB per tile, fitting in L1 cache).
 */
const BLOCK_SIZE = 32;

/**
 * Validates that the input is a non-empty rectangular 2D array of finite IEEE-754 float64 numbers.
 *
 * @param {unknown} matrix
 * @returns {{ rows: number, cols: number }}
 */
function validateMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of finite numbers');
	}

	const rows = matrix.length;
	if (rows === 0) {
		throw new RangeError('matrix must be non-empty');
	}

	const firstRow = matrix[0];
	if (!Array.isArray(firstRow)) {
		throw new TypeError('matrix row 0 must be an array');
	}

	const cols = firstRow.length;
	if (cols === 0) {
		throw new RangeError('matrix rows must be non-empty');
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
			const value = row[c];
			if (typeof value !== 'number') {
				throw new TypeError(
					`matrix[${r}][${c}] must be a number, received ${typeof value}`,
				);
			}
			if (!Number.isFinite(value)) {
				throw new RangeError(
					`matrix[${r}][${c}] must be a finite IEEE-754 float64 number, received ${value}`,
				);
			}
		}
	}

	return { rows, cols };
}

/**
 * Computes the bit-exact transpose of a 2D matrix of finite IEEE-754 float64 numbers
 * using cache-blocked traversal.
 *
 * Every element is copied directly without intermediate arithmetic, preserving exact
 * IEEE-754 binary64 bit patterns (including `-0`, subnormals, `Number.MIN_VALUE`, and
 * `Number.MAX_VALUE`) with zero rounding error and no row aliasing with the input.
 *
 * @param {readonly (readonly number[])[]} matrix - Non-empty rectangular m x n matrix of finite numbers.
 * @returns {number[][]} Newly allocated n x m transposed matrix with bit-identical entries.
 * @throws {TypeError} If `matrix` is not a 2D array or contains non-number entries.
 * @throws {RangeError} If `matrix` is empty, has empty rows, is ragged, or contains `NaN`/`Infinity`.
 */
export function transposeFloatStable(matrix) {
	const { rows, cols } = validateMatrix(matrix);

	const result = new Array(cols);
	for (let c = 0; c < cols; c++) {
		result[c] = new Array(rows);
	}

	for (let r0 = 0; r0 < rows; r0 += BLOCK_SIZE) {
		const rMax = r0 + BLOCK_SIZE < rows ? r0 + BLOCK_SIZE : rows;
		for (let c0 = 0; c0 < cols; c0 += BLOCK_SIZE) {
			const cMax = c0 + BLOCK_SIZE < cols ? c0 + BLOCK_SIZE : cols;
			for (let r = r0; r < rMax; r++) {
				const srcRow = matrix[r];
				for (let c = c0; c < cMax; c++) {
					result[c][r] = srcRow[c];
				}
			}
		}
	}

	return result;
}
