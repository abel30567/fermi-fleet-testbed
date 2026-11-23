/**
 * @typedef {bigint | BigIntTensor[]} BigIntTensor
 */

const TABLE_LIMIT = 64n
const TABLE_OFFSET = 64
const TABLE_SIZE = TABLE_OFFSET * 2 + 1
const MAX_CACHE_SIZE = 1024
const MAX_CACHEABLE_ELEMENTS = 16384

/**
 * Precomputed multiplication table for exact BigInt products over [-64n, 64n].
 * Indexed as `(x + TABLE_OFFSET) * TABLE_SIZE + (y + TABLE_OFFSET)`.
 */
const MUL_TABLE = new BigInt64Array(TABLE_SIZE * TABLE_SIZE)
for (let i = -TABLE_OFFSET; i <= TABLE_OFFSET; i++) {
	const rowOffset = (i + TABLE_OFFSET) * TABLE_SIZE
	const bi = BigInt(i)
	for (let j = -TABLE_OFFSET; j <= TABLE_OFFSET; j++) {
		MUL_TABLE[rowOffset + (j + TABLE_OFFSET)] = bi * BigInt(j)
	}
}

/** @type {Map<string, BigIntTensor>} */
const memoCache = new Map()

/**
 * Multiplies two exact BigInts, serving small values from the precomputed table.
 *
 * @param {bigint} x
 * @param {bigint} y
 * @returns {bigint}
 */
function mulBigInt(x, y) {
	if (x === 0n || y === 0n) return 0n
	if (x === 1n) return y
	if (y === 1n) return x
	if (x === -1n) return -y
	if (y === -1n) return -x
	if (
		x >= -TABLE_LIMIT &&
		x <= TABLE_LIMIT &&
		y >= -TABLE_LIMIT &&
		y <= TABLE_LIMIT
	) {
		const ix = Number(x) + TABLE_OFFSET
		const iy = Number(y) + TABLE_OFFSET
		return MUL_TABLE[ix * TABLE_SIZE + iy]
	}
	return x * y
}

/**
 * Compares two tensor shapes for exact equality.
 *
 * @param {number[]} s1
 * @param {number[]} s2
 * @returns {boolean}
 */
function shapesEqual(s1, s2) {
	if (s1.length !== s2.length) return false
	for (let i = 0; i < s1.length; i++) {
		if (s1[i] !== s2[i]) return false
	}
	return true
}

/**
 * Computes the total number of scalar entries described by a tensor shape.
 *
 * @param {number[]} shape
 * @returns {number}
 */
function countElements(shape) {
	let count = 1
	for (let i = 0; i < shape.length; i++) {
		count *= shape[i]
	}
	return count
}

/**
 * Validates that `value` is a well-formed rectangular BigInt tensor (scalar or
 * nested arrays of BigInts without sparse holes or cycles) and returns its shape
 * and collision-free canonical serialization key.
 *
 * @param {unknown} value
 * @param {string} argName
 * @returns {{ shape: number[], key: string }}
 */
function validateAndSerialize(value, argName) {
	const visiting = new Set()

	function walk(node) {
		if (typeof node === 'bigint') {
			return { shape: [], key: node.toString() }
		}
		if (!Array.isArray(node)) {
			throw new TypeError(
				`${argName} must be a BigInt or rectangular nested Array of BigInts`,
			)
		}
		if (visiting.has(node)) {
			throw new TypeError(`${argName} must not contain circular references`)
		}
		visiting.add(node)

		const len = node.length
		if (len === 0) {
			visiting.delete(node)
			return { shape: [0], key: '[]' }
		}

		let expectedChildShape = null
		const parts = new Array(len)
		for (let i = 0; i < len; i++) {
			if (!(i in node)) {
				visiting.delete(node)
				throw new TypeError(`${argName} must not contain sparse array holes`)
			}
			const child = walk(node[i])
			if (expectedChildShape === null) {
				expectedChildShape = child.shape
			} else if (!shapesEqual(expectedChildShape, child.shape)) {
				visiting.delete(node)
				throw new RangeError(
					`${argName} must be a rectangular tensor with uniform shape`,
				)
			}
			parts[i] = child.key
		}

		visiting.delete(node)
		return {
			shape: [len, ...expectedChildShape],
			key: `[${parts.join(',')}]`,
		}
	}

	return walk(value)
}

/**
 * Deeply clones a BigInt tensor so mutations never leak into or out of caches.
 *
 * @param {BigIntTensor} tensor
 * @returns {BigIntTensor}
 */
function cloneTensor(tensor) {
	if (typeof tensor === 'bigint') return tensor
	const len = tensor.length
	const copy = new Array(len)
	for (let i = 0; i < len; i++) {
		copy[i] = cloneTensor(tensor[i])
	}
	return copy
}

/**
 * Scales every entry of `tensor` by exact BigInt `scalar`.
 *
 * @param {bigint} scalar
 * @param {BigIntTensor} tensor
 * @returns {BigIntTensor}
 */
function scaleTensor(scalar, tensor) {
	if (typeof tensor === 'bigint') {
		return mulBigInt(scalar, tensor)
	}
	const len = tensor.length
	const out = new Array(len)
	for (let i = 0; i < len; i++) {
		out[i] = scaleTensor(scalar, tensor[i])
	}
	return out
}

/**
 * Computes `a ⊗ b` with per-call memoization of repeated scalar leaves from `a`.
 *
 * @param {BigIntTensor} a
 * @param {BigIntTensor} b
 * @returns {BigIntTensor}
 */
function computeTensorProduct(a, b) {
	/** @type {Map<bigint, BigIntTensor>} */
	const scalarMemo = new Map()

	function recurse(nodeA) {
		if (typeof nodeA === 'bigint') {
			if (scalarMemo.has(nodeA)) {
				return cloneTensor(scalarMemo.get(nodeA))
			}
			const scaled = scaleTensor(nodeA, b)
			scalarMemo.set(nodeA, scaled)
			return cloneTensor(scaled)
		}
		const len = nodeA.length
		const out = new Array(len)
		for (let i = 0; i < len; i++) {
			out[i] = recurse(nodeA[i])
		}
		return out
	}

	return recurse(a)
}

/**
 * Retrieves an entry from the bounded LRU memoization cache.
 *
 * @param {string} key
 * @returns {BigIntTensor | undefined}
 */
function cacheGet(key) {
	if (!memoCache.has(key)) return undefined
	const value = memoCache.get(key)
	memoCache.delete(key)
	memoCache.set(key, value)
	return value
}

/**
 * Stores an entry in the bounded LRU memoization cache, evicting the least
 * recently used entry when full.
 *
 * @param {string} key
 * @param {BigIntTensor} value
 */
function cacheSet(key, value) {
	if (memoCache.has(key)) {
		memoCache.delete(key)
	} else if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value
		memoCache.delete(oldestKey)
	}
	memoCache.set(key, value)
}

/**
 * Computes the exact BigInt tensor product (outer product) `a ⊗ b` of two
 * arbitrary-rank BigInt tensors using a precomputed multiplication table and
 * bounded LRU memoization.
 *
 * A tensor is either a rank-0 scalar (`bigint`) or a rectangular nested `Array`
 * of `bigint` values. If `a` has shape `[d_1, ..., d_m]` and `b` has shape
 * `[e_1, ..., e_n]`, the result has shape `[d_1, ..., d_m, e_1, ..., e_n]` with
 * entries `(a ⊗ b)[i_1]...[i_m][j_1]...[j_n] = a[i_1]...[i_m] * b[j_1]...[j_n]`.
 *
 * @param {BigIntTensor} a - First exact BigInt tensor (scalar or rectangular nested array of BigInts).
 * @param {BigIntTensor} b - Second exact BigInt tensor (scalar or rectangular nested array of BigInts).
 * @returns {BigIntTensor} Exact BigInt tensor product `a ⊗ b`.
 * @throws {TypeError} If either input is not a BigInt or nested array of BigInts, has sparse holes, or is circular.
 * @throws {RangeError} If either input is a ragged (non-rectangular) nested array.
 */
export function tensorProductBigIntMemo(a, b) {
	const infoA = validateAndSerialize(a, 'a')
	const infoB = validateAndSerialize(b, 'b')

	const totalElements = countElements(infoA.shape) * countElements(infoB.shape)
	const cacheable = totalElements <= MAX_CACHEABLE_ELEMENTS
	const cacheKey = cacheable ? `${infoA.key}|${infoB.key}` : ''

	if (cacheable) {
		const cached = cacheGet(cacheKey)
		if (cached !== undefined) {
			return cloneTensor(cached)
		}
	}

	const result = computeTensorProduct(a, b)

	if (cacheable) {
		cacheSet(cacheKey, cloneTensor(result))
	}

	return result
}
