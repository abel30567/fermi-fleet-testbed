/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex entry.
 * @param {number} row - Row index for error diagnostics.
 * @param {number} col - Column index for error diagnostics.
 * @throws {TypeError} If `value` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number.
 */
function assertComplexEntry(value, row, col) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`matrix[${row}][${col}] must be a { re, im } object`)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`matrix[${row}][${col}] must have numeric re and im properties`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`matrix[${row}][${col}] must have finite re and im values`)
	}
}

/**
 * Computes the trace of a square complex matrix `A`:
 *
 * `tr(A) = sum_{i=0}^{n-1} A[i][i]`
 *
 * All entries of the matrix are validated to be finite `{ re, im }` complex objects.
 * Diagonal summation uses Neumaier compensated series summation to minimize
 * floating-point cancellation error across large or ill-conditioned diagonals.
 *
 * @param {Complex[][]} matrix - Non-empty square 2D array of finite `{ re, im }` complex numbers.
 * @returns {Complex} The complex trace `{ re, im }`.
 * @throws {TypeError} If `matrix` is not a 2D array of `{ re, im }` objects with numeric parts.
 * @throws {RangeError} If `matrix` is empty, non-square/ragged, contains non-finite numbers, or overflows.
 */
export function traceComplexSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(`matrix must be square: expected row ${i} length ${n}, got ${row.length}`)
		}
		for (let j = 0; j < n; j++) {
			assertComplexEntry(row[j], i, j)
		}
	}

	let reSum = 0
	let reComp = 0
	let imSum = 0
	let imComp = 0

	for (let i = 0; i < n; i++) {
		const { re, im } = matrix[i][i]

		const nextRe = reSum + re
		if (Math.abs(reSum) >= Math.abs(re)) {
			reComp += (reSum - nextRe) + re
		} else {
			reComp += (re - nextRe) + reSum
		}
		reSum = nextRe

		const nextIm = imSum + im
		if (Math.abs(imSum) >= Math.abs(im)) {
			imComp += (imSum - nextIm) + im
		} else {
			imComp += (im - nextIm) + imSum
		}
		imSum = nextIm
	}

	const totalRe = reSum + reComp
	const totalIm = imSum + imComp

	if (!Number.isFinite(totalRe) || !Number.isFinite(totalIm)) {
		throw new RangeError('trace result overflowed finite floating-point range')
	}

	return {
		re: totalRe === 0 ? 0 : totalRe,
		im: totalIm === 0 ? 0 : totalIm,
	}
}
