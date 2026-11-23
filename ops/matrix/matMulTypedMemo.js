/**
 * Matrix multiplication over flat row-major Float64Array inputs using
 * precomputed index tables and bounded LRU result memoization.
 *
 * @module ops/matrix/matMulTypedMemo
 */

const MAX_PLAN_OPS = 4096
const MAX_PLAN_CACHE = 64
const MAX_MEMO_ELEMENTS = 4096
const MAX_MEMO_ENTRIES = 256

/**
 * Cache of precomputed index tables keyed by `${m}x${k}x${n}`.
 * @type {Map<string, {
 *   kind: 'flat',
 *   outLen: number,
 *   aIndices: Uint32Array,
 *   bIndices: Uint32Array
 * } | {
 *   kind: 'rows',
 *   outLen: number,
 *   aRowOffsets: Uint32Array,
 *   bRowOffsets: Uint32Array,
 *   cRowOffsets: Uint32Array
 * }>}
 */
const planCache = new Map()

/**
 * Bounded LRU memoization cache of multiplication results.
 * Stored Float64Arrays are internal snapshots; callers always receive a copy.
 * @type {Map<string, Float64Array>}
 */
const resultMemo = new Map()

/**
 * Resolve and strictly validate matrix dimensions `(m, k, n)`.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {number | undefined} m
 * @param {number | undefined} k
 * @param {number | undefined} n
 * @returns {{ m: number, k: number, n: number }}
 */
function resolveDimensions(a, b, m, k, n) {
	if (!(a instanceof Float64Array) || !(b instanceof Float64Array)) {
		throw new TypeError('Inputs a and b must be Float64Array instances')
	}

	if (m === undefined && k === undefined && n === undefined) {
		if (a.length !== b.length) {
			throw new RangeError(
				`Square auto-detection requires equal lengths (got ${a.length} and ${b.length})`
			)
		}
		if (a.length === 0) {
			throw new RangeError('Input Float64Arrays must be non-empty')
		}
		const side = Math.round(Math.sqrt(a.length))
		if (side * side !== a.length) {
			throw new RangeError(
				`Square auto-detection requires a perfect-square length (got ${a.length})`
			)
		}
		return { m: side, k: side, n: side }
	}

	if (typeof m !== 'number' || typeof k !== 'number' || typeof n !== 'number') {
		throw new TypeError(
			'Dimensions m, k, and n must all be numbers when explicitly provided'
		)
	}

	if (
		!Number.isSafeInteger(m) ||
		m <= 0 ||
		!Number.isSafeInteger(k) ||
		k <= 0 ||
		!Number.isSafeInteger(n) ||
		n <= 0
	) {
		throw new RangeError('Dimensions m, k, and n must be positive safe integers')
	}

	if (a.length !== m * k) {
		throw new RangeError(
			`Length of a (${a.length}) does not match m * k (${m * k})`
		)
	}
	if (b.length !== k * n) {
		throw new RangeError(
			`Length of b (${b.length}) does not match k * n (${k * n})`
		)
	}

	return { m, k, n }
}

/**
 * Retrieve or build a precomputed index table for multiplying an `m x k` matrix
 * by a `k x n` matrix.
 *
 * For shapes with `m * k * n <= MAX_PLAN_OPS`, builds flat `Uint32Array` lookup
 * tables `(aIndices, bIndices)` for zero-multiplication inner loops. For larger
 * shapes, builds precomputed row-offset tables for cache-friendly `i-p-j` loops.
 *
 * @param {number} m
 * @param {number} k
 * @param {number} n
 */
function getIndexPlan(m, k, n) {
	const key = `${m}x${k}x${n}`
	const cached = planCache.get(key)
	if (cached !== undefined) {
		// Refresh LRU position
		planCache.delete(key)
		planCache.set(key, cached)
		return cached
	}

	const outLen = m * n
	const totalOps = outLen * k
	let plan

	if (totalOps <= MAX_PLAN_OPS) {
		const aIndices = new Uint32Array(totalOps)
		const bIndices = new Uint32Array(totalOps)
		let ptr = 0
		for (let i = 0; i < m; i++) {
			const aRow = i * k
			for (let j = 0; j < n; j++) {
				for (let p = 0; p < k; p++) {
					aIndices[ptr] = aRow + p
					bIndices[ptr] = p * n + j
					ptr++
				}
			}
		}
		plan = { kind: 'flat', outLen, aIndices, bIndices }
	} else {
		const aRowOffsets = new Uint32Array(m)
		const bRowOffsets = new Uint32Array(k)
		const cRowOffsets = new Uint32Array(m)
		for (let i = 0; i < m; i++) {
			aRowOffsets[i] = i * k
			cRowOffsets[i] = i * n
		}
		for (let p = 0; p < k; p++) {
			bRowOffsets[p] = p * n
		}
		plan = { kind: 'rows', outLen, aRowOffsets, bRowOffsets, cRowOffsets }
	}

	if (planCache.size >= MAX_PLAN_CACHE) {
		const oldestKey = planCache.keys().next().value
		planCache.delete(oldestKey)
	}
	planCache.set(key, plan)
	return plan
}

/**
 * Build an exact injective cache key from matrix dimensions and the raw
 * IEEE-754 64-bit representations of `a` and `b` (respecting subarray byte offsets).
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {number} m
 * @param {number} k
 * @param {number} n
 * @returns {string}
 */
function buildMemoKey(a, b, m, k, n) {
	const aWords = new Uint32Array(a.buffer, a.byteOffset, a.length * 2)
	const bWords = new Uint32Array(b.buffer, b.byteOffset, b.length * 2)
	let key = `${m}x${k}x${n}|`
	for (let i = 0; i < aWords.length; i++) {
		key += aWords[i].toString(36) + ','
	}
	key += '|'
	for (let i = 0; i < bWords.length; i++) {
		key += bWords[i].toString(36) + ','
	}
	return key
}

/**
 * Multiply two flat row-major `Float64Array` matrices `a` (`m x k`) and
 * `b` (`k x n`), returning a newly allocated `Float64Array` of length `m * n`.
 *
 * When `m`, `k`, and `n` are all omitted, square dimensions are inferred from
 * `a.length === b.length === s * s`.
 *
 * Uses precomputed index tables cached per shape `(m, k, n)` and a bounded LRU
 * result memoization cache that returns isolated `Float64Array` copies.
 *
 * @param {Float64Array} a - Left operand matrix in row-major order (`m * k` elements).
 * @param {Float64Array} b - Right operand matrix in row-major order (`k * n` elements).
 * @param {number} [m] - Number of rows in `a` (and output).
 * @param {number} [k] - Number of columns in `a` / rows in `b`.
 * @param {number} [n] - Number of columns in `b` (and output).
 * @returns {Float64Array} Newly allocated product matrix `a * b` in row-major order (`m * n` elements).
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`, or if dimensions are partially provided or non-numeric.
 * @throws {RangeError} If dimensions are not positive safe integers or do not match input lengths.
 */
export function matMulTypedMemo(a, b, m, k, n) {
	const dims = resolveDimensions(a, b, m, k, n)
	const rowsA = dims.m
	const inner = dims.k
	const colsB = dims.n

	const shouldMemoize = a.length + b.length <= MAX_MEMO_ELEMENTS
	let memoKey = null

	if (shouldMemoize) {
		memoKey = buildMemoKey(a, b, rowsA, inner, colsB)
		const cached = resultMemo.get(memoKey)
		if (cached !== undefined) {
			resultMemo.delete(memoKey)
			resultMemo.set(memoKey, cached)
			return new Float64Array(cached)
		}
	}

	const plan = getIndexPlan(rowsA, inner, colsB)
	const out = new Float64Array(plan.outLen)

	if (plan.kind === 'flat') {
		const { aIndices, bIndices, outLen } = plan
		let ptr = 0
		for (let outIdx = 0; outIdx < outLen; outIdx++) {
			let sum = 0
			const end = ptr + inner
			for (; ptr < end; ptr++) {
				sum += a[aIndices[ptr]] * b[bIndices[ptr]]
			}
			out[outIdx] = sum
		}
	} else {
		const { aRowOffsets, bRowOffsets, cRowOffsets } = plan
		for (let i = 0; i < rowsA; i++) {
			const aRow = aRowOffsets[i]
			const cRow = cRowOffsets[i]
			for (let p = 0; p < inner; p++) {
				const aVal = a[aRow + p]
				const bRow = bRowOffsets[p]
				for (let j = 0; j < colsB; j++) {
					out[cRow + j] += aVal * b[bRow + j]
				}
			}
		}
	}

	if (shouldMemoize) {
		if (resultMemo.size >= MAX_MEMO_ENTRIES) {
			const oldestKey = resultMemo.keys().next().value
			resultMemo.delete(oldestKey)
		}
		resultMemo.set(memoKey, new Float64Array(out))
	}

	return out
}
