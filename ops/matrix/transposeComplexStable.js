/**
 * @typedef {Object} Complex
 * @property {number} re - Finite real part.
 * @property {number} im - Finite imaginary part.
 */

/**
 * @typedef {Object} TransposeOptions
 * @property {boolean} [conjugate=false] - When `true`, computes the Hermitian
 *   (conjugate) transpose `A^H`; when `false` (default), computes the ordinary
 *   transpose `A^T`.
 */

/** Cache-blocking tile size for large matrix transposition. */
const BLOCK_SIZE = 32

/**
 * Canonicalizes signed zero so `-0` becomes `+0` while preserving every other
 * IEEE 754 finite value bit-for-bit (including subnormals and `Number.MAX_VALUE`).
 *
 * @param {number} value
 * @returns {number}
 */
function canonicalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates that a matrix entry is a complex object `{ re, im }` with finite
 * numeric components.
 *
 * @param {unknown} entry
 * @param {number} rowIndex
 * @param {number} colIndex
 * @throws {TypeError} If the entry is not an object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplexEntry(entry, rowIndex, colIndex) {
	if (entry === null || typeof entry !== 'object') {
		throw new TypeError(
			`Expected complex object { re, im } at [${rowIndex}][${colIndex}]`,
		)
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (entry)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`Expected numeric re and im properties at [${rowIndex}][${colIndex}]`,
		)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`Expected finite re and im values at [${rowIndex}][${colIndex}]`,
		)
	}
}

/**
 * Computes the transpose (`A^T`) or Hermitian conjugate transpose (`A^H`) of a
 * complex matrix represented as a rectangular 2D array of `{ re, im }` objects.
 *
 * Numerical stability guarantees:
 * - Zero rounding error (0 ulp): transposition only permutes indices and, for
 *   conjugate transpose, flips the IEEE 754 sign bit of `im`.
 * - No overflow or underflow: subnormal numbers (down to `Number.MIN_VALUE`)
 *   and extreme finite values (up to `±Number.MAX_VALUE`) are preserved exactly.
 * - Signed-zero canonicalization: `-0` is normalized to `+0` on both `re` and
 *   `im` (including after imaginary-part negation).
 * - Immutability: the input matrix and its entry objects are never mutated, and
 *   every output entry is freshly allocated.
 * - Cache-friendly tiled traversal for large matrices (`O(m * n)` time and space).
 *
 * @param {readonly (readonly Complex[])[]} matrix - Non-empty rectangular `m x n`
 *   matrix of complex `{ re, im }` entries.
 * @param {TransposeOptions} [options] - Optional configuration.
 * @returns {Complex[][]} Newly allocated `n x m` transposed complex matrix.
 * @throws {TypeError} If `matrix` is not an array of arrays of `{ re, im }`
 *   objects with numeric fields, or if `options` is malformed.
 * @throws {RangeError} If `matrix` is empty (`0` rows or `0` columns), ragged,
 *   or contains non-finite (`NaN`, `±Infinity`) components.
 */
export function transposeComplexStable(matrix, options) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a 2D array')
	}

	let conjugate = false
	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('Expected options to be a plain object')
		}
		if (options.conjugate !== undefined) {
			if (typeof options.conjugate !== 'boolean') {
				throw new TypeError('Expected options.conjugate to be a boolean')
			}
			conjugate = options.conjugate
		}
	}

	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError('Expected non-empty matrix')
	}

	const firstRow = matrix[0]
	if (!Array.isArray(firstRow)) {
		throw new TypeError('Expected matrix row 0 to be an array')
	}

	const cols = firstRow.length
	if (cols === 0) {
		throw new RangeError('Expected matrix rows to be non-empty')
	}

	// Validate rectangular structure and finite complex entries before allocating output.
	for (let i = 0; i < rows; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected matrix row ${i} to be an array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`Expected rectangular matrix: row ${i} has length ${row.length}, expected ${cols}`,
			)
		}
		for (let j = 0; j < cols; j++) {
			validateComplexEntry(row[j], i, j)
		}
	}

	/** @type {Complex[][]} */
	const result = new Array(cols)
	for (let j = 0; j < cols; j++) {
		result[j] = new Array(rows)
	}

	// Cache-blocked transposition preserving exact IEEE 754 bits (with -0 -> +0).
	for (let i0 = 0; i0 < rows; i0 += BLOCK_SIZE) {
		const iMax = Math.min(i0 + BLOCK_SIZE, rows)
		for (let j0 = 0; j0 < cols; j0 += BLOCK_SIZE) {
			const jMax = Math.min(j0 + BLOCK_SIZE, cols)
			for (let i = i0; i < iMax; i++) {
				const srcRow = matrix[i]
				for (let j = j0; j < jMax; j++) {
					const entry = srcRow[j]
					const re = canonicalizeZero(entry.re)
					const im = conjugate
						? canonicalizeZero(-entry.im)
						: canonicalizeZero(entry.im)
					result[j][i] = { re, im }
				}
			}
		}
	}

	return result
}
