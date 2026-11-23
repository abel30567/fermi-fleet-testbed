/**
 * @fileoverview Memoized, table-driven multivariable calculus gradient over exact BigInt values.
 *
 * Computes the gradient vector ∇f(x) = (∂f/∂x_0, ..., ∂f/∂x_{n-1}) for a scalar-valued
 * BigInt function using precomputed central finite-difference stencil tables of order
 * 2, 4, 6, or 8, returning fixed-point BigInt values scaled by 10^18 (with exact
 * round-half-to-even division for non-integer partial derivatives).
 */

/**
 * Default fixed-point scaling factor (10^18).
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

/**
 * Maximum number of cached entries per function for evaluation and gradient memo tables.
 * @type {number}
 */
const MAX_CACHE_ENTRIES = 10_000

/**
 * Precomputed central finite-difference stencil tables for first derivatives.
 *
 * Each stencil of accuracy order 2m is exact for all polynomials of degree <= 2m:
 *   f'(x) ≈ (1 / (divisor * h)) * Σ weight_k * f(x + offset_k * h)
 *
 * @type {Readonly<Record<number, Readonly<{ divisor: bigint, terms: ReadonlyArray<Readonly<{ offset: bigint, weight: bigint }>> }>>>}
 */
export const STENCIL_TABLE = Object.freeze({
	2: Object.freeze({
		divisor: 2n,
		terms: Object.freeze([
			Object.freeze({ offset: -1n, weight: -1n }),
			Object.freeze({ offset: 1n, weight: 1n }),
		]),
	}),
	4: Object.freeze({
		divisor: 12n,
		terms: Object.freeze([
			Object.freeze({ offset: -2n, weight: 1n }),
			Object.freeze({ offset: -1n, weight: -8n }),
			Object.freeze({ offset: 1n, weight: 8n }),
			Object.freeze({ offset: 2n, weight: -1n }),
		]),
	}),
	6: Object.freeze({
		divisor: 60n,
		terms: Object.freeze([
			Object.freeze({ offset: -3n, weight: -1n }),
			Object.freeze({ offset: -2n, weight: 9n }),
			Object.freeze({ offset: -1n, weight: -45n }),
			Object.freeze({ offset: 1n, weight: 45n }),
			Object.freeze({ offset: 2n, weight: -9n }),
			Object.freeze({ offset: 3n, weight: 1n }),
		]),
	}),
	8: Object.freeze({
		divisor: 840n,
		terms: Object.freeze([
			Object.freeze({ offset: -4n, weight: 3n }),
			Object.freeze({ offset: -3n, weight: -32n }),
			Object.freeze({ offset: -2n, weight: 168n }),
			Object.freeze({ offset: -1n, weight: -672n }),
			Object.freeze({ offset: 1n, weight: 672n }),
			Object.freeze({ offset: 2n, weight: -168n }),
			Object.freeze({ offset: 3n, weight: 32n }),
			Object.freeze({ offset: 4n, weight: -3n }),
		]),
	}),
})

/**
 * Per-function memoization tables keyed weakly by the scalar field function so
 * temporary functions can be garbage-collected automatically.
 *
 * @type {WeakMap<Function, { evalCache: Map<string, bigint>, gradCache: Map<string, bigint[]> }>}
 */
const fnMemoStore = new WeakMap()

/**
 * Exact BigInt division with round-half-to-even (banker's rounding).
 *
 * @param {bigint} numerator - Signed numerator.
 * @param {bigint} denominator - Strictly positive denominator.
 * @returns {bigint} Nearest BigInt to numerator / denominator (ties to even).
 */
function divRoundHalfToEven(numerator, denominator) {
	const quotient = numerator / denominator
	const remainder = numerator % denominator
	if (remainder === 0n) return quotient

	const absRemainder = remainder < 0n ? -remainder : remainder
	const twiceRemainder = absRemainder * 2n

	if (twiceRemainder < denominator) return quotient
	if (twiceRemainder > denominator) {
		return remainder < 0n ? quotient - 1n : quotient + 1n
	}
	// Exact half-way tie: round toward the even integer.
	if ((quotient & 1n) === 0n) return quotient
	return remainder < 0n ? quotient - 1n : quotient + 1n
}

/**
 * Insert or refresh an entry in a bounded LRU Map.
 *
 * @template V
 * @param {Map<string, V>} cache
 * @param {string} key
 * @param {V} value
 */
function cacheSet(cache, key, value) {
	if (cache.has(key)) {
		cache.delete(key)
	} else if (cache.size >= MAX_CACHE_ENTRIES) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}
	cache.set(key, value)
}

/**
 * Retrieve and refresh an entry in a bounded LRU Map.
 *
 * @template V
 * @param {Map<string, V>} cache
 * @param {string} key
 * @returns {V | undefined}
 */
function cacheGet(cache, key) {
	if (!cache.has(key)) return undefined
	const value = cache.get(key)
	cache.delete(key)
	cache.set(key, value)
	return value
}

/**
 * Retrieve or initialize the memoization tables for a scalar field function.
 *
 * @param {Function} fn
 * @returns {{ evalCache: Map<string, bigint>, gradCache: Map<string, bigint[]> }}
 */
function getFnMemo(fn) {
	let entry = fnMemoStore.get(fn)
	if (!entry) {
		entry = {
			evalCache: new Map(),
			gradCache: new Map(),
		}
		fnMemoStore.set(fn, entry)
	}
	return entry
}

/**
 * Serialize a BigInt coordinate vector to a canonical string key.
 * Since BigInt string representations only contain digits and an optional '-',
 * comma joining is injective.
 *
 * @param {readonly bigint[]} coords
 * @returns {string}
 */
function serializePoint(coords) {
	return coords.join(',')
}

/**
 * Compute the gradient ∇f(point) of a multivariable scalar BigInt function using
 * precomputed central finite-difference stencils and memoization.
 *
 * Each partial derivative ∂f/∂x_i is returned as a fixed-point BigInt scaled by
 * `scale` (default `10n ** 18n`), rounded half-to-even when non-integer. Because
 * Δf / Δx is scale-invariant when domain and codomain share a common fixed-point
 * scale, this works identically for unscaled integer functions and uniformly
 * fixed-point-scaled functions.
 *
 * @param {(point: bigint[]) => bigint} fn - Pure scalar field mapping a BigInt coordinate array to a BigInt.
 * @param {readonly bigint[]} point - Non-empty array of BigInt coordinates where the gradient is evaluated.
 * @param {object} [options] - Optional configuration.
 * @param {bigint} [options.step=1n] - Positive BigInt finite-difference step size h.
 * @param {2 | 4 | 6 | 8} [options.order=4] - Central difference accuracy order from STENCIL_TABLE.
 * @param {bigint} [options.scale=SCALE] - Positive BigInt fixed-point output scale (default 10^18).
 * @param {boolean} [options.memoize=true] - Whether to memoize function evaluations and gradient results.
 * @returns {bigint[]} Gradient vector [∂f/∂x_0, ..., ∂f/∂x_{n-1}] scaled by `scale`.
 * @throws {TypeError} If arguments or `fn` return values have invalid types.
 * @throws {RangeError} If `point` is empty, `step <= 0n`, `scale <= 0n`, or `order` is unsupported.
 */
export function gradientBigIntMemo(fn, point, options = {}) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of BigInt values')
	}
	if (point.length === 0) {
		throw new RangeError('point must be a non-empty array')
	}
	for (let i = 0; i < point.length; i++) {
		if (typeof point[i] !== 'bigint') {
			throw new TypeError(`point[${i}] must be a BigInt`)
		}
	}

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const { step = 1n, order = 4, scale = SCALE, memoize = true } = options

	if (typeof step !== 'bigint') {
		throw new TypeError('options.step must be a BigInt')
	}
	if (step <= 0n) {
		throw new RangeError('options.step must be positive')
	}

	if (typeof order !== 'number' || !Number.isInteger(order)) {
		throw new TypeError('options.order must be an integer')
	}
	const stencil = STENCIL_TABLE[order]
	if (!stencil) {
		throw new RangeError('options.order must be one of 2, 4, 6, 8')
	}

	if (typeof scale !== 'bigint') {
		throw new TypeError('options.scale must be a BigInt')
	}
	if (scale <= 0n) {
		throw new RangeError('options.scale must be positive')
	}

	if (typeof memoize !== 'boolean') {
		throw new TypeError('options.memoize must be a boolean')
	}

	const memo = memoize ? getFnMemo(fn) : null
	const basePoint = point.slice()
	let gradKey = ''

	if (memo) {
		gradKey = `${order}|${step}|${scale}|${serializePoint(basePoint)}`
		const cachedGrad = cacheGet(memo.gradCache, gradKey)
		if (cachedGrad !== undefined) {
			return cachedGrad.slice()
		}
	}

	/**
	 * Evaluate `fn` at `coords` with optional memoization and strict BigInt return validation.
	 * Passes a fresh copy of `coords` to prevent external mutation of internal state.
	 *
	 * @param {bigint[]} coords
	 * @returns {bigint}
	 */
	const evalAt = (coords) => {
		if (memo) {
			const key = serializePoint(coords)
			const cached = cacheGet(memo.evalCache, key)
			if (cached !== undefined) return cached

			const value = fn(coords.slice())
			if (typeof value !== 'bigint') {
				throw new TypeError('fn must return a BigInt')
			}
			cacheSet(memo.evalCache, key, value)
			return value
		}

		const value = fn(coords.slice())
		if (typeof value !== 'bigint') {
			throw new TypeError('fn must return a BigInt')
		}
		return value
	}

	const dims = basePoint.length
	const denominator = stencil.divisor * step
	const probe = basePoint.slice()
	const gradient = new Array(dims)

	for (let d = 0; d < dims; d++) {
		const center = basePoint[d]
		let weightedSum = 0n

		for (let t = 0; t < stencil.terms.length; t++) {
			const { offset, weight } = stencil.terms[t]
			probe[d] = center + offset * step
			weightedSum += weight * evalAt(probe)
		}

		probe[d] = center
		gradient[d] = divRoundHalfToEven(weightedSum * scale, denominator)
	}

	if (memo) {
		cacheSet(memo.gradCache, gradKey, gradient.slice())
	}

	return gradient
}
