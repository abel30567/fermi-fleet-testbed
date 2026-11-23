/**
 * Fixed-point scale factor (10^18).
 * A real number r is represented as the BigInt round(r * SCALE).
 * @type {bigint}
 */
export const SCALE = 1_000_000_000_000_000_000n

/**
 * Precomputed central finite-difference stencils for first derivatives.
 * Each stencil is exact for polynomials up to degree equal to its order.
 * Offsets, weights, denominator, and optimal default step size (scaled by 10^18)
 * are stored as exact BigInts.
 */
const STENCILS = Object.freeze({
	2: Object.freeze({
		offsets: Object.freeze([-1n, 1n]),
		weights: Object.freeze([-1n, 1n]),
		denominator: 2n,
		defaultStep: 1_000_000_000_000n, // 10^-6
	}),
	4: Object.freeze({
		offsets: Object.freeze([-2n, -1n, 1n, 2n]),
		weights: Object.freeze([1n, -8n, 8n, -1n]),
		denominator: 12n,
		defaultStep: 100_000_000_000_000n, // 10^-4
	}),
	6: Object.freeze({
		offsets: Object.freeze([-3n, -2n, -1n, 1n, 2n, 3n]),
		weights: Object.freeze([-1n, 9n, -45n, 45n, -9n, 1n]),
		denominator: 60n,
		defaultStep: 1_000_000_000_000_000n, // 10^-3
	}),
	8: Object.freeze({
		offsets: Object.freeze([-4n, -3n, -2n, -1n, 1n, 2n, 3n, 4n]),
		weights: Object.freeze([3n, -32n, 168n, -672n, 672n, -168n, 32n, -3n]),
		denominator: 840n,
		defaultStep: 10_000_000_000_000_000n, // 10^-2
	}),
})

/**
 * Precomputed Levi-Civita index table for 3D curl components:
 *   curl_x = dFz/dy - dFy/dz
 *   curl_y = dFx/dz - dFz/dx
 *   curl_z = dFy/dx - dFx/dy
 */
const CURL_TERMS = Object.freeze([
	Object.freeze({ posComp: 2, posAxis: 1, negComp: 1, negAxis: 2 }),
	Object.freeze({ posComp: 0, posAxis: 2, negComp: 2, negAxis: 0 }),
	Object.freeze({ posComp: 1, posAxis: 0, negComp: 0, negAxis: 1 }),
])

/**
 * Precomputed table of off-diagonal vector components required when
 * differentiating along each coordinate axis (diagonal components cancel
 * out of the curl and are skipped for component-array fields).
 */
const AXIS_NEEDED_COMPS = Object.freeze([
	Object.freeze([1, 2]),
	Object.freeze([0, 2]),
	Object.freeze([0, 1]),
])

const DEFAULT_ORDER = 4
const MAX_CACHE_ENTRIES = 16384

/**
 * WeakMap memoization caches keyed by field function identity so unused
 * fields can be garbage-collected automatically.
 */
const vectorFieldCache = new WeakMap()
const scalarComponentEvalCache = new WeakMap()
const tupleCurlCache = new WeakMap()

/**
 * Bounded Map insert with FIFO eviction.
 * @template K, V
 * @param {Map<K, V>} map
 * @param {K} key
 * @param {V} value
 */
function cacheSet(map, key, value) {
	if (map.size >= MAX_CACHE_ENTRIES && !map.has(key)) {
		const oldestKey = map.keys().next().value
		map.delete(oldestKey)
	}
	map.set(key, value)
}

/**
 * Exact BigInt division with round-half-to-even (den must be > 0n).
 * @param {bigint} num
 * @param {bigint} den
 * @returns {bigint}
 */
function divRoundHalfToEven(num, den) {
	const q = num / den
	const r = num % den
	if (r === 0n) return q
	const absR2 = (r < 0n ? -r : r) * 2n
	if (absR2 > den) return num > 0n ? q + 1n : q - 1n
	if (absR2 < den) return q
	return (q & 1n) === 0n ? q : (num > 0n ? q + 1n : q - 1n)
}

/**
 * Retrieve or create cache bucket for a single vector-field function.
 * @param {Function} fieldFn
 * @returns {{ evalCache: Map<string, readonly [bigint, bigint, bigint]>, curlCache: Map<string, readonly [bigint, bigint, bigint]> }}
 */
function getVectorFieldCaches(fieldFn) {
	let entry = vectorFieldCache.get(fieldFn)
	if (!entry) {
		entry = { evalCache: new Map(), curlCache: new Map() }
		vectorFieldCache.set(fieldFn, entry)
	}
	return entry
}

/**
 * Retrieve or create evaluation cache for a single scalar component function.
 * @param {Function} compFn
 * @returns {Map<string, bigint>}
 */
function getScalarEvalCache(compFn) {
	let cache = scalarComponentEvalCache.get(compFn)
	if (!cache) {
		cache = new Map()
		scalarComponentEvalCache.set(compFn, cache)
	}
	return cache
}

/**
 * Retrieve or create curl-result cache keyed by the triple (fx, fy, fz).
 * @param {readonly [Function, Function, Function]} comps
 * @returns {Map<string, readonly [bigint, bigint, bigint]>}
 */
function getTupleCurlCache(comps) {
	const [fx, fy, fz] = comps
	let level1 = tupleCurlCache.get(fx)
	if (!level1) {
		level1 = new WeakMap()
		tupleCurlCache.set(fx, level1)
	}
	let level2 = level1.get(fy)
	if (!level2) {
		level2 = new WeakMap()
		level1.set(fy, level2)
	}
	let cache = level2.get(fz)
	if (!cache) {
		cache = new Map()
		level2.set(fz, cache)
	}
	return cache
}

/**
 * Validate a 3-element BigInt tuple.
 * @param {unknown} tuple
 * @param {string} label
 * @returns {readonly [bigint, bigint, bigint]}
 */
function assertBigIntVec3(tuple, label) {
	if (
		!Array.isArray(tuple) ||
		tuple.length !== 3 ||
		typeof tuple[0] !== 'bigint' ||
		typeof tuple[1] !== 'bigint' ||
		typeof tuple[2] !== 'bigint'
	) {
		throw new TypeError(`${label} must be a 3-element array of BigInts`)
	}
	return tuple
}

/**
 * Parse and validate options (or shorthand BigInt step size).
 * @param {bigint | { h?: bigint, order?: 2 | 4 | 6 | 8, memo?: boolean } | undefined} options
 * @returns {{ stencil: typeof STENCILS[4], step: bigint, order: 2 | 4 | 6 | 8, memo: boolean }}
 */
function parseOptions(options) {
	if (options === undefined) {
		const stencil = STENCILS[DEFAULT_ORDER]
		return { stencil, step: stencil.defaultStep, order: DEFAULT_ORDER, memo: true }
	}
	if (typeof options === 'bigint') {
		if (options <= 0n) {
			throw new RangeError('Step size h must be a positive BigInt')
		}
		return { stencil: STENCILS[DEFAULT_ORDER], step: options, order: DEFAULT_ORDER, memo: true }
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a positive BigInt step size or an options object')
	}

	let order = DEFAULT_ORDER
	if (options.order !== undefined) {
		if (typeof options.order !== 'number' || !Number.isInteger(options.order)) {
			throw new TypeError('options.order must be an integer (2, 4, 6, or 8)')
		}
		if (!Object.prototype.hasOwnProperty.call(STENCILS, options.order)) {
			throw new RangeError('options.order must be one of 2, 4, 6, or 8')
		}
		order = options.order
	}

	const stencil = STENCILS[order]
	let step = stencil.defaultStep
	if (options.h !== undefined) {
		if (typeof options.h !== 'bigint') {
			throw new TypeError('options.h must be a BigInt')
		}
		if (options.h <= 0n) {
			throw new RangeError('options.h must be a positive BigInt')
		}
		step = options.h
	}

	let memo = true
	if (options.memo !== undefined) {
		if (typeof options.memo !== 'boolean') {
			throw new TypeError('options.memo must be a boolean')
		}
		memo = options.memo
	}

	return { stencil, step, order, memo }
}

/**
 * Compute the 3D vector-calculus curl (∇ × F) of a vector field F at a given
 * point using exact fixed-point BigInt arithmetic (scaled by 10^18) with
 * precomputed central finite-difference stencils, a Levi-Civita index table,
 * and WeakMap-backed memoization of both point evaluations and curl results.
 *
 * All coordinate inputs, field outputs, step sizes, and returned curl components
 * are fixed-point BigInts scaled by `SCALE = 10n ** 18n`.
 *
 * @param {((x: bigint, y: bigint, z: bigint) => [bigint, bigint, bigint]) | [((x: bigint, y: bigint, z: bigint) => bigint), ((x: bigint, y: bigint, z: bigint) => bigint), ((x: bigint, y: bigint, z: bigint) => bigint)]} field
 *   A 3D vector field represented either as a function `(x, y, z) => [fx, fy, fz]`
 *   or as a 3-element tuple of scalar component functions `[fx, fy, fz]`.
 * @param {[bigint, bigint, bigint]} point
 *   Evaluation point `[x, y, z]` in fixed-point BigInts (scaled by 10^18).
 * @param {bigint | { h?: bigint, order?: 2 | 4 | 6 | 8, memo?: boolean }} [options]
 *   Optional positive BigInt step size `h`, or an options object:
 *   - `h`: positive BigInt step size (defaults to stencil-optimal step for `order`)
 *   - `order`: central difference accuracy order: `2`, `4` (default), `6`, or `8`
 *   - `memo`: whether to use persistent WeakMap memoization (default `true`)
 * @returns {[bigint, bigint, bigint]}
 *   The curl vector `[dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy]` as
 *   fixed-point BigInts scaled by 10^18 (rounded half-to-even when non-integer).
 */
export function curlBigIntMemo(field, point, options) {
	const isFnField = typeof field === 'function'
	const isTupleField =
		!isFnField &&
		Array.isArray(field) &&
		field.length === 3 &&
		typeof field[0] === 'function' &&
		typeof field[1] === 'function' &&
		typeof field[2] === 'function'

	if (!isFnField && !isTupleField) {
		throw new TypeError(
			'field must be a function (x, y, z) => [fx, fy, fz] or an array of 3 component functions [fx, fy, fz]'
		)
	}

	const [x, y, z] = assertBigIntVec3(point, 'point')
	const { stencil, step, order, memo } = parseOptions(options)

	const curlKey = memo ? `${x},${y},${z}|${step}|${order}` : ''
	let curlCache = null
	let vectorEvalCache = null
	let scalarCaches = null

	if (memo) {
		if (isFnField) {
			const caches = getVectorFieldCaches(field)
			curlCache = caches.curlCache
			vectorEvalCache = caches.evalCache
		} else {
			curlCache = getTupleCurlCache(field)
			scalarCaches = [
				getScalarEvalCache(field[0]),
				getScalarEvalCache(field[1]),
				getScalarEvalCache(field[2]),
			]
		}

		const cachedCurl = curlCache.get(curlKey)
		if (cachedCurl !== undefined) {
			return [cachedCurl[0], cachedCurl[1], cachedCurl[2]]
		}
	}

	const { offsets, weights, denominator } = stencil
	const derivNum = [
		[0n, 0n, 0n],
		[0n, 0n, 0n],
		[0n, 0n, 0n],
	]

	if (isFnField) {
		for (let axis = 0; axis < 3; axis++) {
			const acc = derivNum[axis]
			const needed = AXIS_NEEDED_COMPS[axis]
			const c0 = needed[0]
			const c1 = needed[1]

			for (let i = 0; i < offsets.length; i++) {
				const delta = offsets[i] * step
				const px = axis === 0 ? x + delta : x
				const py = axis === 1 ? y + delta : y
				const pz = axis === 2 ? z + delta : z

				let val
				if (vectorEvalCache !== null) {
					const ptKey = `${px},${py},${pz}`
					val = vectorEvalCache.get(ptKey)
					if (val === undefined) {
						const raw = assertBigIntVec3(field(px, py, pz), 'field(x, y, z)')
						val = Object.freeze([raw[0], raw[1], raw[2]])
						cacheSet(vectorEvalCache, ptKey, val)
					}
				} else {
					val = assertBigIntVec3(field(px, py, pz), 'field(x, y, z)')
				}

				const w = weights[i]
				acc[c0] += w * val[c0]
				acc[c1] += w * val[c1]
			}
		}
	} else {
		for (let axis = 0; axis < 3; axis++) {
			const acc = derivNum[axis]
			const needed = AXIS_NEEDED_COMPS[axis]

			for (let i = 0; i < offsets.length; i++) {
				const delta = offsets[i] * step
				const px = axis === 0 ? x + delta : x
				const py = axis === 1 ? y + delta : y
				const pz = axis === 2 ? z + delta : z
				const ptKey = scalarCaches !== null ? `${px},${py},${pz}` : ''
				const w = weights[i]

				for (let n = 0; n < needed.length; n++) {
					const comp = needed[n]
					let v
					if (scalarCaches !== null) {
						const sc = scalarCaches[comp]
						v = sc.get(ptKey)
						if (v === undefined) {
							v = field[comp](px, py, pz)
							if (typeof v !== 'bigint') {
								throw new TypeError(`field[${comp}](x, y, z) must return a BigInt`)
							}
							cacheSet(sc, ptKey, v)
						}
					} else {
						v = field[comp](px, py, pz)
						if (typeof v !== 'bigint') {
							throw new TypeError(`field[${comp}](x, y, z) must return a BigInt`)
						}
					}
					acc[comp] += w * v
				}
			}
		}
	}

	const denom = denominator * step
	const res = [0n, 0n, 0n]
	for (let c = 0; c < 3; c++) {
		const term = CURL_TERMS[c]
		const diffNum = derivNum[term.posAxis][term.posComp] - derivNum[term.negAxis][term.negComp]
		res[c] = divRoundHalfToEven(diffNum * SCALE, denom)
	}

	if (curlCache !== null) {
		cacheSet(curlCache, curlKey, Object.freeze([res[0], res[1], res[2]]))
	}

	return res
}
