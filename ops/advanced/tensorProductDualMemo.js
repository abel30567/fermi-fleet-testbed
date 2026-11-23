/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (finite real number).
 * @property {number} d - Forward-mode derivative / tangent (finite real number).
 */

/**
 * @typedef {DualNumber | DualTensor[]} DualTensor
 */

/**
 * @typedef {Object} TensorProductOptions
 * @property {boolean} [useCache=true] - Whether to use the memoized result and product tables.
 */

const MAX_RESULT_CACHE_ENTRIES = 256
const MAX_PLAN_CACHE_ENTRIES = 256
const MAX_PAIR_CACHE_ENTRIES = 4096

/**
 * Bounded LRU-style Map helper: refreshes entry on read and evicts oldest on overflow.
 */
function cacheGet(map, key) {
	if (!map.has(key)) return undefined
	const value = map.get(key)
	map.delete(key)
	map.set(key, value)
	return value
}

function cacheSet(map, key, value, maxSize) {
	if (map.has(key)) {
		map.delete(key)
	} else if (map.size >= maxSize) {
		const oldestKey = map.keys().next().value
		map.delete(oldestKey)
	}
	map.set(key, value)
}

/** @type {Map<string, { shape: number[], pairs: Array<[number, number]> }>} */
const shapePlanTable = new Map()

/** @type {Map<string, DualNumber>} */
const dualProductTable = new Map()

/** @type {Map<string, { shape: number[], flat: DualNumber[] }>} */
const resultMemoTable = new Map()

/**
 * Normalize -0 to +0 for deterministic numeric comparisons.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Check whether a value is a valid DualNumber `{ v, d }` with finite numeric fields.
 * @param {unknown} node
 * @returns {node is DualNumber}
 */
function isDualNumber(node) {
	return (
		typeof node === 'object' &&
		node !== null &&
		!Array.isArray(node) &&
		typeof node.v === 'number' &&
		typeof node.d === 'number' &&
		Number.isFinite(node.v) &&
		Number.isFinite(node.d)
	)
}

/**
 * Validate a dual tensor, infer its rectangular shape, and flatten its dual elements
 * in row-major order.
 *
 * @param {unknown} tensor
 * @param {string} name
 * @returns {{ shape: number[], flat: DualNumber[] }}
 */
function inspectAndFlatten(tensor, name) {
	if (isDualNumber(tensor)) {
		return {
			shape: [],
			flat: [{ v: normalizeZero(tensor.v), d: normalizeZero(tensor.d) }],
		}
	}

	if (!Array.isArray(tensor)) {
		throw new TypeError(
			`${name} must be a dual number { v, d } with finite numbers or a rectangular array of dual numbers`
		)
	}

	const flat = []

	/**
	 * Recursively inspect an array node, returning its rectangular shape.
	 * @param {unknown[]} arr
	 * @returns {number[]}
	 */
	function visit(arr) {
		const len = arr.length
		if (len === 0) {
			return [0]
		}

		let expectedChildShape = null

		for (let i = 0; i < len; i++) {
			if (!Object.prototype.hasOwnProperty.call(arr, i)) {
				throw new TypeError(`${name} must not contain sparse array holes`)
			}

			const item = arr[i]
			let childShape

			if (Array.isArray(item)) {
				childShape = visit(item)
			} else if (isDualNumber(item)) {
				childShape = []
				flat.push({ v: normalizeZero(item.v), d: normalizeZero(item.d) })
			} else {
				throw new TypeError(
					`${name} contains an invalid entry at index ${i}: expected a dual number { v, d } with finite numbers or a nested array`
				)
			}

			if (expectedChildShape === null) {
				expectedChildShape = childShape
			} else {
				if (expectedChildShape.length !== childShape.length) {
					throw new RangeError(`${name} must have uniform nesting depth (ragged tensor detected)`)
				}
				for (let d = 0; d < expectedChildShape.length; d++) {
					if (expectedChildShape[d] !== childShape[d]) {
						throw new RangeError(`${name} must be a rectangular tensor (inconsistent dimension sizes)`)
					}
				}
			}
		}

		return [len, ...expectedChildShape]
	}

	const shape = visit(tensor)
	return { shape, flat }
}

/**
 * Retrieve or precompute the index-pairing plan table for a given pair of shapes.
 *
 * @param {number[]} shapeA
 * @param {number[]} shapeB
 * @returns {{ shape: number[], pairs: Array<[number, number]> }}
 */
function getShapePlan(shapeA, shapeB) {
	const key = `${shapeA.join(',')}|${shapeB.join(',')}`
	const cached = cacheGet(shapePlanTable, key)
	if (cached) return cached

	const outShape = [...shapeA, ...shapeB]
	const sizeA = shapeA.reduce((acc, dim) => acc * dim, 1)
	const sizeB = shapeB.reduce((acc, dim) => acc * dim, 1)

	const pairs = new Array(sizeA * sizeB)
	let k = 0
	for (let i = 0; i < sizeA; i++) {
		for (let j = 0; j < sizeB; j++) {
			pairs[k++] = [i, j]
		}
	}

	const plan = { shape: outShape, pairs }
	cacheSet(shapePlanTable, key, plan, MAX_PLAN_CACHE_ENTRIES)
	return plan
}

/**
 * Multiply two dual numbers using the forward-mode product rule:
 * (a.v + a.d*ε) * (b.v + b.d*ε) = (a.v * b.v) + (a.v * b.d + a.d * b.v)*ε,
 * backed by a memoized scalar product table when caching is enabled.
 *
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @param {boolean} useCache
 * @returns {DualNumber}
 */
function multiplyDual(a, b, useCache) {
	if (!useCache) {
		return {
			v: normalizeZero(a.v * b.v),
			d: normalizeZero(a.v * b.d + a.d * b.v),
		}
	}

	const key = `${a.v},${a.d}|${b.v},${b.d}`
	const cached = cacheGet(dualProductTable, key)
	if (cached) {
		return { v: cached.v, d: cached.d }
	}

	const prod = {
		v: normalizeZero(a.v * b.v),
		d: normalizeZero(a.v * b.d + a.d * b.v),
	}
	cacheSet(dualProductTable, key, prod, MAX_PAIR_CACHE_ENTRIES)
	return { v: prod.v, d: prod.d }
}

/**
 * Reconstruct a freshly allocated nested tensor from a target shape and flat dual array.
 * Always clones leaf dual objects so caller mutations cannot corrupt cached data.
 *
 * @param {number[]} shape
 * @param {DualNumber[]} flat
 * @returns {DualTensor}
 */
function reshapeClone(shape, flat) {
	if (shape.length === 0) {
		return { v: flat[0].v, d: flat[0].d }
	}

	let offset = 0

	function build(dimIndex) {
		const size = shape[dimIndex]
		const out = new Array(size)
		if (dimIndex === shape.length - 1) {
			for (let i = 0; i < size; i++) {
				const cell = flat[offset++]
				out[i] = { v: cell.v, d: cell.d }
			}
		} else {
			for (let i = 0; i < size; i++) {
				out[i] = build(dimIndex + 1)
			}
		}
		return out
	}

	return build(0)
}

/**
 * Build a canonical cache key for two flattened dual tensors and their shapes.
 *
 * @param {number[]} shapeA
 * @param {DualNumber[]} flatA
 * @param {number[]} shapeB
 * @param {DualNumber[]} flatB
 * @returns {string}
 */
function buildResultKey(shapeA, flatA, shapeB, flatB) {
	const partsA = new Array(flatA.length)
	for (let i = 0; i < flatA.length; i++) {
		partsA[i] = `${flatA[i].v}:${flatA[i].d}`
	}
	const partsB = new Array(flatB.length)
	for (let i = 0; i < flatB.length; i++) {
		partsB[i] = `${flatB[i].v}:${flatB[i].d}`
	}
	return `${shapeA.join(',')}[${partsA.join(',')}]|${shapeB.join(',')}[${partsB.join(',')}]`
}

/**
 * Compute the tensor (outer) product `a ⊗ b` of two dual-number tensors using a
 * table-driven, precomputed index-plan and memoized evaluation strategy.
 *
 * Each element is a dual number `{ v, d }` carrying a primal value `v` and
 * forward-mode derivative `d`. For tensors `a` of shape `S_a` and `b` of shape `S_b`,
 * the output has shape `[...S_a, ...S_b]` with entries:
 * `(a ⊗ b)[i..., j...] = { v: a[i...].v * b[j...].v, d: a[i...].v * b[j...].d + a[i...].d * b[j...].v }`.
 *
 * Supports 0D dual scalars, 1D vectors (outer product -> 2D matrix), 2D matrices (4D tensor),
 * and arbitrary higher-order rectangular tensors, including empty dimensions.
 *
 * @param {DualTensor} a - First dual-number tensor (or dual scalar `{ v, d }`).
 * @param {DualTensor} b - Second dual-number tensor (or dual scalar `{ v, d }`).
 * @param {TensorProductOptions} [options] - Optional configuration (`{ useCache }`).
 * @returns {DualTensor} Freshly allocated tensor product over dual numbers.
 * @throws {TypeError} If inputs are not valid dual tensors, contain non-finite numbers or sparse holes, or `options` is invalid.
 * @throws {RangeError} If either tensor is ragged (non-rectangular).
 */
export function tensorProductDualMemo(a, b, options) {
	if (options !== undefined && (typeof options !== 'object' || options === null || Array.isArray(options))) {
		throw new TypeError('options must be a plain object when provided')
	}

	const useCache = options?.useCache ?? true
	if (typeof useCache !== 'boolean') {
		throw new TypeError('options.useCache must be a boolean')
	}

	const parsedA = inspectAndFlatten(a, 'a')
	const parsedB = inspectAndFlatten(b, 'b')

	if (useCache) {
		const resultKey = buildResultKey(parsedA.shape, parsedA.flat, parsedB.shape, parsedB.flat)
		const cached = cacheGet(resultMemoTable, resultKey)
		if (cached) {
			return reshapeClone(cached.shape, cached.flat)
		}

		const plan = getShapePlan(parsedA.shape, parsedB.shape)
		const flatOut = new Array(plan.pairs.length)
		for (let k = 0; k < plan.pairs.length; k++) {
			const [ai, bi] = plan.pairs[k]
			flatOut[k] = multiplyDual(parsedA.flat[ai], parsedB.flat[bi], true)
		}

		cacheSet(resultMemoTable, resultKey, { shape: plan.shape, flat: flatOut }, MAX_RESULT_CACHE_ENTRIES)
		return reshapeClone(plan.shape, flatOut)
	}

	const plan = getShapePlan(parsedA.shape, parsedB.shape)
	const flatOut = new Array(plan.pairs.length)
	for (let k = 0; k < plan.pairs.length; k++) {
		const [ai, bi] = plan.pairs[k]
		flatOut[k] = multiplyDual(parsedA.flat[ai], parsedB.flat[bi], false)
	}
	return reshapeClone(plan.shape, flatOut)
}
