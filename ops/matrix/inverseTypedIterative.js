/**
 * Computes the inverse of a square matrix stored in row-major order inside a
 * `Float64Array` using a straightforward iterative Gauss-Jordan elimination
 * algorithm with partial pivoting.
 *
 * The input array is never mutated; a new `Float64Array` containing the inverse
 * matrix in row-major order is returned.
 *
 * @param {Float64Array} matrix - Flat row-major `Float64Array` of length `n * n`.
 * @param {number} [n] - Optional matrix dimension `n` (inferred as `Math.sqrt(matrix.length)` when omitted).
 * @param {number} [tolerance] - Optional non-negative pivot threshold below which the matrix is treated as singular.
 *   When omitted, a scale-aware tolerance `maxAbs * Number.EPSILON * n * 100` is used.
 * @returns {Float64Array} A new `Float64Array` of length `n * n` holding the inverse matrix in row-major order.
 * @throws {TypeError} If `matrix` is not a `Float64Array`, or if `n` or `tolerance` has an invalid type.
 * @throws {RangeError} If `matrix.length` is not a perfect square, does not match `n * n`, contains non-finite values, or `tolerance` is negative/non-finite.
 * @throws {Error} If the matrix is singular (or numerically singular within `tolerance`).
 */
export function inverseTypedIterative(matrix, n, tolerance) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('Expected matrix to be a Float64Array')
	}

	const len = matrix.length
	let size
	if (n === undefined) {
		size = Math.round(Math.sqrt(len))
		if (size * size !== len) {
			throw new RangeError(
				`Expected matrix length to be a perfect square (n * n), received length ${len}`,
			)
		}
	} else {
		if (typeof n !== 'number') {
			throw new TypeError('Expected dimension n to be a number')
		}
		if (!Number.isInteger(n) || n < 0) {
			throw new RangeError('Expected dimension n to be a non-negative integer')
		}
		if (n * n !== len) {
			throw new RangeError(
				`Expected matrix length ${n * n} for dimension ${n}, received length ${len}`,
			)
		}
		size = n
	}

	if (tolerance !== undefined) {
		if (typeof tolerance !== 'number') {
			throw new TypeError('Expected tolerance to be a number')
		}
		if (!Number.isFinite(tolerance) || tolerance < 0) {
			throw new RangeError('Expected tolerance to be a non-negative finite number')
		}
	}

	let maxAbs = 0
	for (let i = 0; i < len; i++) {
		const v = matrix[i]
		if (!Number.isFinite(v)) {
			throw new RangeError(`Matrix element at index ${i} must be a finite number`)
		}
		const av = Math.abs(v)
		if (av > maxAbs) {
			maxAbs = av
		}
	}

	if (size === 0) {
		return new Float64Array(0)
	}

	const tol = tolerance !== undefined ? tolerance : maxAbs * Number.EPSILON * size * 100

	if (maxAbs === 0 || maxAbs <= tol) {
		throw new Error('Matrix is singular and cannot be inverted')
	}

	if (size === 1) {
		const inv0 = 1 / matrix[0]
		if (!Number.isFinite(inv0)) {
			throw new Error('Matrix is singular and cannot be inverted')
		}
		return new Float64Array([inv0 === 0 ? 0 : inv0])
	}

	// Copy input into working buffer `a` and initialize `inv` to the identity matrix.
	const a = new Float64Array(matrix)
	const inv = new Float64Array(len)
	for (let i = 0; i < size; i++) {
		inv[i * size + i] = 1
	}

	// Iterative Gauss-Jordan elimination with partial pivoting.
	for (let col = 0; col < size; col++) {
		// 1. Find pivot row with largest absolute value in the current column.
		let pivotRow = col
		let pivotAbs = Math.abs(a[col * size + col])
		for (let row = col + 1; row < size; row++) {
			const candidateAbs = Math.abs(a[row * size + col])
			if (candidateAbs > pivotAbs) {
				pivotAbs = candidateAbs
				pivotRow = row
			}
		}

		if (pivotAbs <= tol || !Number.isFinite(pivotAbs)) {
			throw new Error('Matrix is singular and cannot be inverted')
		}

		const colOffset = col * size

		// 2. Swap pivot row into place if needed.
		if (pivotRow !== col) {
			const pivotOffset = pivotRow * size
			for (let j = col; j < size; j++) {
				const tmp = a[colOffset + j]
				a[colOffset + j] = a[pivotOffset + j]
				a[pivotOffset + j] = tmp
			}
			for (let j = 0; j < size; j++) {
				const tmp = inv[colOffset + j]
				inv[colOffset + j] = inv[pivotOffset + j]
				inv[pivotOffset + j] = tmp
			}
		}

		// 3. Scale pivot row so the pivot element becomes 1.
		const pivotVal = a[colOffset + col]
		a[colOffset + col] = 1
		for (let j = col + 1; j < size; j++) {
			a[colOffset + j] /= pivotVal
		}
		for (let j = 0; j < size; j++) {
			inv[colOffset + j] /= pivotVal
		}

		// 4. Eliminate current column from all other rows.
		for (let row = 0; row < size; row++) {
			if (row === col) {
				continue
			}
			const rowOffset = row * size
			const factor = a[rowOffset + col]
			if (factor === 0) {
				continue
			}
			a[rowOffset + col] = 0
			for (let j = col + 1; j < size; j++) {
				a[rowOffset + j] -= factor * a[colOffset + j]
			}
			for (let j = 0; j < size; j++) {
				inv[rowOffset + j] -= factor * inv[colOffset + j]
			}
		}
	}

	// Verify finiteness and canonicalize -0 to +0.
	for (let i = 0; i < len; i++) {
		const v = inv[i]
		if (!Number.isFinite(v)) {
			throw new Error('Matrix is singular or ill-conditioned: inverse contains non-finite values')
		}
		if (v === 0) {
			inv[i] = 0
		}
	}

	return inv
}
