/**
 * @typedef {{ v: number, d: number }} Dual
 */

/**
 * @typedef {Object} IntegralDualOptions
 * @property {number} [tolerance=1e-10] - Absolute error tolerance for both primal and derivative integrals.
 * @property {number} [maxDepth=20] - Maximum recursion depth for adaptive subdivision (0..50).
 * @property {number} [minDepth=3] - Minimum recursion depth before accepting convergence (0..maxDepth).
 */

const MAX_ALLOWED_DEPTH = 50
const REL_EPS_FLOOR = Number.EPSILON * 16

/**
 * Normalize a finite number or dual object `{ v, d }` into a validated dual number.
 *
 * @param {Dual|number} value
 * @param {string} name
 * @returns {Dual}
 */
function parseBound(value, name) {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new RangeError(`${name} must be a finite number`)
		}
		return { v: value, d: 0 }
	}
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a dual number { v, d } or finite number`)
	}
	if (typeof value.v !== 'number' || typeof value.d !== 'number') {
		throw new TypeError(`${name} must have numeric properties v and d`)
	}
	if (!Number.isFinite(value.v) || !Number.isFinite(value.d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`)
	}
	return { v: value.v, d: value.d }
}

/**
 * Validate options for `integralDualRecursive`.
 *
 * @param {IntegralDualOptions} options
 * @returns {{ tolerance: number, maxDepth: number, minDepth: number }}
 */
function parseOptions(options) {
	if (options === undefined) {
		return { tolerance: 1e-10, maxDepth: 20, minDepth: 3 }
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const tolerance = options.tolerance === undefined ? 1e-10 : options.tolerance
	if (typeof tolerance !== 'number') {
		throw new TypeError('options.tolerance must be a number')
	}
	if (!Number.isFinite(tolerance) || tolerance <= 0) {
		throw new RangeError('options.tolerance must be a positive finite number')
	}

	const maxDepth = options.maxDepth === undefined ? 20 : options.maxDepth
	if (typeof maxDepth !== 'number') {
		throw new TypeError('options.maxDepth must be a number')
	}
	if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > MAX_ALLOWED_DEPTH) {
		throw new RangeError(`options.maxDepth must be an integer between 0 and ${MAX_ALLOWED_DEPTH}`)
	}

	const defaultMinDepth = Math.min(3, maxDepth)
	const minDepth = options.minDepth === undefined ? defaultMinDepth : options.minDepth
	if (typeof minDepth !== 'number') {
		throw new TypeError('options.minDepth must be a number')
	}
	if (!Number.isInteger(minDepth) || minDepth < 0 || minDepth > maxDepth) {
		throw new RangeError('options.minDepth must be an integer between 0 and options.maxDepth')
	}

	return { tolerance, maxDepth, minDepth }
}

/**
 * Evaluate the integrand at scalar point `x` as a dual `{ v: x, d: 0 }` and validate the dual output.
 *
 * @param {(x: Dual) => Dual} fn
 * @param {number} x
 * @returns {Dual}
 */
function evalIntegrand(fn, x) {
	const res = fn({ v: x, d: 0 })
	if (res === null || typeof res !== 'object' || Array.isArray(res)) {
		throw new TypeError('Integrand fn must return a dual number { v, d }')
	}
	if (typeof res.v !== 'number' || typeof res.d !== 'number') {
		throw new TypeError('Integrand fn return value must have numeric properties v and d')
	}
	if (!Number.isFinite(res.v) || !Number.isFinite(res.d)) {
		throw new RangeError(`Integrand fn returned non-finite dual value at x=${x}`)
	}
	return { v: res.v, d: res.d }
}

/**
 * Normalize `-0` to `0`.
 *
 * @param {number} n
 * @returns {number}
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n
}

/**
 * Compute the definite integral of a dual-valued integrand over dual bounds
 * using an adaptive recursive (divide-and-conquer) Simpson's rule with
 * Richardson extrapolation and the Leibniz integral rule for bound derivatives:
 *
 *   I(θ)  = ∫[a(θ)..b(θ)] f(x, θ) dx
 *   I'(θ) = ∫[a(θ)..b(θ)] (∂f/∂θ)(x, θ) dx + f(b(θ), θ)·b'(θ) - f(a(θ), θ)·a'(θ)
 *
 * Each sample point is passed to `fn` as `{ v: x, d: 0 }`, so `fn` carries any
 * parameter derivative in its returned `{ v, d }`.
 *
 * @param {(x: Dual) => Dual} fn - Integrand mapping a dual point `{ v, d }` to `{ v, d }`.
 * @param {Dual|number} a - Lower integration bound as a dual `{ v, d }` (or finite number with `d = 0`).
 * @param {Dual|number} b - Upper integration bound as a dual `{ v, d }` (or finite number with `d = 0`).
 * @param {IntegralDualOptions} [options] - Adaptive quadrature parameters.
 * @returns {Dual} Definite integral `{ v, d }` with forward-mode derivative `d`.
 */
export function integralDualRecursive(fn, a, b, options) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
	}

	const lower = parseBound(a, 'a')
	const upper = parseBound(b, 'b')
	const { tolerance, maxDepth, minDepth } = parseOptions(options)

	const fa = evalIntegrand(fn, lower.v)
	if (lower.v === upper.v) {
		return {
			v: 0,
			d: normalizeZero(fa.v * (upper.d - lower.d)),
		}
	}

	const fb = evalIntegrand(fn, upper.v)
	const mid = (lower.v + upper.v) / 2
	const fm = evalIntegrand(fn, mid)

	const wholeH = (upper.v - lower.v) / 6
	const wholeV = wholeH * (fa.v + 4 * fm.v + fb.v)
	const wholeD = wholeH * (fa.d + 4 * fm.d + fb.d)

	/**
	 * Recursively subdivide `[x0, x1]` until both primal and derivative estimates
	 * meet the Richardson error bound or `maxDepth` is reached.
	 *
	 * @param {number} x0
	 * @param {number} x1
	 * @param {Dual} f0
	 * @param {Dual} fMid
	 * @param {Dual} f1
	 * @param {number} sV
	 * @param {number} sD
	 * @param {number} tol
	 * @param {number} depth
	 * @returns {Dual}
	 */
	function subdivide(x0, x1, f0, fMid, f1, sV, sD, tol, depth) {
		const m = (x0 + x1) / 2
		const ml = (x0 + m) / 2
		const mr = (m + x1) / 2

		if (depth >= maxDepth || ml === x0 || ml === m || mr === m || mr === x1) {
			return { v: sV, d: sD }
		}

		const fml = evalIntegrand(fn, ml)
		const fmr = evalIntegrand(fn, mr)

		const halfH = (x1 - x0) / 12
		const leftV = halfH * (f0.v + 4 * fml.v + fMid.v)
		const leftD = halfH * (f0.d + 4 * fml.d + fMid.d)
		const rightV = halfH * (fMid.v + 4 * fmr.v + f1.v)
		const rightD = halfH * (fMid.d + 4 * fmr.d + f1.d)

		const sumV = leftV + rightV
		const sumD = leftD + rightD
		const deltaV = sumV - sV
		const deltaD = sumD - sD

		const tolV = 15 * Math.max(tol, REL_EPS_FLOOR * Math.abs(sumV))
		const tolD = 15 * Math.max(tol, REL_EPS_FLOOR * Math.abs(sumD))

		if (depth + 1 >= minDepth && Math.abs(deltaV) <= tolV && Math.abs(deltaD) <= tolD) {
			return {
				v: sumV + deltaV / 15,
				d: sumD + deltaD / 15,
			}
		}

		const halfTol = tol / 2
		const left = subdivide(x0, m, f0, fml, fMid, leftV, leftD, halfTol, depth + 1)
		const right = subdivide(m, x1, fMid, fmr, f1, rightV, rightD, halfTol, depth + 1)
		return {
			v: left.v + right.v,
			d: left.d + right.d,
		}
	}

	const interior = subdivide(lower.v, upper.v, fa, fm, fb, wholeV, wholeD, tolerance, 0)
	const boundaryD = fb.v * upper.d - fa.v * lower.d

	return {
		v: normalizeZero(interior.v),
		d: normalizeZero(interior.d + boundaryD),
	}
}
