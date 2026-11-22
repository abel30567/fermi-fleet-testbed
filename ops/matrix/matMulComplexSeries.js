/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validate that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} name
 * @param {number} row
 * @param {number} col
 */
function assertComplex(value, name, row, col) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(
			`${name}[${row}][${col}] must be a complex number object { re, im }`,
		)
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (value)
	if (typeof re !== 'number' || !Number.isFinite(re)) {
		throw new TypeError(`${name}[${row}][${col}].re must be a finite number`)
	}
	if (typeof im !== 'number' || !Number.isFinite(im)) {
		throw new TypeError(`${name}[${row}][${col}].im must be a finite number`)
	}
}

/**
 * Validate that a value is a non-empty rectangular 2D array of finite complex numbers.
 *
 * @param {unknown} matrix
 * @param {string} name
 * @returns {{ rows: number, cols: number }}
 */
function validateComplexMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of complex numbers`)
	}
	if (matrix.length === 0) {
		throw new RangeError(`${name} must be a non-empty 2D array`)
	}

	let cols = -1
	for (let i = 0; i < matrix.length; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${i}] must be an array`)
		}
		if (row.length === 0) {
			throw new RangeError(`${name}[${i}] must be non-empty`)
		}
		if (cols === -1) {
			cols = row.length
		} else if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular: row ${i} has length ${row.length}, expected ${cols}`,
			)
		}
		for (let j = 0; j < cols; j++) {
			assertComplex(row[j], name, i, j)
		}
	}

	return { rows: matrix.length, cols }
}

/**
 * Multiply two complex matrices `A` (m × n) and `B` (n × p) where each entry
 * is a complex number `{ re, im }`.
 *
 * Uses the exact bilinear finite-series definition:
 * `C[i][j] = sum_{k=0}^{n-1} A[i][k] * B[k][j]`,
 * with `(a_re + i a_im)(b_re + i b_im) = (a_re b_re - a_im b_im) + i(a_re b_im + a_im b_re)`.
 *
 * @param {Complex[][]} A - Left m × n complex matrix.
 * @param {Complex[][]} B - Right n × p complex matrix.
 * @returns {Complex[][]} Product m × p complex matrix `C = A * B`.
 * @throws {TypeError} If `A` or `B` is not a 2D array of finite `{ re, im }` objects.
 * @throws {RangeError} If `A` or `B` is empty, ragged, or has incompatible inner dimensions (`cols(A) !== rows(B)`).
 */
export function matMulComplexSeries(A, B) {
	const dimA = validateComplexMatrix(A, 'A')
	const dimB = validateComplexMatrix(B, 'B')

	if (dimA.cols !== dimB.rows) {
		throw new RangeError(
			`Incompatible matrix dimensions: A is ${dimA.rows}x${dimA.cols}, B is ${dimB.rows}x${dimB.cols}`,
		)
	}

	const m = dimA.rows
	const n = dimA.cols
	const p = dimB.cols

	/** @type {Complex[][]} */
	const C = new Array(m)

	for (let i = 0; i < m; i++) {
		const rowA = A[i]
		/** @type {Complex[]} */
		const rowC = new Array(p)
		for (let j = 0; j < p; j++) {
			let re = 0
			let im = 0
			for (let k = 0; k < n; k++) {
				const a = rowA[k]
				const b = B[k][j]
				re += a.re * b.re - a.im * b.im
				im += a.re * b.im + a.im * b.re
			}
			rowC[j] = {
				re: re === 0 ? 0 : re,
				im: im === 0 ? 0 : im,
			}
		}
		C[i] = rowC
	}

	return C
}
