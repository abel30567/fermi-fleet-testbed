/**
 * Forward-mode automatic differentiation gradient over dual numbers `{ v, d }`
 * using a table-driven dual operator dispatch table, precomputed basis seed
 * vectors, and per-function LRU memoization.
 *
 * A dual number `{ v, d }` represents `v + d*ε` with `ε² = 0`, where `v` is the
 * primal value and `d` is the forward-mode directional derivative.
 *
 * @module ops/calculus/gradientDualMemo
 */

/**
 * Normalize `-0` to `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Create a validated dual number `{ v, d }`.
 *
 * @param {number} v - Primal value.
 * @param {number} [d=0] - Forward-mode derivative component.
 * @returns {{ v: number, d: number }}
 */
export function createDual(v, d = 0) {
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual components v and d must be numbers')
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual components v and d must be finite numbers')
	}
	return { v: normalizeZero(v), d: normalizeZero(d) }
}

/**
 * Coerce a finite number or dual object `{ v, d }` into a validated dual number.
 *
 * @param {number | { v: number, d: number }} x
 * @returns {{ v: number, d: number }}
 */
function toDual(x) {
	if (typeof x === 'number') {
		if (!Number.isFinite(x)) {
			throw new RangeError('Operand must be a finite number')
		}
		return { v: normalizeZero(x), d: 0 }
	}
	if (x !== null && typeof x === 'object' && typeof x.v === 'number' && typeof x.d === 'number') {
		if (!Number.isFinite(x.v) || !Number.isFinite(x.d)) {
			throw new RangeError('Dual operand components v and d must be finite numbers')
		}
		return x
	}
	throw new TypeError('Operand must be a finite number or a dual object { v, d }')
}

/**
 * Declarative table of unary elementary functions and their derivatives.
 * Each entry defines `[primalFn, derivFn, domainCheck?]`.
 *
 * @type {Readonly<Record<string, [function(number): number, function(number): number, (function(number, number): void)?]>>}
 */
const UNARY_RULE_TABLE = Object.freeze({
	neg: [(v) => -v, () => -1],
	sin: [Math.sin, Math.cos],
	cos: [Math.cos, (v) => -Math.sin(v)],
	tan: [
		Math.tan,
		(v) => {
			const c = Math.cos(v)
			return 1 / (c * c)
		},
	],
	exp: [Math.exp, Math.exp],
	log: [
		Math.log,
		(v) => 1 / v,
		(v) => {
			if (v <= 0) {
				throw new RangeError('log domain error: primal value must be > 0')
			}
		},
	],
	sqrt: [
		Math.sqrt,
		(v) => (v === 0 ? Infinity : 0.5 / Math.sqrt(v)),
		(v) => {
			if (v < 0) {
				throw new RangeError('sqrt domain error: primal value must be >= 0')
			}
		},
	],
	abs: [Math.abs, (v) => (v > 0 ? 1 : v < 0 ? -1 : 0)],
	tanh: [
		Math.tanh,
		(v) => {
			const t = Math.tanh(v)
			return 1 - t * t
		},
	],
	sigmoid: [
		(v) => 1 / (1 + Math.exp(-v)),
		(v) => {
			const s = 1 / (1 + Math.exp(-v))
			return s * (1 - s)
		},
	],
})

/**
 * Build a table-driven unary dual operator from a rule entry using the chain rule:
 * `g(v + d*ε) = g(v) + (g'(v) * d)*ε`.
 *
 * @param {[function(number): number, function(number): number, (function(number, number): void)?]} rule
 * @returns {function(number | { v: number, d: number }): { v: number, d: number }}
 */
function makeUnaryDualOp([primalFn, derivFn, domainCheck]) {
	return function unaryDualOp(input) {
		const a = toDual(input)
		if (domainCheck) {
			domainCheck(a.v, a.d)
		}
		const v = primalFn(a.v)
		const d = a.d === 0 ? 0 : derivFn(a.v) * a.d
		return createDual(v, d)
	}
}

/**
 * Table-driven dual number operations passed to user functions evaluated by
 * `gradientDualMemo`. All operators accept dual objects `{ v, d }` or plain
 * finite numbers (automatically lifted to constants `{ v, d: 0 }`).
 */
export const DUAL_OPS = Object.freeze({
	dual: createDual,
	const: (v) => createDual(v, 0),

	add(a, b) {
		const x = toDual(a)
		const y = toDual(b)
		return createDual(x.v + y.v, x.d + y.d)
	},

	sub(a, b) {
		const x = toDual(a)
		const y = toDual(b)
		return createDual(x.v - y.v, x.d - y.d)
	},

	mul(a, b) {
		const x = toDual(a)
		const y = toDual(b)
		return createDual(x.v * y.v, x.d * y.v + x.v * y.d)
	},

	div(a, b) {
		const x = toDual(a)
		const y = toDual(b)
		if (y.v === 0) {
			throw new RangeError('div domain error: division by zero')
		}
		return createDual(x.v / y.v, (x.d * y.v - x.v * y.d) / (y.v * y.v))
	},

	pow(a, b) {
		const x = toDual(a)
		const y = toDual(b)
		if (y.d === 0) {
			const v = x.v ** y.v
			if (y.v === 0 || x.d === 0) {
				return createDual(v, 0)
			}
			return createDual(v, y.v * x.v ** (y.v - 1) * x.d)
		}
		if (x.v <= 0) {
			throw new RangeError('pow domain error: base must be > 0 when exponent has non-zero derivative')
		}
		const v = x.v ** y.v
		const d = v * (y.d * Math.log(x.v) + (y.v * x.d) / x.v)
		return createDual(v, d)
	},

	...Object.fromEntries(
		Object.entries(UNARY_RULE_TABLE).map(([name, rule]) => [name, makeUnaryDualOp(rule)])
	),
})

/**
 * Precomputed standard basis indicator matrices for dimensions 1..16.
 * `PRECOMPUTED_BASIS_MAX` dimensions are built eagerly at module load; larger
 * dimensions are cached on demand in `BASIS_CACHE`.
 */
const PRECOMPUTED_BASIS_MAX = 16

/** @type {Map<number, ReadonlyArray<Int8Array>>} */
const BASIS_CACHE = new Map()

/**
 * Build the `dim × dim` identity basis seed table for dimension `dim`.
 *
 * @param {number} dim
 * @returns {ReadonlyArray<Int8Array>}
 */
function buildBasisTable(dim) {
	const table = new Array(dim)
	for (let i = 0; i < dim; i++) {
		const basis = new Int8Array(dim)
		basis[i] = 1
		table[i] = basis
	}
	return Object.freeze(table)
}

for (let dim = 1; dim <= PRECOMPUTED_BASIS_MAX; dim++) {
	BASIS_CACHE.set(dim, buildBasisTable(dim))
}

/**
 * Retrieve the precomputed (or lazily cached) identity basis table for `dim`.
 *
 * @param {number} dim
 * @returns {ReadonlyArray<Int8Array>}
 */
function getBasisTable(dim) {
	let table = BASIS_CACHE.get(dim)
	if (!table) {
		table = buildBasisTable(dim)
		BASIS_CACHE.set(dim, table)
	}
	return table
}

const DEFAULT_MAX_CACHE_SIZE = 1024

/**
 * Per-function memoization cache using a WeakMap so functions can be GC'd.
 * Each entry maps a canonical coordinate key to the cached gradient result.
 *
 * @type {WeakMap<Function, Map<string, { value: number, gradient: number[], duals: Array<{ v: number, d: number }> }>>}
 */
const FUNCTION_CACHE = new WeakMap()

/**
 * Extract and validate primal coordinates from `point`.
 * Accepts finite numbers or dual objects `{ v, d }` (using each element's primal `v`).
 *
 * @param {Array<number | { v: number, d: number }>} point
 * @returns {number[]}
 */
function extractPrimalPoint(point) {
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of finite numbers or dual objects { v, d }')
	}
	if (point.length === 0) {
		throw new RangeError('point must be a non-empty array')
	}
	const primal = new Array(point.length)
	for (let i = 0; i < point.length; i++) {
		const el = point[i]
		if (typeof el === 'number') {
			if (!Number.isFinite(el)) {
				throw new RangeError(`point[${i}] must be a finite number`)
			}
			primal[i] = normalizeZero(el)
		} else if (
			el !== null &&
			typeof el === 'object' &&
			typeof el.v === 'number' &&
			typeof el.d === 'number'
		) {
			if (!Number.isFinite(el.v) || !Number.isFinite(el.d)) {
				throw new RangeError(`point[${i}] dual components v and d must be finite numbers`)
			}
			primal[i] = normalizeZero(el.v)
		} else {
			throw new TypeError(`point[${i}] must be a finite number or a dual object { v, d }`)
		}
	}
	return primal
}

/**
 * Validate and normalize optional configuration.
 *
 * @param {object} [options]
 * @returns {{ memoize: boolean, maxCacheSize: number }}
 */
function parseOptions(options) {
	if (options === undefined) {
		return { memoize: true, maxCacheSize: DEFAULT_MAX_CACHE_SIZE }
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}
	const { memoize = true, maxCacheSize = DEFAULT_MAX_CACHE_SIZE } = options
	if (typeof memoize !== 'boolean') {
		throw new TypeError('options.memoize must be a boolean')
	}
	if (typeof maxCacheSize !== 'number' || !Number.isInteger(maxCacheSize) || maxCacheSize < 1) {
		throw new RangeError('options.maxCacheSize must be a positive integer')
	}
	return { memoize, maxCacheSize }
}

/**
 * Validate a dual return value from `fn`.
 *
 * @param {unknown} result
 * @param {number} index
 * @returns {{ v: number, d: number }}
 */
function validateDualResult(result, index) {
	if (
		result === null ||
		typeof result !== 'object' ||
		typeof result.v !== 'number' ||
		typeof result.d !== 'number'
	) {
		throw new TypeError(`fn must return a dual object { v, d } (failed at coordinate ${index})`)
	}
	if (!Number.isFinite(result.v) || !Number.isFinite(result.d)) {
		throw new RangeError(`fn returned non-finite dual value at coordinate ${index}`)
	}
	return { v: normalizeZero(result.v), d: normalizeZero(result.d) }
}

/**
 * Return a defensive clone of a gradient result so caller mutations cannot
 * corrupt memoized entries.
 *
 * @param {{ value: number, gradient: number[], duals: Array<{ v: number, d: number }> }} entry
 * @returns {{ value: number, gradient: number[], duals: Array<{ v: number, d: number }> }}
 */
function cloneResult(entry) {
	return {
		value: entry.value,
		gradient: entry.gradient.slice(),
		duals: entry.duals.map((dual) => ({ v: dual.v, d: dual.d })),
	}
}

/**
 * Compute the gradient of a scalar-valued function `fn` at `point` using
 * forward-mode automatic differentiation over dual numbers `{ v, d }`, backed
 * by a table-driven operator dispatch table, precomputed basis seed vectors,
 * and per-function LRU memoization.
 *
 * For an `n`-dimensional point `x = [x_0, ..., x_{n-1}]`, `fn(duals, ops)` is
 * evaluated once per coordinate `i` with `duals[j] = { v: x_j, d: i === j ? 1 : 0 }`.
 * Each pass produces a dual number `{ v: f(x), d: ∂f/∂x_i }`.
 *
 * @param {function(Array<{ v: number, d: number }>, typeof DUAL_OPS): { v: number, d: number }} fn
 *   Scalar function expressed over dual numbers `{ v, d }`. Receives the seeded
 *   dual coordinate vector and the `DUAL_OPS` dispatch table.
 * @param {Array<number | { v: number, d: number }>} point
 *   Non-empty evaluation point as finite numbers or dual objects `{ v, d }`.
 * @param {{ memoize?: boolean, maxCacheSize?: number }} [options]
 *   Optional memoization settings (`memoize` defaults to `true`,
 *   `maxCacheSize` defaults to `1024`).
 * @returns {{ value: number, gradient: number[], duals: Array<{ v: number, d: number }> }}
 *   The primal value `f(x)`, the partial-derivative vector `∇f(x)`, and the
 *   per-coordinate dual numbers `{ v, d }`.
 */
export function gradientDualMemo(fn, point, options) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
	}
	const primal = extractPrimalPoint(point)
	const { memoize, maxCacheSize } = parseOptions(options)
	const dim = primal.length
	const cacheKey = memoize ? primal.join(',') : ''

	let fnCache
	if (memoize) {
		fnCache = FUNCTION_CACHE.get(fn)
		if (fnCache && fnCache.has(cacheKey)) {
			const hit = fnCache.get(cacheKey)
			// Refresh LRU recency order
			fnCache.delete(cacheKey)
			fnCache.set(cacheKey, hit)
			return cloneResult(hit)
		}
	}

	const basisTable = getBasisTable(dim)
	const duals = new Array(dim)
	const gradient = new Array(dim)
	const seeded = new Array(dim)

	for (let i = 0; i < dim; i++) {
		const basis = basisTable[i]
		for (let j = 0; j < dim; j++) {
			seeded[j] = { v: primal[j], d: basis[j] }
		}
		const res = validateDualResult(fn(seeded, DUAL_OPS), i)
		duals[i] = res
		gradient[i] = res.d
	}

	const result = {
		value: duals[0].v,
		gradient,
		duals,
	}

	if (memoize) {
		if (!fnCache) {
			fnCache = new Map()
			FUNCTION_CACHE.set(fn, fnCache)
		}
		while (fnCache.size >= maxCacheSize) {
			const oldestKey = fnCache.keys().next().value
			fnCache.delete(oldestKey)
		}
		fnCache.set(cacheKey, result)
	}

	return cloneResult(result)
}
