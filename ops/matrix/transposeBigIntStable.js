/**
 * Block size for cache-friendly tiled transposition on large matrices.
 * Tiling reduces cache-line thrashing on the strided output writes while
 * keeping exact BigInt element references untouched.
 *
 * @type {number}
 */
const TILE_SIZE = 32;

/**
 * Computes the exact transpose of a 2D matrix of `BigInt` values.
 *
 * Designed for exact `BigInt` integers as well as fixed-point `BigInt`
 * representations (e.g. values scaled by `10n ** 18n`). Because transposition
 * is an exact index permutation (`B[j][i] = A[i][j]`), every entry is copied
 * verbatim without floating-point conversion, rounding, overflow, or loss of
 * precision (exact error bound of `0n`), preserving fixed-point scaling
 * identically.
 *
 * Uses upfront structural validation followed by cache-blocked (tiled)
 * transposition so large matrices transpose cleanly without mutating the
 * input or sharing row references with it.
 *
 * Empty matrices (`[]`, or `m x 0` matrices such as `[[], []]`) return `[]`.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Dense rectangular `m x n` matrix of `BigInt` values.
 * @returns {bigint[][]} Newly allocated dense `n x m` transposed matrix of `BigInt` values.
 * @throws {TypeError} If `matrix` is not a dense array of dense arrays of `bigint` values.
 * @throws {RangeError} If `matrix` is ragged (rows do not all have the same length).
 */
export function transposeBigIntStable(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(
			`Expected matrix to be an Array, received ${matrix === null ? 'null' : typeof matrix}`,
		);
	}

	const rows = matrix.length;
	if (rows === 0) {
		return [];
	}

	let cols = -1;
	for (let i = 0; i < rows; i++) {
		if (!(i in matrix)) {
			throw new TypeError(`Expected dense matrix: missing row hole at index ${i}`);
		}
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(
				`Expected matrix[${i}] to be an Array, received ${row === null ? 'null' : typeof row}`,
			);
		}
		if (cols === -1) {
			cols = row.length;
		} else if (row.length !== cols) {
			throw new RangeError(
				`Ragged matrix: row ${i} has length ${row.length}, expected ${cols}`,
			);
		}
	}

	if (cols === 0) {
		return [];
	}

	/** @type {bigint[][]} */
	const result = new Array(cols);
	for (let j = 0; j < cols; j++) {
		result[j] = new Array(rows);
	}

	for (let i0 = 0; i0 < rows; i0 += TILE_SIZE) {
		const iEnd = i0 + TILE_SIZE < rows ? i0 + TILE_SIZE : rows;
		for (let j0 = 0; j0 < cols; j0 += TILE_SIZE) {
			const jEnd = j0 + TILE_SIZE < cols ? j0 + TILE_SIZE : cols;
			for (let i = i0; i < iEnd; i++) {
				const srcRow = matrix[i];
				for (let j = j0; j < jEnd; j++) {
					if (!(j in srcRow)) {
						throw new TypeError(
							`Expected dense BigInt row: missing hole at matrix[${i}][${j}]`,
						);
					}
					const value = srcRow[j];
					if (typeof value !== 'bigint') {
						throw new TypeError(
							`Expected bigint at matrix[${i}][${j}], received ${value === null ? 'null' : typeof value}`,
						);
					}
					result[j][i] = value;
				}
			}
		}
	}

	return result;
}
