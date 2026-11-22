/**
 * Computes the inverse of a square matrix of IEEE-754 float64 numbers using
 * iterative Gauss-Jordan elimination with partial pivoting.
 *
 * The input matrix is never mutated. A new `n x n` matrix is returned.
 *
 * @param {number[][]} matrix - Non-empty square matrix (`n x n`) of finite numbers.
 * @returns {number[][]} The `n x n` inverse matrix `A^-1`.
 * @throws {TypeError} If `matrix` is not a 2D array of `number` values.
 * @throws {RangeError} If `matrix` is empty, non-square, contains non-finite values
 *   (`NaN`, `Infinity`, `-Infinity`), or is singular / numerically non-invertible.
 */
export function inverseFloatIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a 2D array of finite numbers')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('Expected matrix to be non-empty')
	}

	/** @type {number[][]} */
	const a = new Array(n)
	/** @type {number[][]} */
	const inv = new Array(n)
	/** @type {number[]} */
	const rowScale = new Array(n)

	for (let i = 0; i < n; i++) {
		const srcRow = matrix[i]
		if (!Array.isArray(srcRow)) {
			throw new TypeError(`Expected row ${i} to be an array`)
		}
		if (srcRow.length !== n) {
			throw new RangeError(`Expected a square ${n}x${n} matrix, but row ${i} has length ${srcRow.length}`)
		}

		const aRow = new Array(n)
		const invRow = new Array(n)
		let maxRowAbs = 0

		for (let j = 0; j < n; j++) {
			const val = srcRow[j]
			if (typeof val !== 'number') {
				throw new TypeError(`Expected finite number at [${i}][${j}], got ${typeof val}`)
			}
			if (!Number.isFinite(val)) {
				throw new RangeError(`Expected finite number at [${i}][${j}], got ${val}`)
			}
			aRow[j] = val
			invRow[j] = i === j ? 1 : 0
			const absVal = Math.abs(val)
			if (absVal > maxRowAbs) {
				maxRowAbs = absVal
			}
		}

		a[i] = aRow
		inv[i] = invRow
		rowScale[i] = maxRowAbs
	}

	// Gauss-Jordan elimination with partial pivoting
	for (let col = 0; col < n; col++) {
		let pivotRow = col
		let maxAbs = Math.abs(a[col][col])

		for (let row = col + 1; row < n; row++) {
			const absVal = Math.abs(a[row][col])
			if (absVal > maxAbs) {
				maxAbs = absVal
				pivotRow = row
			}
		}

		const tol = rowScale[pivotRow] * n * Number.EPSILON
		if (maxAbs === 0 || maxAbs <= tol) {
			throw new RangeError('Matrix is singular or numerically non-invertible')
		}

		if (pivotRow !== col) {
			;[a[col], a[pivotRow]] = [a[pivotRow], a[col]]
			;[inv[col], inv[pivotRow]] = [inv[pivotRow], inv[col]]
			;[rowScale[col], rowScale[pivotRow]] = [rowScale[pivotRow], rowScale[col]]
		}

		const aPivotRow = a[col]
		const invPivotRow = inv[col]
		const pivot = aPivotRow[col]

		aPivotRow[col] = 1
		for (let j = col + 1; j < n; j++) {
			aPivotRow[j] /= pivot
		}
		for (let j = 0; j < n; j++) {
			invPivotRow[j] /= pivot
		}

		for (let row = 0; row < n; row++) {
			if (row === col) continue
			const aRow = a[row]
			const factor = aRow[col]
			if (factor === 0) continue

			aRow[col] = 0
			for (let j = col + 1; j < n; j++) {
				aRow[j] -= factor * aPivotRow[j]
			}

			const invRow = inv[row]
			for (let j = 0; j < n; j++) {
				invRow[j] -= factor * invPivotRow[j]
			}
		}
	}

	// Validate finite outputs and normalize -0 to 0
	for (let i = 0; i < n; i++) {
		const row = inv[i]
		for (let j = 0; j < n; j++) {
			const val = row[j]
			if (!Number.isFinite(val)) {
				throw new RangeError('Matrix is singular or numerically non-invertible (overflow)')
			}
			if (val === 0) {
				row[j] = 0
			}
		}
	}

	return inv
}
