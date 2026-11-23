/**
 * @module ops/calculus/derivativeDualMemo
 *
 * Forward-mode calculus derivative over dual numbers `{ v, d }` carrying a
 * primal value `v` alongside its forward-mode derivative (tangent) `d`,
 * backed by precomputed derivative lookup tables and bounded memoization.
 */

/**
 * @typedef {Object} Dual
 * @property {number} v - Primal value (finite real number).
 * @property {number} d - Forward-mode derivative / tangent (finite real number).
 */

/**
 * @typedef {Object} DerivativeOptions
 * @property {boolean} [memoize=true] - Whether to use memoization for repeated evaluations.
 */

const MAX_CACHE_ENTRIES = 1024

/**
 * Normalizes `-0` to `0` so outputs and cache keys are canonical.
 * @param {number} n
 * @returns {number}
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n
}

/**
 * Validates that a value is a finite number.
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function assertFiniteNumber(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number`)
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`${label} must be a finite number`)
	}
	return normalizeZero(value)
}

/**
 * Validates and normalizes an input into a dual number `{ v, d }`.
 * When `liftConstant` is true, a plain number `n` becomes `{ v: n, d: 0 }`;
 * otherwise it becomes the independent variable `{ v: n, d: 1 }`.
 * @param {number | Dual} input
 * @param {string} label
 * @param {boolean} [liftConstant=false]
 * @returns {Dual}
 */
function toDual(input, label, liftConstant = false) {
	if (typeof input === 'number') {
		const v = assertFiniteNumber(input, label)
		return { v, d: liftConstant ? 0 : 1 }
	}
	if (input === null || typeof input !== 'object' || Array.isArray(input)) {
		throw new TypeError(`${label} must be a finite number or a dual object { v, d }`)
	}
	const v = assertFiniteNumber(input.v, `${label}.v`)
	const d = assertFiniteNumber(input.d, `${label}.d`)
	return { v, d }
}

/**
 * Validates that a computed dual result has finite `v` and `d`.
 * @param {unknown} result
 * @param {string} context
 * @returns {Dual}
 */
function validateDualResult(result, context) {
	if (result === null || typeof result !== 'object' || Array.isArray(result)) {
		throw new TypeError(`${context} must return a dual object { v, d }`)
	}
	const v = assertFiniteNumber(result.v, `${context}.v`)
	const d = assertFiniteNumber(result.d, `${context}.d`)
	return { v, d }
}

/**
 * Precomputed lookup table of unary calculus functions and their analytic
 * derivatives `df(v)`, plus optional domain checks.
 *
 * Each entry defines:
 * - `fn(v)`: primal value f(v)
 * - `df(v)`: derivative f'(v)
 * - `checkValue?(v)`: throws RangeError if `v` is outside the function domain
 * - `checkDeriv?(v)`: throws RangeError if `f'(v)` is undefined/non-finite
 */
const DUAL_UNARY_TABLE = Object.freeze({
	identity: Object.freeze({
		fn: (v) => v,
		df: () => 1,
	}),
	neg: Object.freeze({
		fn: (v) => -v,
		df: () => -1,
	}),
	square: Object.freeze({
		fn: (v) => v * v,
		df: (v) => 2 * v,
	}),
	cube: Object.freeze({
		fn: (v) => v * v * v,
		df: (v) => 3 * v * v,
	}),
	reciprocal: Object.freeze({
		checkValue: (v) => {
			if (v === 0) throw new RangeError('reciprocal is undefined at v = 0')
		},
		fn: (v) => 1 / v,
		df: (v) => -1 / (v * v),
	}),
	sin: Object.freeze({
		fn: Math.sin,
		df: Math.cos,
	}),
	cos: Object.freeze({
		fn: Math.cos,
		df: (v) => -Math.sin(v),
	}),
	tan: Object.freeze({
		checkValue: (v) => {
			if (Math.cos(v) === 0) throw new RangeError('tan is undefined where cos(v) = 0')
		},
		fn: Math.tan,
		df: (v) => {
			const c = Math.cos(v)
			return 1 / (c * c)
		},
	}),
	asin: Object.freeze({
		checkValue: (v) => {
			if (v < -1 || v > 1) throw new RangeError('asin requires -1 <= v <= 1')
		},
		checkDeriv: (v) => {
			if (v <= -1 || v >= 1) throw new RangeError('asin derivative is undefined at |v| = 1')
		},
		fn: Math.asin,
		df: (v) => 1 / Math.sqrt(1 - v * v),
	}),
	acos: Object.freeze({
		checkValue: (v) => {
			if (v < -1 || v > 1) throw new RangeError('acos requires -1 <= v <= 1')
		},
		checkDeriv: (v) => {
			if (v <= -1 || v >= 1) throw new RangeError('acos derivative is undefined at |v| = 1')
		},
		fn: Math.acos,
		df: (v) => -1 / Math.sqrt(1 - v * v),
	}),
	atan: Object.freeze({
		fn: Math.atan,
		df: (v) => 1 / (1 + v * v),
	}),
	sinh: Object.freeze({
		fn: Math.sinh,
		df: Math.cosh,
	}),
	cosh: Object.freeze({
		fn: Math.cosh,
		df: Math.sinh,
	}),
	tanh: Object.freeze({
		fn: Math.tanh,
		df: (v) => {
			const t = Math.tanh(v)
			return 1 - t * t
		},
	}),
	exp: Object.freeze({
		fn: Math.exp,
		df: Math.exp,
	}),
	expm1: Object.freeze({
		fn: Math.expm1,
		df: Math.exp,
	}),
	log: Object.freeze({
		checkValue: (v) => {
			if (v <= 0) throw new RangeError('log requires v > 0')
		},
		fn: Math.log,
		df: (v) => 1 / v,
	}),
	log1p: Object.freeze({
		checkValue: (v) => {
			if (v <= -1) throw new RangeError('log1p requires v > -1')
		},
		fn: Math.log1p,
		df: (v) => 1 / (1 + v),
	}),
	sqrt: Object.freeze({
		checkValue: (v) => {
			if (v < 0) throw new RangeError('sqrt requires v >= 0')
		},
		checkDeriv: (v) => {
			if (v <= 0) throw new RangeError('sqrt derivative is undefined at v = 0')
		},
		fn: Math.sqrt,
		df: (v) => 1 / (2 * Math.sqrt(v)),
	}),
	cbrt: Object.freeze({
		checkDeriv: (v) => {
			if (v === 0) throw new RangeError('cbrt derivative is undefined at v = 0')
		},
		fn: Math.cbrt,
		df: (v) => {
			const c = Math.cbrt(v)
			return 1 / (3 * c * c)
		},
	}),
	abs: Object.freeze({
		checkDeriv: (v) => {
			if (v === 0) throw new RangeError('abs derivative is undefined at v = 0')
		},
		fn: Math.abs,
		df: (v) => (v > 0 ? 1 : -1),
	}),
})

/**
 * Bounded Map setter using FIFO eviction to cap memory usage.
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @param {V} value
 */
function setBounded(cache, key, value) {
	if (!cache.has(key) && cache.size >= MAX_CACHE_ENTRIES) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}
	cache.set(key, value)
}

/** Memoization cache for named unary table operations: opName -> Map<v, { val, deriv | null }> */
const unaryMemoCache = new Map()

/** Memoization cache for custom functions: WeakMap<Function, Map<`${v}|${d}`, Dual>> */
const fnMemoCache = new WeakMap()

/** Memoization cache for polynomial arrays: Map<`${coeffsKey}|${v}`, { val, dp }> */
const polyMemoCache = new Map()

/**
 * Evaluates a named unary operation from `DUAL_UNARY_TABLE` on a dual number,
 * optionally using the precomputed/memoized `(opName, v)` cache.
 * @param {string} opName
 * @param {Dual} dual
 * @param {boolean} memoize
 * @returns {Dual}
 */
function evalUnaryTable(opName, dual, memoize) {
	const entry = DUAL_UNARY_TABLE[opName]
	if (!entry) {
		throw new RangeError(`Unknown unary operation: "${opName}"`)
	}

	const { v, d } = dual
	let opCache
	if (memoize) {
		opCache = unaryMemoCache.get(opName)
		if (!opCache) {
			opCache = new Map()
			unaryMemoCache.set(opName, opCache)
		}
		const cached = opCache.get(v)
		if (cached !== undefined) {
			if (d === 0) {
				return { v: cached.val, d: 0 }
			}
			if (cached.deriv !== null) {
				const derivScaled = assertFiniteNumber(cached.deriv * d, `${opName}.d`)
				return { v: cached.val, d: derivScaled }
			}
		}
	}

	if (entry.checkValue) entry.checkValue(v)
	const val = assertFiniteNumber(entry.fn(v), `${opName}.v`)

	if (d === 0) {
		if (memoize && !opCache.has(v)) {
			setBounded(opCache, v, { val, deriv: null })
		}
		return { v: val, d: 0 }
	}

	if (entry.checkDeriv) entry.checkDeriv(v)
	const deriv = assertFiniteNumber(entry.df(v), `${opName}.df`)
	if (memoize) {
		setBounded(opCache, v, { val, deriv })
	}
	const derivScaled = assertFiniteNumber(deriv * d, `${opName}.d`)
	return { v: val, d: derivScaled }
}

/**
 * Evaluates a polynomial `sum_{k=0}^n coeffs[k] * x^k` and its forward-mode
 * derivative over a dual number using Horner's scheme.
 * @param {number[]} coeffs
 * @param {Dual} dual
 * @param {boolean} memoize
 * @returns {Dual}
 */
function evalPolynomial(coeffs, dual, memoize) {
	if (coeffs.length === 0) {
		throw new RangeError('Polynomial coefficient array must not be empty')
	}
	const normalized = new Array(coeffs.length)
	for (let i = 0; i < coeffs.length; i++) {
		normalized[i] = assertFiniteNumber(coeffs[i], `coeffs[${i}]`)
	}

	const { v, d } = dual
	const cacheKey = memoize ? `${normalized.join(',')}|${v}` : ''
	if (memoize) {
		const cached = polyMemoCache.get(cacheKey)
		if (cached !== undefined) {
			const dOut = assertFiniteNumber(cached.dp * d, 'poly.d')
			return { v: cached.val, d: dOut }
		}
	}

	let val = normalized[normalized.length - 1]
	let dp = 0
	for (let i = normalized.length - 2; i >= 0; i--) {
		dp = dp * v + val
		val = val * v + normalized[i]
	}

	const vOut = assertFiniteNumber(val, 'poly.v')
	const dpOut = assertFiniteNumber(dp, 'poly.dp')
	if (memoize) {
		setBounded(polyMemoCache, cacheKey, { val: vOut, dp: dpOut })
	}
	const dOut = assertFiniteNumber(dpOut * d, 'poly.d')
	return { v: vOut, d: dOut }
}

/**
 * Precomputed table of binary dual-number calculus operations.
 */
const DUAL_BINARY_TABLE = Object.freeze({
	add(a, b) {
		const da = toDual(a, 'a', true)
		const db = toDual(b, 'b', true)
		return {
			v: assertFiniteNumber(da.v + db.v, 'add.v'),
			d: assertFiniteNumber(da.d + db.d, 'add.d'),
		}
	},
	sub(a, b) {
		const da = toDual(a, 'a', true)
		const db = toDual(b, 'b', true)
		return {
			v: assertFiniteNumber(da.v - db.v, 'sub.v'),
			d: assertFiniteNumber(da.d - db.d, 'sub.d'),
		}
	},
	mul(a, b) {
		const da = toDual(a, 'a', true)
		const db = toDual(b, 'b', true)
		return {
			v: assertFiniteNumber(da.v * db.v, 'mul.v'),
			d: assertFiniteNumber(da.d * db.v + da.v * db.d, 'mul.d'),
		}
	},
	div(a, b) {
		const da = toDual(a, 'a', true)
		const db = toDual(b, 'b', true)
		if (db.v === 0) {
			throw new RangeError('Division by zero in dual arithmetic')
		}
		return {
			v: assertFiniteNumber(da.v / db.v, 'div.v'),
			d: assertFiniteNumber((da.d * db.v - da.v * db.d) / (db.v * db.v), 'div.d'),
		}
	},
	pow(a, b) {
		const da = toDual(a, 'a', true)
		const db = toDual(b, 'b', true)
		if (db.d === 0) {
			const n = db.v
			const v = assertFiniteNumber(da.v ** n, 'pow.v')
			if (n === 0 || da.d === 0) {
				return { v, d: 0 }
			}
			const d = assertFiniteNumber(n * (da.v ** (n - 1)) * da.d, 'pow.d')
			return { v, d }
		}
		if (da.v <= 0) {
			throw new RangeError('pow(a, b) with non-constant exponent requires a.v > 0')
		}
		const v = assertFiniteNumber(da.v ** db.v, 'pow.v')
		const d = assertFiniteNumber(
			v * (db.d * Math.log(da.v) + (db.v * da.d) / da.v),
			'pow.d',
		)
		return { v, d }
	},
})

/**
 * Builds the frozen dual-number operations table passed to user functions.
 * @returns {Readonly<Record<string, Function>>}
 */
function buildDualOps() {
	const ops = {
		constant(c) {
			return { v: assertFiniteNumber(c, 'c'), d: 0 }
		},
		variable(v, d = 1) {
			return {
				v: assertFiniteNumber(v, 'v'),
				d: assertFiniteNumber(d, 'd'),
			}
		},
		poly(coeffs, x) {
			if (!Array.isArray(coeffs)) {
				throw new TypeError('coeffs must be an array of finite numbers')
			}
			return evalPolynomial(coeffs, toDual(x, 'x', true), true)
		},
		...DUAL_BINARY_TABLE,
	}

	for (const opName of Object.keys(DUAL_UNARY_TABLE)) {
		ops[opName] = (x) => evalUnaryTable(opName, toDual(x, 'x', true), true)
	}

	return Object.freeze(ops)
}

/**
 * Precomputed frozen table of dual-number operations (unary, binary, polynomial,
 * and constructors) available for composing forward-mode differentiable functions.
 */
export const DUAL_OPS = buildDualOps()

/**
 * Computes the value and forward-mode calculus derivative over dual numbers `{ v, d }`
 * using precomputed elementary derivative tables and bounded memoization.
 *
 * Supports three callable forms for `target`:
 * 1. A string naming an elementary operation in the precomputed table
 *    (`'sin'`, `'cos'`, `'tan'`, `'asin'`, `'acos'`, `'atan'`, `'sinh'`, `'cosh'`,
 *    `'tanh'`, `'exp'`, `'expm1'`, `'log'`, `'log1p'`, `'sqrt'`, `'cbrt'`, `'abs'`,
 *    `'neg'`, `'reciprocal'`, `'square'`, `'cube'`, `'identity'`).
 * 2. A non-empty array of polynomial coefficients `[c0, c1, ..., cn]` representing
 *    `c0 + c1*x + ... + cn*x^n`, evaluated via Horner's method over dual numbers.
 * 3. A differentiable function `(x, ops) => Dual` invoked with the normalized dual
 *    input `x` and the precomputed `DUAL_OPS` table.
 *
 * @param {string | number[] | ((x: Dual, ops: typeof DUAL_OPS) => Dual)} target
 *   Elementary op name, polynomial coefficient array, or dual-number function.
 * @param {number | Dual} x
 *   Evaluation point as a finite number (lifted to `{ v: x, d: 1 }`) or dual number `{ v, d }`.
 * @param {DerivativeOptions} [options]
 *   Optional configuration (`{ memoize?: boolean }`).
 * @returns {Dual}
 *   Fresh dual number `{ v, d }` where `v = f(x.v)` and `d = f'(x.v) * x.d`.
 * @throws {TypeError} If `target`, `x`, `options`, or a function result has an invalid type.
 * @throws {RangeError} If any numeric input/output is non-finite or outside the operation's domain.
 */
export function derivativeDualMemo(target, x, options) {
	let memoize = true
	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('options must be a plain object')
		}
		if (options.memoize !== undefined) {
			if (typeof options.memoize !== 'boolean') {
				throw new TypeError('options.memoize must be a boolean')
			}
			memoize = options.memoize
		}
	}

	const dual = toDual(x, 'x', false)

	if (typeof target === 'string') {
		return evalUnaryTable(target, dual, memoize)
	}

	if (Array.isArray(target)) {
		return evalPolynomial(target, dual, memoize)
	}

	if (typeof target !== 'function') {
		throw new TypeError(
			'target must be a function, a unary operation name string, or a polynomial coefficient array',
		)
	}

	const cacheKey = `${dual.v}|${dual.d}`
	let perFnCache
	if (memoize) {
		perFnCache = fnMemoCache.get(target)
		if (perFnCache !== undefined) {
			const cached = perFnCache.get(cacheKey)
			if (cached !== undefined) {
				return { v: cached.v, d: cached.d }
			}
		}
	}

	const raw = target(dual, DUAL_OPS)
	const result = validateDualResult(raw, 'target(x, ops)')

	if (memoize) {
		if (!perFnCache) {
			perFnCache = new Map()
			fnMemoCache.set(target, perFnCache)
		}
		setBounded(perFnCache, cacheKey, { v: result.v, d: result.d })
	}

	return { v: result.v, d: result.d }
}
