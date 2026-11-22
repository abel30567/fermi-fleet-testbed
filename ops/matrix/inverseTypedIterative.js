/**
 * Computes the inverse of an n×n square matrix stored as a row-major
 * Float64Array using iterative Gauss-Jordan elimination with partial pivoting.
 *
 * The input matrix is not mutated. Singularity is detected relative to the
 * maximum absolute entry of the input matrix (`maxAbs <= tolerance * maxEntry`)
 * so that scaling a matrix by a nonzero constant preserves invertibility.
 *
 * @param {Float64Array} matrix - Row-major n×n matrix of finite numbers.
 * @param {number} [n] - Matrix dimension n (n >= 1). Inferred from
 *   `Math.sqrt(matrix.length)` when omitted.
 * @param {number} [tolerance=1e-12] - Relative pivot tolerance (>= 0) used to
 *   detect singular or numerically non-invertible matrices.
 * @returns {Float64Array} Row-major n×n inverse matrix as a new Float64Array.
 * @throws {TypeError} If `matrix` is not a Float64Array, or if provided `n` or
 *   `tolerance` is not a number.
 * @throws {RangeError} If `matrix` is empty, non-square, mismatched with `n`,
 *   contains non-finite values, `n` is not a positive integer, `tolerance` is
 *   negative or non-finite, or the matrix is singular / overflows.
 */
export function inverseTypedIterative(matrix, n, tolerance = 1e-12) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('matrix must be a Float64Array')
	}

	if (typeof tolerance !== 'number') {
		throw new TypeError('tolerance must be a number')
	}
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError('tolerance must be a finite non-negative number')
	}

	let size
	if (n === undefined) {
		if (matrix.length === 0) {
			throw new RangeError('matrix must be non-empty')
		}
		const inferred = Math.round(Math.sqrt(matrix.length))
		if (inferred < 1 || inferred * inferred !== matrix.length) {
			throw new RangeError('matrix length must be a positive perfect square')
		}
		size = inferred
	} else {
		if (typeof n !== 'number') {
			throw new TypeError('n must be a number')
		}
		if (!Number.isInteger(n) || n < 1) {
			throw new RangeError('n must be a positive integer')
		}
		if (matrix.length !== n * n) {
			throw new RangeError(
				`matrix length (${matrix.length}) must equal n * n (${n * n})`,
			)
		}
		size = n
	}

	const total = size * size
	let maxEntry = 0
	for (let i = 0; i < total; i++) {
		const value = matrix[i]
		if (!Number.isFinite(value)) {
			throw new RangeError('matrix elements must be finite numbers')
		}
		const absValue = Math.abs(value)
		if (absValue > maxEntry) {
			maxEntry = absValue
		}
	}

	if (maxEntry === 0) {
		throw new RangeError('Matrix is singular (zero matrix)')
	}

	const threshold = tolerance * maxEntry
	const work = new Float64Array(matrix)
	const inv = new Float64Array(total)
	for (let i = 0; i < size; i++) {
		inv[i * size + i] = 1
	}

	for (let col = 0; col < size; col++) {
		let pivotRow = col
		let maxAbs = Math.abs(work[col * size + col])
		for (let row = col + 1; row < size; row++) {
			const absVal = Math.abs(work[row * size + col])
			if (absVal > maxAbs) {
				maxAbs = absVal
				pivotRow = row
			}
		}

		if (maxAbs <= threshold) {
			throw new RangeError('Matrix is singular or numerically non-invertible')
		}

		const colOffset = col * size
		if (pivotRow !== col) {
			const pivotOffset = pivotRow * size
			for (let j = col; j < size; j++) {
				const tmp = work[colOffset + j]
				work[colOffset + j] = work[pivotOffset + j]
				work[pivotOffset + j] = tmp
			}
			for (let j = 0; j < size; j++) {
				const tmp = inv[colOffset + j]
				inv[colOffset + j] = inv[pivotOffset + j]
				inv[pivotOffset + j] = tmp
			}
		}

		const pivotVal = work[colOffset + col]
		work[colOffset + col] = 1
		for (let j = col + 1; j < size; j++) {
			work[colOffset + j] /= pivotVal
		}
		for (let j = 0; j < size; j++) {
			inv[colOffset + j] /= pivotVal
		}

		for (let row = 0; row < size; row++) {
			if (row === col) continue
			const rowOffset = row * size
			const factor = work[rowOffset + col]
			if (factor === 0) continue
			work[rowOffset + col] = 0
			for (let j = col + 1; j < size; j++) {
				work[rowOffset + j] -= factor * work[colOffset + j]
			}
			for (let j = 0; j < size; j++) {
				inv[rowOffset + j] -= factor * inv[colOffset + j]
			}
		}
	}

	for (let i = 0; i < total; i++) {
		const value = inv[i]
		if (!Number.isFinite(value)) {
			throw new RangeError(
				'Matrix is singular or numerically non-invertible (overflow)',
			)
		}
		if (value === 0) {
			inv[i] = 0
		}
	}

	return inv
}
