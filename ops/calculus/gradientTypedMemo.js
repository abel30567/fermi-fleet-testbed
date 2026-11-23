/**
 * @fileoverview Discrete numerical gradient over Float64Array scalar fields
 * using precomputed finite-difference stencil tables and bounded LRU memoization.
 *
 * Supports 1D fields `(values, spacing = 1)` returning a `Float64Array`, and
 * row-major n-D fields via `options.shape` returning an array of `Float64Array`
 * partial derivatives `[∂f/∂axis0, ∂f/∂axis1, ...]`.
 *
 * Uses second-order central differences in the interior and second-order
 * one-sided differences at boundaries (falling back to first-order when an axis
 * has length 2 unless `options.edgeOrder` is explicitly specified).
 *
 * @module ops/calculus/gradientTypedMemo
 */

/**
 * Immutable base finite-difference stencil definitions (for unit spacing h = 1).
 * Scaled stencil weights (divided by h) are precomputed and memoized on demand.
 */
const BASE_STENCILS = Object.freeze({
	1: Object.freeze({
		left: Object.freeze({
			offsets: Object.freeze([0, 1]),
			weights: Object.freeze([-1, 1]),
		}),
		interior: Object.freeze({
			offsets: Object.freeze([-1, 1]),
			weights: Object.freeze([-0.5, 0.5]),
		}),
		right: Object.freeze({
			offsets: Object.freeze([-1, 0]),
			weights: Object.freeze([-1, 1]),
		}),
	}),
	2: Object.freeze({
		left: Object.freeze({
			offsets: Object.freeze([0, 1, 2]),
			weights: Object.freeze([-1.5, 2, -0.5]),
		}),
		interior: Object.freeze({
			offsets: Object.freeze([-1, 1]),
			weights: Object.freeze([-0.5, 0.5]),
		}),
		right: Object.freeze({
			offsets: Object.freeze([-2, -1, 0]),
			weights: Object.freeze([0.5, -2, 1.5]),
		}),
	}),
})

const MAX_STENCIL_CACHE_ENTRIES = 512
const MAX_PLAN_CACHE_ENTRIES = 256
const MAX_RESULT_CACHE_ENTRIES = 256
const MAX_MEMO_ELEMENTS = 65536

/** @type {Map<string, Readonly<object>>} */
const scaledStencilCache = new Map()
/** @type {Map<string, ReadonlyArray<Readonly<object>>>} */
const axisPlanCache = new Map()
/** @type {Map<string, Array<{ snapshot: Float64Array, result: Float64Array | Float64Array[] }>>} */
const resultCache = new Map()

// Endianness-safe bit pattern for IEEE-754 -0.0 so -0.0 and +0.0 hash identically.
const NEG_ZERO_U32 = new Uint32Array(new Float64Array([-0]).buffer)
const NEG_ZERO_W0 = NEG_ZERO_U32[0]
const NEG_ZERO_W1 = NEG_ZERO_U32[1]

/**
 * Retrieves or inserts an entry in a bounded LRU Map.
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @returns {V | undefined}
 */
function lruGet(cache, key) {
	if (!cache.has(key)) return undefined
	const value = cache.get(key)
	cache.delete(key)
	cache.set(key, value)
	return value
}

/**
 * Sets an entry in a bounded LRU Map, evicting the oldest entry if full.
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @param {V} value
 * @param {number} maxEntries
 */
function lruSet(cache, key, value, maxEntries) {
	if (cache.has(key)) {
		cache.delete(key)
	} else if (cache.size >= maxEntries) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}
	cache.set(key, value)
}

/**
 * Precomputes and caches finite-difference stencil weights scaled by `1 / h`.
 * @param {number} h - Positive finite grid spacing.
 * @param {1 | 2} order - Boundary stencil accuracy order.
 */
function getScaledStencil(h, order) {
	const key = `${h}:${order}`
	const cached = lruGet(scaledStencilCache, key)
	if (cached) return cached

	const base = BASE_STENCILS[order]
	const scale = (weights) => {
		const out = new Float64Array(weights.length)
		for (let i = 0; i < weights.length; i++) {
			out[i] = weights[i] / h
		}
		return out
	}

	const scaled = Object.freeze({
		leftOffsets: base.left.offsets,
		leftWeights: scale(base.left.weights),
		interiorOffsets: base.interior.offsets,
		interiorWeights: scale(base.interior.weights),
		rightOffsets: base.right.offsets,
		rightWeights: scale(base.right.weights),
	})

	lruSet(scaledStencilCache, key, scaled, MAX_STENCIL_CACHE_ENTRIES)
	return scaled
}

/**
 * Precomputes and caches per-axis stride, block size, and scaled stencil plan.
 * @param {number[]} shape
 * @param {number[]} spacings
 * @param {1 | 2 | undefined} edgeOrder
 * @param {string} planKey
 */
function getAxisPlan(shape, spacings, edgeOrder, planKey) {
	const cached = lruGet(axisPlanCache, planKey)
	if (cached) return cached

	const ndim = shape.length
	let totalLen = 1
	for (let a = 0; a < ndim; a++) totalLen *= shape[a]

	const plan = new Array(ndim)
	let stride = 1
	for (let a = ndim - 1; a >= 0; a--) {
		const axisLen = shape[a]
		const blockSize = axisLen * stride
		const outerCount = totalLen / blockSize
		const effectiveOrder = edgeOrder !== undefined ? edgeOrder : axisLen >= 3 ? 2 : 1
		plan[a] = Object.freeze({
			axis: a,
			axisLen,
			stride,
			blockSize,
			outerCount,
			stencil: getScaledStencil(spacings[a], effectiveOrder),
		})
		stride = blockSize
	}

	const frozenPlan = Object.freeze(plan)
	lruSet(axisPlanCache, planKey, frozenPlan, MAX_PLAN_CACHE_ENTRIES)
	return frozenPlan
}

/**
 * Computes a fast dual-32-bit FNV-1a content fingerprint over a Float64Array.
 * Normalizes -0.0 to +0.0 and respects subarray byteOffset/length.
 * @param {Float64Array} values
 * @returns {string}
 */
function hashFloat64Array(values) {
	const u32 = new Uint32Array(values.buffer, values.byteOffset, values.length * 2)
	let h1 = 0x811c9dc5
	let h2 = 0x01000193
	for (let i = 0; i < u32.length; i += 2) {
		let w0 = u32[i]
		let w1 = u32[i + 1]
		if (w0 === NEG_ZERO_W0 && w1 === NEG_ZERO_W1) {
			w0 = 0
			w1 = 0
		}
		h1 = Math.imul(h1 ^ w0, 0x01000193)
		h1 = Math.imul(h1 ^ w1, 0x01000193)
		h2 = Math.imul(h2 ^ w1, 0x85ebca6b)
		h2 = Math.imul(h2 ^ w0, 0xc2b2ae35)
	}
	return `${h1 >>> 0}:${h2 >>> 0}`
}

/**
 * Checks element-wise numeric equality between two Float64Arrays of equal length.
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {boolean}
 */
function float64Equal(a, b) {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false
	}
	return true
}

/**
 * Creates a defensive deep clone of a cached gradient result.
 * @param {Float64Array | Float64Array[]} result
 * @returns {Float64Array | Float64Array[]}
 */
function cloneResult(result) {
	if (result instanceof Float64Array) {
		return new Float64Array(result)
	}
	const out = new Array(result.length)
	for (let i = 0; i < result.length; i++) {
		out[i] = new Float64Array(result[i])
	}
	return out
}

/**
 * Evaluates a single axis partial derivative using its precomputed stencil table.
 * @param {Float64Array} values
 * @param {Readonly<object>} axisDesc
 * @returns {Float64Array}
 */
function computeAxisGradient(values, axisDesc) {
	const { axisLen, stride, blockSize, outerCount, stencil } = axisDesc
	const {
		leftOffsets,
		leftWeights,
		interiorOffsets,
		interiorWeights,
		rightOffsets,
		rightWeights,
	} = stencil

	const out = new Float64Array(values.length)
	const leftLen = leftOffsets.length
	const rightLen = rightOffsets.length
	const lastIdx = axisLen - 1
	const intOff0 = interiorOffsets[0] * stride
	const intOff1 = interiorOffsets[1] * stride
	const intW0 = interiorWeights[0]
	const intW1 = interiorWeights[1]

	for (let outer = 0; outer < outerCount; outer++) {
		const outerBase = outer * blockSize
		for (let inner = 0; inner < stride; inner++) {
			const base = outerBase + inner

			// Left boundary (i = 0)
			let leftSum = 0
			for (let k = 0; k < leftLen; k++) {
				leftSum += leftWeights[k] * values[base + leftOffsets[k] * stride]
			}
			out[base] = leftSum === 0 ? 0 : leftSum

			// Interior points (1 <= i <= axisLen - 2)
			for (let i = 1; i < lastIdx; i++) {
				const idx = base + i * stride
				const val = intW0 * values[idx + intOff0] + intW1 * values[idx + intOff1]
				out[idx] = val === 0 ? 0 : val
			}

			// Right boundary (i = axisLen - 1)
			const rightBase = base + lastIdx * stride
			let rightSum = 0
			for (let k = 0; k < rightLen; k++) {
				rightSum += rightWeights[k] * values[rightBase + rightOffsets[k] * stride]
			}
			out[rightBase] = rightSum === 0 ? 0 : rightSum
		}
	}

	return out
}

/**
 * Validates arguments and returns normalized shape, per-axis spacings, edgeOrder, and memoize flag.
 * @param {unknown} values
 * @param {unknown} spacing
 * @param {unknown} options
 */
function validateAndNormalize(values, spacing, options) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('values must be a Float64Array')
	}
	if (values.length < 2) {
		throw new RangeError('values must contain at least 2 elements')
	}
	for (let i = 0; i < values.length; i++) {
		if (!Number.isFinite(values[i])) {
			throw new RangeError(`values[${i}] must be a finite number`)
		}
	}

	if (
		options !== undefined &&
		(typeof options !== 'object' ||
			options === null ||
			Array.isArray(options) ||
			ArrayBuffer.isView(options))
	) {
		throw new TypeError('options must be a plain object')
	}

	const opts = options ?? {}

	let memoize = true
	if (opts.memoize !== undefined) {
		if (typeof opts.memoize !== 'boolean') {
			throw new TypeError('options.memoize must be a boolean')
		}
		memoize = opts.memoize
	}

	let edgeOrder = undefined
	if (opts.edgeOrder !== undefined) {
		if (typeof opts.edgeOrder !== 'number') {
			throw new TypeError('options.edgeOrder must be 1 or 2')
		}
		if (opts.edgeOrder !== 1 && opts.edgeOrder !== 2) {
			throw new RangeError('options.edgeOrder must be 1 or 2')
		}
		edgeOrder = opts.edgeOrder
	}

	/** @type {number[]} */
	let shape
	if (opts.shape === undefined) {
		shape = [values.length]
	} else {
		if (!Array.isArray(opts.shape)) {
			throw new TypeError('options.shape must be an array of positive integers')
		}
		if (opts.shape.length === 0) {
			throw new RangeError('options.shape must not be empty')
		}
		shape = new Array(opts.shape.length)
		let product = 1
		for (let a = 0; a < opts.shape.length; a++) {
			const dim = opts.shape[a]
			if (typeof dim !== 'number') {
				throw new TypeError(`options.shape[${a}] must be an integer`)
			}
			if (!Number.isInteger(dim) || dim < 2) {
				throw new RangeError(`options.shape[${a}] must be an integer >= 2`)
			}
			shape[a] = dim
			product *= dim
		}
		if (product !== values.length) {
			throw new RangeError(
				`Product of options.shape (${product}) must equal values.length (${values.length})`,
			)
		}
	}

	if (edgeOrder === 2) {
		for (let a = 0; a < shape.length; a++) {
			if (shape[a] < 3) {
				throw new RangeError(
					`Axis ${a} length (${shape[a]}) must be at least 3 when options.edgeOrder is 2`,
				)
			}
		}
	}

	const ndim = shape.length
	/** @type {number[]} */
	let spacings
	if (typeof spacing === 'number') {
		if (!Number.isFinite(spacing) || spacing <= 0) {
			throw new RangeError('spacing must be a positive finite number')
		}
		spacings = new Array(ndim).fill(spacing)
	} else if (Array.isArray(spacing) || spacing instanceof Float64Array) {
		if (spacing.length !== ndim) {
			throw new RangeError(
				`spacing length (${spacing.length}) must match number of dimensions (${ndim})`,
			)
		}
		spacings = new Array(ndim)
		for (let a = 0; a < ndim; a++) {
			const h = spacing[a]
			if (typeof h !== 'number') {
				throw new TypeError(`spacing[${a}] must be a positive finite number`)
			}
			if (!Number.isFinite(h) || h <= 0) {
				throw new RangeError(`spacing[${a}] must be a positive finite number`)
			}
			spacings[a] = h
		}
	} else {
		throw new TypeError(
			'spacing must be a positive finite number or an array/Float64Array of positive finite numbers',
		)
	}

	return { shape, spacings, edgeOrder, memoize }
}

/**
 * Computes the discrete numerical gradient of a 1D or row-major n-D scalar field
 * stored in a `Float64Array`, using precomputed finite-difference stencil tables
 * and bounded LRU result memoization with cache isolation.
 *
 * @param {Float64Array} values - Input scalar field samples (finite numbers, length >= 2).
 * @param {number | number[] | Float64Array} [spacing=1] - Uniform positive grid spacing
 *   or per-axis positive spacings `[h0, h1, ...]`.
 * @param {object} [options] - Optional configuration.
 * @param {number[]} [options.shape] - Row-major dimensions `[d0, d1, ...]` whose product
 *   equals `values.length`. Omit for 1D.
 * @param {1 | 2} [options.edgeOrder] - Boundary finite-difference accuracy order
 *   (defaults to `2` for axes with length >= 3, and `1` for axes with length === 2).
 * @param {boolean} [options.memoize=true] - Whether to use bounded result memoization.
 * @returns {Float64Array | Float64Array[]} A `Float64Array` for 1D inputs, or an array
 *   of `Float64Array` partial derivatives (one per axis) for n-D inputs (`shape.length >= 2`).
 * @throws {TypeError} If `values`, `spacing`, or `options` have invalid types.
 * @throws {RangeError} If `values` contains non-finite numbers or has length < 2,
 *   or if `spacing`, `shape`, or `edgeOrder` are out of valid bounds.
 */
export function gradientTypedMemo(values, spacing = 1, options = undefined) {
	const { shape, spacings, edgeOrder, memoize } = validateAndNormalize(
		values,
		spacing,
		options,
	)

	const planKey = `${shape.join(',')}|${spacings.join(',')}|${edgeOrder ?? 'auto'}`
	const canMemoize = memoize && values.length <= MAX_MEMO_ELEMENTS

	let cacheKey = ''
	if (canMemoize) {
		cacheKey = `${planKey}#${values.length}#${hashFloat64Array(values)}`
		const bucket = lruGet(resultCache, cacheKey)
		if (bucket) {
			for (let i = 0; i < bucket.length; i++) {
				if (float64Equal(bucket[i].snapshot, values)) {
					return cloneResult(bucket[i].result)
				}
			}
		}
	}

	const axisPlan = getAxisPlan(shape, spacings, edgeOrder, planKey)
	/** @type {Float64Array | Float64Array[]} */
	let result
	if (axisPlan.length === 1) {
		result = computeAxisGradient(values, axisPlan[0])
	} else {
		result = new Array(axisPlan.length)
		for (let a = 0; a < axisPlan.length; a++) {
			result[a] = computeAxisGradient(values, axisPlan[a])
		}
	}

	if (canMemoize) {
		const entry = {
			snapshot: new Float64Array(values),
			result: cloneResult(result),
		}
		const bucket = resultCache.get(cacheKey)
		if (bucket) {
			bucket.push(entry)
			lruSet(resultCache, cacheKey, bucket, MAX_RESULT_CACHE_ENTRIES)
		} else {
			lruSet(resultCache, cacheKey, [entry], MAX_RESULT_CACHE_ENTRIES)
		}
	}

	return result
}
