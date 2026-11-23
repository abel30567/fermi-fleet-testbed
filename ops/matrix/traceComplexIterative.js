/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a finite complex number represented as `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {number} row - Row index for error reporting.
 * @param {number} col - Column index for error reporting.
 * @returns {Complex} The validated complex entry.
 * @throws {TypeError} If the value is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN` or `±Infinity`).
 */
function validateComplex(value, row, col) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Expected complex number { re, im } at [${row}][${col}]`
		)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`Expected numeric re and im properties at [${row}][${col}]`
		)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`Expected finite re and im values at [${row}][${col}]`
		)
	}
	return value
}

/**
 * Computes the trace of a square complex matrix using a straightforward
 * iterative summation along the main diagonal.
 *
 * Each matrix entry must be an object `{ re, im }` with finite numbers `re`
 * (real part) and `im` (imaginary part). For an empty `0 × 0` matrix `[]`,
 * the trace is `{ re: 0, im: 0 }`.
 *
 * @param {readonly (readonly Complex[])[]} matrix - Square `n × n` matrix of complex numbers.
 * @returns {Complex} The trace `{ re, im }` of `matrix` as a new object.
 * @throws {TypeError} If `matrix` is not an array of arrays of `{ re, im }` objects with numeric components.
 * @throws {RangeError} If `matrix` is not square or any entry contains non-finite values.
 */
export function traceComplexIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be an array of rows')
	}

	const n = matrix.length
	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${i} to be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`Expected a square ${n}x${n} matrix, but row ${i} has length ${row.length}`
			)
		}
		for (let j = 0; j < n; j++) {
			validateComplex(row[j], i, j)
		}
	}

	let re = 0
	let im = 0
	for (let i = 0; i < n; i++) {
		re += matrix[i][i].re
		im += matrix[i][i].im
	}

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}
