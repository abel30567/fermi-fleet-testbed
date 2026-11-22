/**
 * Recursive divide-and-conquer matrix determinant over Float64Array inputs.
 *
 * Uses recursive Laplace (cofactor) expansion along the sparsest row or column
 * (with pre-allocated minor scratch buffers and direct 0x0–3x3 base cases), and
 * falls back to recursive partial-pivoted Schur-complement reduction for dense
 * matrices larger than the cofactor threshold so large inputs remain O(n^3).
 *
 * @module ops/matrix/determinantTypedRecursive
 */

const COFACTOR_MAX_DENSE_SIZE = 10

/**
 * Computes the determinant of a square n×n matrix stored in row-major order
 * inside a Float64Array, using a recursive / divide-and-conquer algorithm.
 *
 * The input Float64Array is never mutated.
 *
 * @param {Float64Array} matrix - Row-major n×n matrix of finite numbers.
 * @param {number} [size] - Optional matrix dimension n (inferred from sqrt(matrix.length) if omitted).
 * @returns {number} The determinant of the matrix (1 for a 0×0 empty matrix).
 * @throws {TypeError} If `matrix` is not a Float64Array, or `size` is provided and not a number.
 * @throws {RangeError} If `matrix` is not square, `size` is invalid or mismatches `matrix.length`,
 *   or any matrix element is non-finite (NaN, Infinity, -Infinity).
 */
export function determinantTypedRecursive(matrix, size) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('matrix must be a Float64Array')
	}

	let n
	if (size !== undefined) {
		if (typeof size !== 'number') {
			throw new TypeError('size must be a number when provided')
		}
		if (!Number.isSafeInteger(size) || size < 0) {
			throw new RangeError('size must be a non-negative safe integer')
		}
		if (matrix.length !== size * size) {
			throw new RangeError(
				`matrix length (${matrix.length}) does not match size * size (${size * size})`,
			)
		}
		n = size
	} else {
		n = Math.round(Math.sqrt(matrix.length))
		if (n * n !== matrix.length) {
			throw new RangeError(
				`matrix length (${matrix.length}) must be a perfect square (n * n)`,
			)
		}
	}

	for (let i = 0; i < matrix.length; i++) {
		if (!Number.isFinite(matrix[i])) {
			throw new RangeError(`matrix element at index ${i} must be finite`)
		}
	}

	if (n === 0) return 1
	if (n === 1) return normalizeZero(matrix[0])
	if (n === 2) return normalizeZero(matrix[0] * matrix[3] - matrix[1] * matrix[2])
	if (n === 3) return normalizeZero(det3x3(matrix))

	/** @type {Float64Array[]} */
	const scratch = new Array(n)
	for (let k = 3; k < n; k++) {
		scratch[k] = new Float64Array(k * k)
	}

	return normalizeZero(detRecursive(matrix, n, scratch))
}

/**
 * Normalizes IEEE-754 negative zero (-0) to +0.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Closed-form determinant for a 3×3 matrix stored in row-major order.
 *
 * @param {Float64Array} m
 * @returns {number}
 */
function det3x3(m) {
	return (
		m[0] * (m[4] * m[8] - m[5] * m[7]) -
		m[1] * (m[3] * m[8] - m[5] * m[6]) +
		m[2] * (m[3] * m[7] - m[4] * m[6])
	)
}

/**
 * Recursively computes the determinant of an n×n Float64Array matrix (n >= 3).
 *
 * @param {Float64Array} m - Current n×n matrix in row-major order.
 * @param {number} n - Dimension of `m`.
 * @param {Float64Array[]} scratch - Pre-allocated minor buffers indexed by submatrix size.
 * @returns {number}
 */
function detRecursive(m, n, scratch) {
	if (n === 3) {
		return det3x3(m)
	}

	// Find the row or column with the fewest non-zero entries to prune branches.
	let bestIsRow = true
	let bestIndex = 0
	let minNonZeros = n + 1

	for (let r = 0; r < n; r++) {
		let count = 0
		const rowOffset = r * n
		for (let c = 0; c < n; c++) {
			if (m[rowOffset + c] !== 0) count++
		}
		if (count === 0) return 0
		if (count < minNonZeros) {
			minNonZeros = count
			bestIsRow = true
			bestIndex = r
			if (minNonZeros === 1) break
		}
	}

	if (minNonZeros > 1) {
		for (let c = 0; c < n; c++) {
			let count = 0
			for (let r = 0; r < n; r++) {
				if (m[r * n + c] !== 0) count++
			}
			if (count === 0) return 0
			if (count < minNonZeros) {
				minNonZeros = count
				bestIsRow = false
				bestIndex = c
				if (minNonZeros === 1) break
			}
		}
	}

	// For large dense subproblems, use recursive partial-pivoted Schur complement
	// so runtime remains O(n^3) instead of O(n!).
	if (n > COFACTOR_MAX_DENSE_SIZE && minNonZeros > 1) {
		return detSchurRecursive(m, n, scratch)
	}

	const subSize = n - 1
	const minor = scratch[subSize]
	let total = 0

	if (bestIsRow) {
		const row = bestIndex
		const rowOffset = row * n
		for (let col = 0; col < n; col++) {
			const val = m[rowOffset + col]
			if (val === 0) continue
			fillMinor(m, n, row, col, minor)
			const sign = ((row + col) & 1) === 0 ? 1 : -1
			total += sign * val * detRecursive(minor, subSize, scratch)
		}
	} else {
		const col = bestIndex
		for (let row = 0; row < n; row++) {
			const val = m[row * n + col]
			if (val === 0) continue
			fillMinor(m, n, row, col, minor)
			const sign = ((row + col) & 1) === 0 ? 1 : -1
			total += sign * val * detRecursive(minor, subSize, scratch)
		}
	}

	return total
}

/**
 * Recursive partial-pivoted Schur-complement reduction:
 *   det(M) = (-1)^pivotRow * pivot * det(D - (1 / pivot) * v * u^T)
 *
 * @param {Float64Array} m
 * @param {number} n
 * @param {Float64Array[]} scratch
 * @returns {number}
 */
function detSchurRecursive(m, n, scratch) {
	let pivotRow = 0
	let maxAbs = Math.abs(m[0])
	for (let r = 1; r < n; r++) {
		const absVal = Math.abs(m[r * n])
		if (absVal > maxAbs) {
			maxAbs = absVal
			pivotRow = r
		}
	}

	if (maxAbs === 0) return 0

	const pivotOffset = pivotRow * n
	const pivot = m[pivotOffset]
	const sign = (pivotRow & 1) === 0 ? 1 : -1
	const subSize = n - 1
	const schur = scratch[subSize]

	let destRow = 0
	for (let r = 0; r < n; r++) {
		if (r === pivotRow) continue
		const srcOffset = r * n
		const factor = m[srcOffset] / pivot
		const destOffset = destRow * subSize
		for (let c = 1; c < n; c++) {
			schur[destOffset + (c - 1)] = m[srcOffset + c] - factor * m[pivotOffset + c]
		}
		destRow++
	}

	return sign * pivot * detRecursive(schur, subSize, scratch)
}

/**
 * Populates `out` with the (n-1)×(n-1) minor obtained by removing `skipRow` and `skipCol`.
 *
 * @param {Float64Array} m
 * @param {number} n
 * @param {number} skipRow
 * @param {number} skipCol
 * @param {Float64Array} out
 */
function fillMinor(m, n, skipRow, skipCol, out) {
	let idx = 0
	for (let r = 0; r < n; r++) {
		if (r === skipRow) continue
		const rowOffset = r * n
		for (let c = 0; c < n; c++) {
			if (c === skipCol) continue
			out[idx++] = m[rowOffset + c]
		}
	}
}
