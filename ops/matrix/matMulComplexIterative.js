/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {string} label - Matrix label for error messages.
 * @param {number} row - Row index for error messages.
 * @param {number} col - Column index for error messages.
 * @returns {Complex} The validated complex number.
 */
function validateComplexEntry(value, label, row, col) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`${label}[${row}][${col}] must be a complex number object { re, im }`
		)
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (value)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`${label}[${row}][${col}] must have numeric re and im properties`
		)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`${label}[${row}][${col}] must have finite re and im values`
		)
	}
	return /** @type {Complex} */ (value)
}

/**
 * Validates a 2D complex matrix and returns its dimensions `{ rows, cols }`.
 *
 * @param {unknown} matrix - Candidate 2D matrix of complex numbers.
 * @param {string} label - Parameter name for error messages.
 * @returns {{ rows: number, cols: number }} Dimensions of the validated matrix.
 */
function validateComplexMatrix(matrix, label) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${label} must be a 2D array of complex numbers`)
	}
	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError(`${label} must have at least one row`)
	}

	let cols = -1
	for (let r = 0; r < rows; r++) {
		const row = matrix[r]
		if (!Array.isArray(row)) {
			throw new TypeError(`${label}[${r}] must be an array`)
		}
		if (r === 0) {
			cols = row.length
			if (cols === 0) {
				throw new RangeError(`${label} must have at least one column`)
			}
		} else if (row.length !== cols) {
			throw new RangeError(
				`${label} must be rectangular: row ${r} has length ${row.length}, expected ${cols}`
			)
		}
		for (let c = 0; c < cols; c++) {
			validateComplexEntry(row[c], label, r, c)
		}
	}

	return { rows, cols }
}

/**
 * Multiplies two complex matrices `a` (m x k) and `b` (k x n) where each entry
 * is a complex number object `{ re, im }`, using a straightforward iterative
 * triple-loop algorithm.
 *
 * Does not mutate the input matrices.
 *
 * @param {Complex[][]} a - Left-hand complex matrix of shape m x k.
 * @param {Complex[][]} b - Right-hand complex matrix of shape k x n.
 * @returns {Complex[][]} Product complex matrix of shape m x n.
 * @throws {TypeError} If either input is not a 2D array of `{ re, im }` objects with numeric parts.
 * @throws {RangeError} If either matrix is empty, ragged, contains non-finite values, or has incompatible dimensions.
 */
export function matMulComplexIterative(a, b) {
	const dimA = validateComplexMatrix(a, 'a')
	const dimB = validateComplexMatrix(b, 'b')

	if (dimA.cols !== dimB.rows) {
		throw new RangeError(
			`Incompatible matrix dimensions: (${dimA.rows}x${dimA.cols}) cannot be multiplied by (${dimB.rows}x${dimB.cols})`
		)
	}

	const m = dimA.rows
	const k = dimA.cols
	const n = dimB.cols

	/** @type {Complex[][]} */
	const result = new Array(m)

	for (let i = 0; i < m; i++) {
		const rowA = a[i]
		/** @type {Complex[]} */
		const outRow = new Array(n)
		for (let j = 0; j < n; j++) {
			let sumRe = 0
			let sumIm = 0
			for (let p = 0; p < k; p++) {
				const left = rowA[p]
				const right = b[p][j]
				sumRe += left.re * right.re - left.im * right.im
				sumIm += left.re * right.im + left.im * right.re
			}
			outRow[j] = {
				re: sumRe === 0 ? 0 : sumRe,
				im: sumIm === 0 ? 0 : sumIm
			}
		}
		result[i] = outRow
	}

	return result
}
