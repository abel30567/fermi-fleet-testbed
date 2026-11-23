/**
 * @fileoverview Table-driven, memoized matrix transpose over flat row-major Float64Array inputs.
 *
 * Uses precomputed and cached index permutation tables (`Uint32Array`) for fast
 * gather-based transposition, combined with a bounded content-addressed result cache
 * that preserves exact IEEE-754 bit patterns and returns fresh copies for immutability.
 */

const PRECOMPUTE_MAX_DIM = 8
const MAX_PERM_CACHE_SIZE = 256
const MAX_PERM_ELEMENTS = 262_144
const MAX_RESULT_CACHE_SIZE = 256
const MAX_MEMO_ELEMENTS = 1024

/**
 * Permutation table cache keyed by `${rows}x${cols}`.
 * Each table maps destination index `c * rows + r` to source index `r * cols + c`.
 * @type {Map<string, Uint32Array>}
 */
const permutationCache = new Map()

/**
 * Bounded LRU cache of transposed results keyed by `${rows}x${cols}:${rawUtf16Bytes}`.
 * Stored buffers are private; callers always receive a fresh `Float64Array` copy.
 * @type {Map<string, Float64Array>}
 */
const resultCache = new Map()

/**
 * Builds an index permutation table for transposing a `rows x cols` row-major matrix.
 *
 * @param {number} rows
 * @param {number} cols
 * @returns {Uint32Array}
 */
function buildPermutationTable(rows, cols) {
	const table = new Uint32Array(rows * cols)
	for (let r = 0; r < rows; r++) {
		const srcRowOffset = r * cols
		for (let c = 0; c < cols; c++) {
			table[c * rows + r] = srcRowOffset + c
		}
	}
	return table
}

// Precompute permutation tables for common small square and rectangular dimensions (1x1..8x8).
for (let r = 1; r <= PRECOMPUTE_MAX_DIM; r++) {
	for (let c = 1; c <= PRECOMPUTE_MAX_DIM; c++) {
		permutationCache.set(`${r}x${c}`, buildPermutationTable(r, c))
	}
}

/**
 * Retrieves or creates the permutation table for a given shape.
 *
 * @param {number} rows
 * @param {number} cols
 * @param {string} shapeKey
 * @returns {Uint32Array}
 */
function getPermutationTable(rows, cols, shapeKey) {
	const cached = permutationCache.get(shapeKey)
	if (cached !== undefined) {
		// Refresh LRU position only for dynamically inserted entries.
		if (rows > PRECOMPUTE_MAX_DIM || cols > PRECOMPUTE_MAX_DIM) {
			permutationCache.delete(shapeKey)
			permutationCache.set(shapeKey, cached)
		}
		return cached
	}

	const table = buildPermutationTable(rows, cols)
	if (permutationCache.size >= MAX_PERM_CACHE_SIZE) {
		for (const key of permutationCache.keys()) {
			const sep = key.indexOf('x')
			const kr = Number(key.slice(0, sep))
			const kc = Number(key.slice(sep + 1))
			if (kr > PRECOMPUTE_MAX_DIM || kc > PRECOMPUTE_MAX_DIM) {
				permutationCache.delete(key)
				break
			}
		}
	}
	permutationCache.set(shapeKey, table)
	return table
}

/**
 * Encodes the exact IEEE-754 bit pattern of a small `Float64Array` view into a
 * collision-free string key scoped by matrix dimensions.
 *
 * @param {Float64Array} matrix
 * @param {string} shapeKey
 * @returns {string}
 */
function buildResultKey(matrix, shapeKey) {
	const u16 = new Uint16Array(matrix.buffer, matrix.byteOffset, matrix.length * 4)
	return `${shapeKey}:${String.fromCharCode.apply(null, u16)}`
}

/**
 * Stores a private copy of a transposed result in the bounded LRU result cache.
 *
 * @param {string} key
 * @param {Float64Array} value
 */
function cacheResult(key, value) {
	if (resultCache.size >= MAX_RESULT_CACHE_SIZE) {
		const oldestKey = resultCache.keys().next().value
		resultCache.delete(oldestKey)
	}
	resultCache.set(key, new Float64Array(value))
}

/**
 * Validates and resolves matrix dimensions.
 *
 * @param {Float64Array} matrix
 * @param {number} [rows]
 * @param {number} [cols]
 * @returns {{ rows: number, cols: number }}
 */
function resolveDimensions(matrix, rows, cols) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('Expected matrix to be a Float64Array')
	}

	const len = matrix.length
	const rowsOmitted = rows === undefined
	const colsOmitted = cols === undefined

	if (rowsOmitted && colsOmitted) {
		if (len === 0) {
			return { rows: 0, cols: 0 }
		}
		const side = Math.sqrt(len)
		if (!Number.isInteger(side)) {
			throw new RangeError(
				`Cannot auto-detect square dimensions for Float64Array of length ${len}`
			)
		}
		return { rows: side, cols: side }
	}

	if (rowsOmitted || colsOmitted) {
		throw new TypeError(
			'Both rows and cols must be provided together, or both omitted for square matrices'
		)
	}

	if (typeof rows !== 'number' || typeof cols !== 'number') {
		throw new TypeError('Expected rows and cols to be numbers')
	}

	if (!Number.isSafeInteger(rows) || rows < 0 || !Number.isSafeInteger(cols) || cols < 0) {
		throw new RangeError('Expected rows and cols to be non-negative safe integers')
	}

	if (rows * cols !== len) {
		throw new RangeError(
			`Dimension mismatch: rows (${rows}) * cols (${cols}) = ${rows * cols} does not match matrix length ${len}`
		)
	}

	return { rows, cols }
}

/**
 * Transposes a flat row-major `Float64Array` matrix using precomputed index permutation
 * tables and bounded memoization.
 *
 * When `rows` and `cols` are both omitted, the matrix is treated as square (`n x n`
 * where `n = Math.sqrt(matrix.length)`). Returns a newly allocated `Float64Array`
 * representing the `cols x rows` transposed matrix in row-major order.
 *
 * @param {Float64Array} matrix - Input matrix stored in row-major order.
 * @param {number} [rows] - Number of rows in the input matrix (non-negative safe integer).
 * @param {number} [cols] - Number of columns in the input matrix (non-negative safe integer).
 * @returns {Float64Array} A new `Float64Array` containing the transposed `cols x rows` matrix.
 * @throws {TypeError} If `matrix` is not a `Float64Array`, or if only one dimension is provided, or if dimensions are not numbers.
 * @throws {RangeError} If dimensions are invalid, non-square when omitted, or `rows * cols !== matrix.length`.
 */
export function transposeTypedMemo(matrix, rows, cols) {
	const dims = resolveDimensions(matrix, rows, cols)
	const r = dims.rows
	const c = dims.cols
	const len = matrix.length

	if (len === 0) {
		return new Float64Array(0)
	}

	const shapeKey = `${r}x${c}`

	if (len <= MAX_MEMO_ELEMENTS) {
		const resKey = buildResultKey(matrix, shapeKey)
		const cached = resultCache.get(resKey)
		if (cached !== undefined) {
			resultCache.delete(resKey)
			resultCache.set(resKey, cached)
			return new Float64Array(cached)
		}

		const perm = getPermutationTable(r, c, shapeKey)
		const out = new Float64Array(len)
		for (let i = 0; i < len; i++) {
			out[i] = matrix[perm[i]]
		}

		cacheResult(resKey, out)
		return out
	}

	const out = new Float64Array(len)

	if (len <= MAX_PERM_ELEMENTS) {
		const perm = getPermutationTable(r, c, shapeKey)
		for (let i = 0; i < len; i++) {
			out[i] = matrix[perm[i]]
		}
		return out
	}

	// Direct transposition for very large matrices without caching massive index tables.
	for (let row = 0; row < r; row++) {
		const srcOffset = row * c
		for (let col = 0; col < c; col++) {
			out[col * r + row] = matrix[srcOffset + col]
		}
	}

	return out
}
