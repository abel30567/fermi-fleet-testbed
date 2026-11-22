/**
 * Complex number represented in Cartesian form.
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalizes negative zero (-0) to positive zero (0).
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Multiplies two complex numbers.
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Divides complex number `a` by non-zero complex number `b` using Smith's
 * scaling formula to avoid unnecessary intermediate overflow/underflow.
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexDiv(a, b) {
	if (Math.abs(b.re) >= Math.abs(b.im)) {
		const r = b.im / b.re
		const denom = b.re + b.im * r
		return {
			re: (a.re + a.im * r) / denom,
			im: (a.im - a.re * r) / denom,
		}
	}
	const r = b.re / b.im
	const denom = b.im + b.re * r
	return {
		re: (a.re * r + a.im) / denom,
		im: (a.im * r - a.re) / denom,
	}
}

/**
 * Validates and deep-copies a square matrix of complex numbers `{ re, im }`.
 * @param {Complex[][]} matrix
 * @returns {Complex[][]}
 */
function validateAndCopyMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of complex numbers { re, im }')
	}

	const n = matrix.length

	for (let i = 0; i < n; i++) {
		if (!Array.isArray(matrix[i])) {
			throw new TypeError(`matrix[${i}] must be an array`)
		}
	}

	const copy = new Array(n)

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (row.length !== n) {
			throw new RangeError(`matrix must be square (expected row ${i} length ${n}, got ${row.length})`)
		}

		const rowCopy = new Array(n)
		for (let j = 0; j < n; j++) {
			const entry = row[j]
			if (entry === null || typeof entry !== 'object') {
				throw new TypeError(`matrix[${i}][${j}] must be an object with numeric { re, im } fields`)
			}
			const { re, im } = entry
			if (typeof re !== 'number' || typeof im !== 'number') {
				throw new TypeError(`matrix[${i}][${j}] must have numeric re and im properties`)
			}
			if (!Number.isFinite(re) || !Number.isFinite(im)) {
				throw new RangeError(`matrix[${i}][${j}] must have finite re and im values`)
			}
			rowCopy[j] = { re, im }
		}
		copy[i] = rowCopy
	}

	return copy
}

/**
 * Computes the determinant of a square matrix of complex numbers `{ re, im }`
 * using iterative Gaussian elimination with partial pivoting.
 *
 * The input matrix is not mutated. The determinant of an empty 0x0 matrix is
 * returned as `{ re: 1, im: 0 }`.
 *
 * @param {Complex[][]} matrix - Square n×n matrix of complex numbers `{ re, im }`.
 * @returns {Complex} The complex determinant `{ re, im }`.
 * @throws {TypeError} If `matrix` is not a 2D array or any entry lacks numeric `re`/`im` properties.
 * @throws {RangeError} If `matrix` is not square or any component is non-finite (`NaN`, `±Infinity`).
 */
export function determinantComplexIterative(matrix) {
	const work = validateAndCopyMatrix(matrix)
	const n = work.length

	if (n === 0) {
		return { re: 1, im: 0 }
	}
	if (n === 1) {
		return {
			re: normalizeZero(work[0][0].re),
			im: normalizeZero(work[0][0].im),
		}
	}

	let sign = 1

	for (let col = 0; col < n; col++) {
		// Partial pivoting: choose the row with the largest complex magnitude in column `col`.
		let pivotRow = col
		let maxMag = Math.hypot(work[col][col].re, work[col][col].im)

		for (let row = col + 1; row < n; row++) {
			const mag = Math.hypot(work[row][col].re, work[row][col].im)
			if (mag > maxMag) {
				maxMag = mag
				pivotRow = row
			}
		}

		// Exact zero column below and including the diagonal means the matrix is singular.
		if (maxMag === 0) {
			return { re: 0, im: 0 }
		}

		if (pivotRow !== col) {
			const tmp = work[col]
			work[col] = work[pivotRow]
			work[pivotRow] = tmp
			sign = -sign
		}

		const pivot = work[col][col]

		for (let row = col + 1; row < n; row++) {
			const target = work[row][col]
			if (target.re === 0 && target.im === 0) {
				continue
			}

			const factor = complexDiv(target, pivot)
			work[row][col] = { re: 0, im: 0 }

			for (let k = col + 1; k < n; k++) {
				const prod = complexMul(factor, work[col][k])
				work[row][k] = {
					re: work[row][k].re - prod.re,
					im: work[row][k].im - prod.im,
				}
			}
		}
	}

	let det = { re: sign, im: 0 }
	for (let i = 0; i < n; i++) {
		det = complexMul(det, work[i][i])
	}

	return {
		re: normalizeZero(det.re),
		im: normalizeZero(det.im),
	}
}
