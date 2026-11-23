/**
 * @fileoverview Square matrix determinant over flat row-major Float64Array inputs,
 * using table-driven small-n dispatch, LU decomposition with partial pivoting for
 * larger dimensions, and bounded LRU memoization keyed by matrix dimensions and values.
 */

const DEFAULT_MAX_CACHE_SIZE = 1024

/**
 * Normalize IEEE-754 negative zero to positive zero.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Closed-form determinant for a 1x1 matrix.
 *
 * @param {Float64Array} m
 * @returns {number}
 */
function det1x1(m) {
	return normalizeZero(m[0])
}

/**
 * Closed-form determinant for a 2x2 row-major matrix.
 *
 * @param {Float64Array} m
 * @returns {number}
 */
function det2x2(m) {
	return normalizeZero(m[0] * m[3] - m[1] * m[2])
}

/**
 * Closed-form determinant for a 3x3 row-major matrix.
 *
 * @param {Float64Array} m
 * @returns {number}
 */
function det3x3(m) {
	return normalizeZero(
		m[0] * (m[4] * m[8] - m[5] * m[7]) -
			m[1] * (m[3] * m[8] - m[5] * m[6]) +
			m[2] * (m[3] * m[7] - m[4] * m[6]),
	)
}

/**
 * Closed-form determinant for a 4x4 row-major matrix using 2x2 minor Laplace expansion.
 *
 * @param {Float64Array} m
 * @returns {number}
 */
function det4x4(m) {
	const s0 = m[0] * m[5] - m[1] * m[4]
	const s1 = m[0] * m[6] - m[2] * m[4]
	const s2 = m[0] * m[7] - m[3] * m[4]
	const s3 = m[1] * m[6] - m[2] * m[5]
	const s4 = m[1] * m[7] - m[3] * m[5]
	const s5 = m[2] * m[7] - m[3] * m[6]

	const c5 = m[10] * m[15] - m[11] * m[14]
	const c4 = m[9] * m[15] - m[11] * m[13]
	const c3 = m[9] * m[14] - m[10] * m[13]
	const c2 = m[8] * m[15] - m[11] * m[12]
	const c1 = m[8] * m[14] - m[10] * m[12]
	const c0 = m[8] * m[13] - m[9] * m[12]

	return normalizeZero(
		s0 * c5 - s1 * c4 + s2 * c3 + s3 * c2 - s4 * c1 + s5 * c0,
	)
}

/**
 * Table-driven dispatch for small square matrix dimensions (1x1 through 4x4).
 *
 * @type {ReadonlyArray<((m: Float64Array) => number) | null>}
 */
const SMALL_N_DISPATCH = Object.freeze([null, det1x1, det2x2, det3x3, det4x4])

/**
 * Determinant via LU decomposition with partial pivoting on an internal copy
 * (does not mutate the input Float64Array).
 *
 * @param {Float64Array} matrix
 * @param {number} n
 * @returns {number}
 */
function detLU(matrix, n) {
	const lu = new Float64Array(matrix)
	let sign = 1
	let det = 1

	for (let col = 0; col < n; col++) {
		let pivotRow = col
		let maxAbs = Math.abs(lu[col * n + col])

		for (let row = col + 1; row < n; row++) {
			const absVal = Math.abs(lu[row * n + col])
			if (absVal > maxAbs) {
				maxAbs = absVal
				pivotRow = row
			}
		}

		if (maxAbs === 0) {
			return 0
		}

		const pivotOffset = col * n
		if (pivotRow !== col) {
			const swapOffset = pivotRow * n
			for (let k = col; k < n; k++) {
				const tmp = lu[pivotOffset + k]
				lu[pivotOffset + k] = lu[swapOffset + k]
				lu[swapOffset + k] = tmp
			}
			sign = -sign
		}

		const pivotVal = lu[pivotOffset + col]
		det *= pivotVal

		for (let row = col + 1; row < n; row++) {
			const rowOffset = row * n
			const factor = lu[rowOffset + col] / pivotVal
			if (factor === 0) {
				continue
			}
			for (let k = col + 1; k < n; k++) {
				lu[rowOffset + k] -= factor * lu[pivotOffset + k]
			}
		}
	}

	return normalizeZero(sign * det)
}

/** @type {Map<string, number>} */
const memoCache = new Map()
let cacheHits = 0
let cacheMisses = 0

/**
 * Validate input matrix and dimension, returning the resolved dimension and
 * canonical memoization cache key.
 *
 * @param {Float64Array} matrix
 * @param {number} [n]
 * @returns {{ dim: number, key: string }}
 */
function validateAndKey(matrix, n) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('matrix must be a Float64Array')
	}

	const len = matrix.length
	if (len === 0) {
		throw new RangeError('matrix must not be empty')
	}

	let dim
	if (n === undefined) {
		dim = Math.sqrt(len)
		if (!Number.isInteger(dim) || dim < 1) {
			throw new RangeError(
				`matrix length (${len}) must be a positive perfect square`,
			)
		}
	} else {
		if (typeof n !== 'number') {
			throw new TypeError('n must be a positive integer when provided')
		}
		if (!Number.isInteger(n) || n < 1) {
			throw new RangeError('n must be a positive integer')
		}
		if (len !== n * n) {
			throw new RangeError(
				`matrix length (${len}) does not match n*n (${n * n})`,
			)
		}
		dim = n
	}

	const parts = new Array(len)
	for (let i = 0; i < len; i++) {
		const v = matrix[i]
		if (!Number.isFinite(v)) {
			throw new RangeError(
				`matrix element at index ${i} must be a finite number`,
			)
		}
		parts[i] = v === 0 ? '0' : String(v)
	}

	return { dim, key: `${dim}:${parts.join(',')}` }
}

/**
 * Compute the determinant of a square matrix stored as a flat row-major Float64Array.
 *
 * Uses a precomputed dispatch table for small dimensions (1x1..4x4), LU decomposition
 * with partial pivoting for n >= 5, and bounded LRU memoization keyed by matrix
 * dimension and canonical element values.
 *
 * @param {Float64Array} matrix - Flat row-major square matrix elements.
 * @param {number} [n] - Optional matrix dimension; inferred as Math.sqrt(matrix.length) if omitted.
 * @returns {number} Determinant of the matrix.
 * @throws {TypeError} If `matrix` is not a Float64Array or `n` is provided and not a number.
 * @throws {RangeError} If `matrix` is empty, non-square, mismatched with `n`, or contains non-finite values.
 */
export function determinantTypedMemo(matrix, n) {
	const { dim, key } = validateAndKey(matrix, n)

	if (memoCache.has(key)) {
		const cached = /** @type {number} */ (memoCache.get(key))
		// Refresh LRU recency
		memoCache.delete(key)
		memoCache.set(key, cached)
		cacheHits++
		return cached
	}

	cacheMisses++
	const fastFn = dim < SMALL_N_DISPATCH.length ? SMALL_N_DISPATCH[dim] : null
	const result = fastFn ? fastFn(matrix) : detLU(matrix, dim)

	if (memoCache.size >= DEFAULT_MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value
		if (oldestKey !== undefined) {
			memoCache.delete(oldestKey)
		}
	}
	memoCache.set(key, result)

	return result
}

/**
 * Clear the internal memoization cache and reset hit/miss counters.
 */
determinantTypedMemo.clearCache = function clearCache() {
	memoCache.clear()
	cacheHits = 0
	cacheMisses = 0
}

/**
 * Return current memoization cache statistics.
 *
 * @returns {{ hits: number, misses: number, size: number, maxSize: number }}
 */
determinantTypedMemo.getCacheStats = function getCacheStats() {
	return {
		hits: cacheHits,
		misses: cacheMisses,
		size: memoCache.size,
		maxSize: DEFAULT_MAX_CACHE_SIZE,
	}
}
