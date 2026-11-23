/**
 * @typedef {{ re: number, im: number }} Complex
 * A complex number represented by its finite real (`re`) and imaginary (`im`) parts.
 */

/**
 * Maximum number of cached matrix-multiplication results retained in the LRU cache.
 * @type {number}
 */
const MAX_RESULT_CACHE_SIZE = 128

/**
 * Maximum number of cached non-unit complex scalar products retained in the memo table.
 * @type {number}
 */
const MAX_PRODUCT_MEMO_SIZE = 4096

/**
 * Precomputed multiplication table for Gaussian unit/zero complex numbers with
 * components in {-1, 0, 1}. There are 9 values per operand (81 pairs total),
 * stored as interleaved [re, im] pairs in a Float64Array of length 162.
 *
 * Index for (re, im) in {-1, 0, 1}^2 is: (re + 1) * 3 + (im + 1).
 * Pair index for (a, b) is: (aIdx * 9 + bIdx) * 2.
 * @type {Float64Array}
 */
const UNIT_PRODUCT_TABLE = (() => {
	const table = new Float64Array(9 * 9 * 2)
	for (let ar = -1; ar <= 1; ar++) {
		for (let ai = -1; ai <= 1; ai++) {
			const aIdx = (ar + 1) * 3 + (ai + 1)
			for (let br = -1; br <= 1; br++) {
				for (let bi = -1; bi <= 1; bi++) {
					const bIdx = (br + 1) * 3 + (bi + 1)
					const offset = (aIdx * 9 + bIdx) * 2
					const re = ar * br - ai * bi
					const im = ar * bi + ai * br
					table[offset] = re === 0 ? 0 : re
					table[offset + 1] = im === 0 ? 0 : im
				}
			}
		}
	}
	return table
})()

/**
 * Bounded Map memoizing non-unit complex scalar products:
 * key `${ar},${ai}*${br},${bi}` -> `[re, im]`.
 * @type {Map<string, [number, number]>}
 */
const productMemo = new Map()

/**
 * Bounded LRU Map caching complete complex matrix multiplication results.
 * Stored matrices are kept internal and deep-cloned on every return.
 * @type {Map<string, Complex[][]>}
 */
const resultCache = new Map()

/**
 * Normalizes `-0` to `+0`.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Checks whether a number is one of the unit/zero values {-1, 0, 1}.
 * @param {number} x
 * @returns {boolean}
 */
function isUnitComponent(x) {
	return x === 0 || x === 1 || x === -1
}

/**
 * Validates that a value is a valid complex `{ re, im }` object with finite numbers.
 * @param {unknown} entry
 * @param {string} name
 * @param {number} row
 * @param {number} col
 * @returns {Complex}
 */
function validateComplex(entry, name, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(`${name}[${row}][${col}] must be a complex { re, im } object`)
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (entry)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${name}[${row}][${col}] must have numeric re and im properties`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${name}[${row}][${col}] must have finite re and im values`)
	}
	return { re: normalizeZero(re), im: normalizeZero(im) }
}

/**
 * Validates a 2D rectangular matrix of complex numbers and returns its dimensions.
 * @param {unknown} matrix
 * @param {string} name
 * @returns {{ rows: number, cols: number }}
 */
function validateMatrixDimensions(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of complex { re, im } objects`)
	}
	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError(`${name} must not be empty`)
	}
	if (!Array.isArray(matrix[0])) {
		throw new TypeError(`${name}[0] must be an array`)
	}
	const cols = matrix[0].length
	if (cols === 0) {
		throw new RangeError(`${name} rows must not be empty`)
	}
	for (let i = 1; i < rows; i++) {
		if (!Array.isArray(matrix[i])) {
			throw new TypeError(`${name}[${i}] must be an array`)
		}
		if (matrix[i].length !== cols) {
			throw new RangeError(`${name} must be rectangular (row ${i} has length ${matrix[i].length}, expected ${cols})`)
		}
	}
	return { rows, cols }
}

/**
 * Extracts matrix `A` (`m x n`) into contiguous row-major Float64Array buffers
 * while validating every complex entry.
 * @param {Complex[][]} A
 * @param {number} m
 * @param {number} n
 * @returns {{ re: Float64Array, im: Float64Array }}
 */
function packRowMajor(A, m, n) {
	const re = new Float64Array(m * n)
	const im = new Float64Array(m * n)
	for (let i = 0; i < m; i++) {
		const row = A[i]
		const base = i * n
		for (let k = 0; k < n; k++) {
			const c = validateComplex(row[k], 'A', i, k)
			re[base + k] = c.re
			im[base + k] = c.im
		}
	}
	return { re, im }
}

/**
 * Extracts matrix `B` (`n x p`) into precomputed transposed (column-major)
 * contiguous Float64Array buffers while validating every complex entry.
 * Column `j` of `B` occupies indices `[j * n, (j + 1) * n)`.
 * @param {Complex[][]} B
 * @param {number} n
 * @param {number} p
 * @returns {{ re: Float64Array, im: Float64Array }}
 */
function packTransposedColumns(B, n, p) {
	const re = new Float64Array(p * n)
	const im = new Float64Array(p * n)
	for (let k = 0; k < n; k++) {
		const row = B[k]
		for (let j = 0; j < p; j++) {
			const c = validateComplex(row[j], 'B', k, j)
			const idx = j * n + k
			re[idx] = c.re
			im[idx] = c.im
		}
	}
	return { re, im }
}

/**
 * Builds a canonical cache key for matrices `A` (`m x n`) and `B` (`n x p`)
 * from their normalized Float64Array buffers.
 * @param {number} m
 * @param {number} n
 * @param {number} p
 * @param {Float64Array} aRe
 * @param {Float64Array} aIm
 * @param {Float64Array} bTRe
 * @param {Float64Array} bTIm
 * @returns {string}
 */
function buildCacheKey(m, n, p, aRe, aIm, bTRe, bTIm) {
	return `${m}x${n}x${p}|${aRe.join(',')}|${aIm.join(',')}|${bTRe.join(',')}|${bTIm.join(',')}`
}

/**
 * Returns a deep clone of a 2D complex matrix so callers cannot mutate cached entries.
 * @param {Complex[][]} matrix
 * @returns {Complex[][]}
 */
function cloneMatrix(matrix) {
	const rows = matrix.length
	const copy = new Array(rows)
	for (let i = 0; i < rows; i++) {
		const srcRow = matrix[i]
		const cols = srcRow.length
		const dstRow = new Array(cols)
		for (let j = 0; j < cols; j++) {
			const cell = srcRow[j]
			dstRow[j] = { re: cell.re, im: cell.im }
		}
		copy[i] = dstRow
	}
	return copy
}

/**
 * Stores a matrix product in the bounded LRU result cache.
 * @param {string} key
 * @param {Complex[][]} matrix
 */
function cacheResult(key, matrix) {
	if (resultCache.has(key)) {
		resultCache.delete(key)
	} else if (resultCache.size >= MAX_RESULT_CACHE_SIZE) {
		const oldestKey = resultCache.keys().next().value
		resultCache.delete(oldestKey)
	}
	resultCache.set(key, matrix)
}

/**
 * Multiplies two complex numbers using the precomputed Gaussian unit table for
 * components in {-1, 0, 1} and a bounded memoization Map for general values.
 * @param {number} ar
 * @param {number} ai
 * @param {number} br
 * @param {number} bi
 * @returns {[number, number]}
 */
function multiplyComplexMemo(ar, ai, br, bi) {
	if (
		isUnitComponent(ar) &&
		isUnitComponent(ai) &&
		isUnitComponent(br) &&
		isUnitComponent(bi)
	) {
		const aIdx = (ar + 1) * 3 + (ai + 1)
		const bIdx = (br + 1) * 3 + (bi + 1)
		const offset = (aIdx * 9 + bIdx) * 2
		return [UNIT_PRODUCT_TABLE[offset], UNIT_PRODUCT_TABLE[offset + 1]]
	}

	const key = `${ar},${ai}*${br},${bi}`
	const cached = productMemo.get(key)
	if (cached !== undefined) {
		return cached
	}

	const re = normalizeZero(ar * br - ai * bi)
	const im = normalizeZero(ar * bi + ai * br)
	const pair = /** @type {[number, number]} */ ([re, im])

	if (productMemo.size >= MAX_PRODUCT_MEMO_SIZE) {
		const oldestKey = productMemo.keys().next().value
		productMemo.delete(oldestKey)
	}
	productMemo.set(key, pair)
	return pair
}

/**
 * Multiplies two rectangular 2D matrices of complex numbers `{ re, im }`
 * (`m x n` times `n x p` -> `m x p`) using a table-driven, memoized strategy:
 *
 * 1. Validates both matrices (rectangular, non-empty, compatible inner dimensions,
 *    and finite numeric `re`/`im` entries).
 * 2. Packs `A` into contiguous row-major `Float64Array` buffers and precomputes
 *    transposed column-major `Float64Array` buffers for `B` for cache-friendly access.
 * 3. Consults a bounded LRU `Map` result cache (returning deep-cloned matrices so
 *    external mutations never corrupt cached results).
 * 4. Evaluates scalar complex products via a precomputed 81-entry Gaussian unit
 *    multiplication table for components in `{-1, 0, 1}` and a bounded `Map`
 *    memoization table for general complex products.
 *
 * @param {Complex[][]} A - Left matrix of shape `m x n`.
 * @param {Complex[][]} B - Right matrix of shape `n x p`.
 * @returns {Complex[][]} Product matrix `A * B` of shape `m x p`.
 * @throws {TypeError} If `A` or `B` is not a 2D array or contains invalid complex objects.
 * @throws {RangeError} If `A` or `B` is empty, jagged, has incompatible dimensions, or contains non-finite numbers.
 */
export function matMulComplexMemo(A, B) {
	const { rows: m, cols: n } = validateMatrixDimensions(A, 'A')
	const { rows: bRows, cols: p } = validateMatrixDimensions(B, 'B')

	if (n !== bRows) {
		throw new RangeError(
			`Incompatible matrix dimensions: A is ${m}x${n} but B is ${bRows}x${p}`
		)
	}

	const packedA = packRowMajor(A, m, n)
	const packedBT = packTransposedColumns(B, n, p)

	const cacheKey = buildCacheKey(
		m,
		n,
		p,
		packedA.re,
		packedA.im,
		packedBT.re,
		packedBT.im
	)

	const cached = resultCache.get(cacheKey)
	if (cached !== undefined) {
		// Refresh LRU recency
		resultCache.delete(cacheKey)
		resultCache.set(cacheKey, cached)
		return cloneMatrix(cached)
	}

	const aRe = packedA.re
	const aIm = packedA.im
	const bTRe = packedBT.re
	const bTIm = packedBT.im

	/** @type {Complex[][]} */
	const result = new Array(m)

	for (let i = 0; i < m; i++) {
		const aRowOffset = i * n
		/** @type {Complex[]} */
		const outRow = new Array(p)

		for (let j = 0; j < p; j++) {
			const bColOffset = j * n
			let sumRe = 0
			let sumIm = 0

			for (let k = 0; k < n; k++) {
				const ar = aRe[aRowOffset + k]
				const ai = aIm[aRowOffset + k]
				const br = bTRe[bColOffset + k]
				const bi = bTIm[bColOffset + k]

				if ((ar === 0 && ai === 0) || (br === 0 && bi === 0)) {
					continue
				}

				const [prodRe, prodIm] = multiplyComplexMemo(ar, ai, br, bi)
				sumRe += prodRe
				sumIm += prodIm
			}

			outRow[j] = {
				re: normalizeZero(sumRe),
				im: normalizeZero(sumIm),
			}
		}

		result[i] = outRow
	}

	cacheResult(cacheKey, result)
	return cloneMatrix(result)
}
