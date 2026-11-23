/**
 * @typedef {Object} Complex
 * @property {number} re - Real part (finite number).
 * @property {number} im - Imaginary part (finite number).
 */

/**
 * Normalize negative zero to positive zero.
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validate that a value is a finite complex number `{ re, im }`.
 * @param {unknown} entry
 * @param {number} row
 * @param {number} col
 * @returns {void}
 */
function validateComplexEntry(entry, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(`Matrix entry at [${row}][${col}] must be a { re, im } object`)
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (entry)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`Matrix entry at [${row}][${col}] must have numeric re and im properties`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`Matrix entry at [${row}][${col}] must have finite re and im values`)
	}
}

/**
 * Divide two complex numbers `(a + bi) / (c + di)` using Smith's scaling
 * to avoid unnecessary intermediate overflow or underflow.
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @returns {Complex}
 */
function complexDiv(a, b, c, d) {
	if (Math.abs(c) >= Math.abs(d)) {
		const r = d / c
		const denom = c + d * r
		return {
			re: (a + b * r) / denom,
			im: (b - a * r) / denom,
		}
	}
	const r = c / d
	const denom = d + c * r
	return {
		re: (a * r + b) / denom,
		im: (b * r - a) / denom,
	}
}

/**
 * Compute the determinant of a square matrix of complex numbers `{ re, im }`
 * using a straightforward iterative Gaussian elimination algorithm with
 * partial pivoting (by largest modulus).
 *
 * The input matrix is not mutated. The determinant of an empty 0x0 matrix is
 * `{ re: 1, im: 0 }` by convention.
 *
 * @param {ReadonlyArray<ReadonlyArray<Complex>>} matrix - Square n x n matrix of `{ re, im }` objects.
 * @returns {Complex} The determinant as `{ re, im }`.
 * @throws {TypeError} If `matrix` is not an array of arrays of `{ re, im }` objects with numeric parts.
 * @throws {RangeError} If `matrix` is not square or contains non-finite (`NaN`, `Infinity`) values.
 */
export function determinantComplexIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Input must be a 2D array (matrix) of { re, im } objects')
	}

	const n = matrix.length

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Matrix row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(`Matrix must be square: expected row ${i} length ${n}, got ${row.length}`)
		}
		for (let j = 0; j < n; j++) {
			validateComplexEntry(row[j], i, j)
		}
	}

	if (n === 0) {
		return { re: 1, im: 0 }
	}

	if (n === 1) {
		return {
			re: normalizeZero(matrix[0][0].re),
			im: normalizeZero(matrix[0][0].im),
		}
	}

	// Copy real and imaginary parts into working 2D arrays so input is never mutated.
	const workRe = new Array(n)
	const workIm = new Array(n)
	for (let i = 0; i < n; i++) {
		const rRe = new Float64Array(n)
		const rIm = new Float64Array(n)
		const srcRow = matrix[i]
		for (let j = 0; j < n; j++) {
			rRe[j] = srcRow[j].re
			rIm[j] = srcRow[j].im
		}
		workRe[i] = rRe
		workIm[i] = rIm
	}

	let sign = 1

	for (let k = 0; k < n; k++) {
		// Partial pivoting: choose row >= k with maximum modulus in column k.
		let pivotRow = k
		let maxMod = Math.hypot(workRe[k][k], workIm[k][k])

		for (let i = k + 1; i < n; i++) {
			const mod = Math.hypot(workRe[i][k], workIm[i][k])
			if (mod > maxMod) {
				maxMod = mod
				pivotRow = i
			}
		}

		// Exact zero pivot column means the matrix is singular.
		if (maxMod === 0) {
			return { re: 0, im: 0 }
		}

		if (pivotRow !== k) {
			const tmpRe = workRe[k]
			workRe[k] = workRe[pivotRow]
			workRe[pivotRow] = tmpRe

			const tmpIm = workIm[k]
			workIm[k] = workIm[pivotRow]
			workIm[pivotRow] = tmpIm

			sign = -sign
		}

		const pivotRowRe = workRe[k]
		const pivotRowIm = workIm[k]
		const pivRe = pivotRowRe[k]
		const pivIm = pivotRowIm[k]

		for (let i = k + 1; i < n; i++) {
			const rowRe = workRe[i]
			const rowIm = workIm[i]
			const aRe = rowRe[k]
			const aIm = rowIm[k]

			if (aRe === 0 && aIm === 0) {
				continue
			}

			const { re: fRe, im: fIm } = complexDiv(aRe, aIm, pivRe, pivIm)
			rowRe[k] = 0
			rowIm[k] = 0

			for (let j = k + 1; j < n; j++) {
				const pRe = pivotRowRe[j]
				const pIm = pivotRowIm[j]
				// row[j] -= factor * pivotRow[j]
				rowRe[j] -= fRe * pRe - fIm * pIm
				rowIm[j] -= fRe * pIm + fIm * pRe
			}
		}
	}

	let detRe = sign
	let detIm = 0

	for (let k = 0; k < n; k++) {
		const dRe = workRe[k][k]
		const dIm = workIm[k][k]
		const nextRe = detRe * dRe - detIm * dIm
		const nextIm = detRe * dIm + detIm * dRe
		detRe = nextRe
		detIm = nextIm
	}

	return {
		re: normalizeZero(detRe),
		im: normalizeZero(detIm),
	}
}
