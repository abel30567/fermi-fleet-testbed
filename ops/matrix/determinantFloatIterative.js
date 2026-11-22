/**
 * Computes the determinant of a square matrix of IEEE-754 float64 numbers
 * using iterative Gaussian elimination with partial pivoting.
 *
 * The input matrix is validated and copied internally, so it is never mutated.
 * Partial pivoting selects the largest-magnitude pivot in each column to reduce
 * floating-point cancellation error.
 *
 * @param {readonly (readonly number[])[]} matrix - A non-empty `n x n` square matrix of finite numbers.
 * @returns {number} The determinant of `matrix` as an IEEE-754 float64 number (with `-0` normalized to `0`).
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any element is not a number.
 * @throws {RangeError} If `matrix` is empty, not square, or contains non-finite numbers (`NaN`, `Infinity`, `-Infinity`).
 */
export function determinantFloatIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of finite numbers')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	const work = new Array(n)
	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			)
		}

		const copyRow = new Array(n)
		for (let j = 0; j < n; j++) {
			const value = row[j]
			if (typeof value !== 'number') {
				throw new TypeError(
					`matrix[${i}][${j}] must be a number, got ${typeof value}`
				)
			}
			if (!Number.isFinite(value)) {
				throw new RangeError(
					`matrix[${i}][${j}] must be a finite number, got ${value}`
				)
			}
			copyRow[j] = value
		}
		work[i] = copyRow
	}

	let sign = 1
	for (let col = 0; col < n; col++) {
		let pivotRow = col
		let maxAbs = Math.abs(work[col][col])

		for (let row = col + 1; row < n; row++) {
			const candidate = Math.abs(work[row][col])
			if (candidate > maxAbs) {
				maxAbs = candidate
				pivotRow = row
			}
		}

		if (maxAbs === 0) {
			return 0
		}

		if (pivotRow !== col) {
			const tmp = work[col]
			work[col] = work[pivotRow]
			work[pivotRow] = tmp
			sign = -sign
		}

		const pivotVal = work[col][col]
		const pivotRowArr = work[col]

		for (let row = col + 1; row < n; row++) {
			const targetRow = work[row]
			const factor = targetRow[col] / pivotVal
			if (factor === 0) {
				continue
			}
			targetRow[col] = 0
			for (let k = col + 1; k < n; k++) {
				targetRow[k] -= factor * pivotRowArr[k]
			}
		}
	}

	let det = sign
	for (let i = 0; i < n; i++) {
		det *= work[i][i]
	}

	return det === 0 ? 0 : det
}
