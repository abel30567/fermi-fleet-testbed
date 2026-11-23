/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Forward-mode derivative (dual/tangent) component.
 */

/**
 * @typedef {Object} DerivativeDualSeriesOptions
 * @property {number} [order=1] - Non-negative integer derivative order (default `1`).
 * @property {number} [center=0] - Series expansion center `x0` for coefficient arrays (default `0`).
 * @property {number} [h] - Positive base step size for Richardson-extrapolated central-difference series when differentiating a callable function.
 */

const MAX_CALLABLE_ORDER = 8;

/**
 * Normalize IEEE-754 negative zero to positive zero.
 * @param {number} x
 * @returns {number}
 */
function cleanZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Check whether a value is a plain-like non-null, non-array object.
 * @param {unknown} value
 * @returns {boolean}
 */
function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate a dual number `{ v, d }` and return a normalized copy.
 * @param {unknown} dual
 * @param {string} label
 * @returns {DualNumber}
 */
function validateDual(dual, label) {
	if (!isRecord(dual)) {
		throw new TypeError(`${label} must be a dual number object { v, d }`);
	}
	const { v, d } = /** @type {Record<string, unknown>} */ (dual);
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${label}.v and ${label}.d must be numbers`);
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${label}.v and ${label}.d must be finite numbers`);
	}
	return { v, d };
}

/**
 * Validate and normalize a single power-series coefficient (number or DualNumber).
 * @param {unknown} coeff
 * @param {number} index
 * @returns {DualNumber}
 */
function normalizeCoefficient(coeff, index) {
	if (typeof coeff === 'number') {
		if (!Number.isFinite(coeff)) {
			throw new RangeError(`coeffs[${index}] must be a finite number`);
		}
		return { v: coeff, d: 0 };
	}
	if (isRecord(coeff)) {
		return validateDual(coeff, `coeffs[${index}]`);
	}
	throw new TypeError(`coeffs[${index}] must be a finite number or dual number { v, d }`);
}

/**
 * Validate options object and extract defaults.
 * @param {unknown} options
 * @returns {{ order: number, center: number, h: number | undefined }}
 */
function validateOptions(options) {
	if (options === undefined) {
		return { order: 1, center: 0, h: undefined };
	}
	if (!isRecord(options)) {
		throw new TypeError('options must be an object when provided');
	}
	const opts = /** @type {Record<string, unknown>} */ (options);

	let order = 1;
	if (opts.order !== undefined) {
		if (typeof opts.order !== 'number') {
			throw new TypeError('options.order must be a number');
		}
		if (!Number.isInteger(opts.order) || opts.order < 0) {
			throw new RangeError('options.order must be a non-negative integer');
		}
		order = opts.order;
	}

	let center = 0;
	if (opts.center !== undefined) {
		if (typeof opts.center !== 'number') {
			throw new TypeError('options.center must be a number');
		}
		if (!Number.isFinite(opts.center)) {
			throw new RangeError('options.center must be a finite number');
		}
		center = opts.center;
	}

	let h;
	if (opts.h !== undefined) {
		if (typeof opts.h !== 'number') {
			throw new TypeError('options.h must be a number');
		}
		if (!Number.isFinite(opts.h) || opts.h <= 0) {
			throw new RangeError('options.h must be a positive finite number');
		}
		h = opts.h;
	}

	return { order, center, h };
}

/**
 * Compute falling factorial product `(j + 1) * (j + 2) * ... * (j + m)` = `(j + m)! / j!`.
 * @param {number} j
 * @param {number} m
 * @returns {number}
 */
function risingProduct(j, m) {
	let prod = 1;
	for (let r = 1; r <= m; r += 1) {
		prod *= j + r;
	}
	return prod;
}

/**
 * Evaluate the m-th derivative of a power series over a dual number using
 * exact closed-form term-by-term differentiation and Horner's scheme in dual arithmetic.
 *
 * For `P(x) = sum_{k=0}^n c_k (x - x0)^k`, its m-th derivative is:
 *   `P^(m)(z) = sum_{j=0}^{n-m} ((j + m)! / j!) * c_{j+m} * (z - x0)^j`
 *
 * Evaluated at `z = v + d*eps` (`eps^2 = 0`), dual Horner arithmetic yields:
 *   `{ v: P^(m)(v), d: P^(m+1)(v) * d + sum_j ((j + m)! / j!) * c'_{j+m} * (v - x0)^j }`.
 *
 * @param {Array<number | DualNumber>} coeffs
 * @param {DualNumber} dual
 * @param {number} order
 * @param {number} center
 * @returns {DualNumber}
 */
function differentiatePowerSeries(coeffs, dual, order, center) {
	if (coeffs.length === 0) {
		throw new RangeError('coeffs must be a non-empty array');
	}

	const normalized = new Array(coeffs.length);
	for (let i = 0; i < coeffs.length; i += 1) {
		normalized[i] = normalizeCoefficient(coeffs[i], i);
	}

	const degree = normalized.length - 1;
	if (order > degree) {
		return { v: 0, d: 0 };
	}

	const uv = dual.v - center;
	const ud = dual.d;
	if (!Number.isFinite(uv)) {
		throw new RangeError('dual.v - center overflowed to a non-finite value');
	}

	let accV = 0;
	let accD = 0;

	for (let j = degree - order; j >= 0; j -= 1) {
		const weight = risingProduct(j, order);
		const coeff = normalized[j + order];
		const termV = weight * coeff.v;
		const termD = weight * coeff.d;

		// Dual multiply-add: acc = acc * u + term
		const nextV = accV * uv + termV;
		const nextD = accV * ud + accD * uv + termD;

		accV = nextV;
		accD = nextD;
	}

	if (!Number.isFinite(accV) || !Number.isFinite(accD)) {
		throw new RangeError('derivative evaluation overflowed to a non-finite value');
	}

	return { v: cleanZero(accV), d: cleanZero(accD) };
}

/**
 * Evaluate a scalar function safely and assert a finite numeric result.
 * @param {(x: number) => number} fn
 * @param {number} x
 * @returns {number}
 */
function evalScalar(fn, x) {
	const y = fn(x);
	if (typeof y !== 'number') {
		throw new TypeError('target function must return a finite number or dual number { v, d }');
	}
	if (!Number.isFinite(y)) {
		throw new RangeError(`target function returned non-finite value at x=${x}`);
	}
	return y;
}

/**
 * Symmetric m-th order central difference:
 *   `D_m(h) = h^(-m) * sum_{k=0}^m (-1)^k * C(m, k) * f(x + (m/2 - k) * h)`
 *
 * Because `D_m(h) = (2 sinh(h D / 2) / h)^m f(x)` has a purely even error expansion
 * in `h^2`, Richardson extrapolation with step halving eliminates `O(h^2)` and `O(h^4)`.
 *
 * @param {(x: number) => number} fn
 * @param {number} x
 * @param {number} order
 * @param {number} h
 * @returns {number}
 */
function centralDifference(fn, x, order, h) {
	let binom = 1;
	let sum = 0;
	const halfOrder = order / 2;

	for (let k = 0; k <= order; k += 1) {
		const sign = k % 2 === 0 ? 1 : -1;
		const sampleX = x + (halfOrder - k) * h;
		sum += sign * binom * evalScalar(fn, sampleX);
		binom = (binom * (order - k)) / (k + 1);
	}

	return sum / Math.pow(h, order);
}

/**
 * Compute an optimal binary-rounded base step size for 3-level Richardson extrapolation
 * of the m-th symmetric central difference (error `O(h^6)` vs roundoff `O(8^m * eps / h^m)`).
 *
 * @param {number} x
 * @param {number} order
 * @returns {number}
 */
function defaultStepSize(x, order) {
	const scale = Math.max(1, Math.abs(x));
	const raw = Math.pow(Math.pow(8, order) * Number.EPSILON, 1 / (6 + order));
	const pow2 = Math.pow(2, Math.round(Math.log2(raw)));
	return pow2 * scale;
}

/**
 * Compute the m-th derivative of a real-valued function at `x` using a
 * 3-level Richardson-extrapolated central-difference series (`O(h^6)` truncation error).
 *
 * @param {(x: number) => number} fn
 * @param {number} x
 * @param {number} order
 * @param {number | undefined} customH
 * @returns {number}
 */
function richardsonDerivative(fn, x, order, customH) {
	if (order === 0) {
		return evalScalar(fn, x);
	}
	const h0 = customH !== undefined ? customH : defaultStepSize(x, order);

	const r00 = centralDifference(fn, x, order, h0);
	const r10 = centralDifference(fn, x, order, h0 / 2);
	const r20 = centralDifference(fn, x, order, h0 / 4);

	const r11 = (4 * r10 - r00) / 3;
	const r21 = (4 * r20 - r10) / 3;
	const r22 = (16 * r21 - r11) / 15;

	if (!Number.isFinite(r22)) {
		throw new RangeError('derivative evaluation overflowed to a non-finite value');
	}
	return r22;
}

/**
 * Differentiate a callable function (either dual-aware `DualNumber -> DualNumber`
 * or scalar `number -> number`) over a dual number `{ v, d }`.
 *
 * @param {Function} fn
 * @param {DualNumber} dual
 * @param {number} order
 * @param {number | undefined} customH
 * @returns {DualNumber}
 */
function differentiateCallable(fn, dual, order, customH) {
	if (order > MAX_CALLABLE_ORDER) {
		throw new RangeError(
			`options.order must be <= ${MAX_CALLABLE_ORDER} for callable targets (received ${order})`
		);
	}

	// Probe whether fn natively accepts and returns dual numbers { v, d }.
	let isDualFn = false;
	let probeResult;
	try {
		probeResult = fn({ v: dual.v, d: 1 });
		if (
			isRecord(probeResult) &&
			typeof probeResult.v === 'number' &&
			typeof probeResult.d === 'number'
		) {
			isDualFn = true;
		}
	} catch {
		isDualFn = false;
	}

	if (isDualFn) {
		const probe = validateDual(probeResult, 'target return value');

		if (order === 0) {
			const res = validateDual(fn(dual), 'target return value');
			return { v: cleanZero(res.v), d: cleanZero(res.d) };
		}

		// Exact first derivative extractor g(x) = f'(x) via forward-mode AD.
		const exactFirstDeriv = (x) => {
			const out = validateDual(fn({ v: x, d: 1 }), 'target return value');
			return out.d;
		};

		const val =
			order === 1
				? probe.d
				: richardsonDerivative(exactFirstDeriv, dual.v, order - 1, customH);

		const deriv =
			dual.d === 0
				? 0
				: richardsonDerivative(exactFirstDeriv, dual.v, order, customH) * dual.d;

		if (!Number.isFinite(val) || !Number.isFinite(deriv)) {
			throw new RangeError('derivative evaluation overflowed to a non-finite value');
		}
		return { v: cleanZero(val), d: cleanZero(deriv) };
	}

	// Scalar real function f: R -> R.
	// Ensure f(dual.v) is valid even if order > 0 or dual.d === 0.
	const baseVal = evalScalar(/** @type {(x: number) => number} */ (fn), dual.v);
	const scalarFn = /** @type {(x: number) => number} */ (fn);

	const val = order === 0 ? baseVal : richardsonDerivative(scalarFn, dual.v, order, customH);
	const deriv =
		dual.d === 0 ? 0 : richardsonDerivative(scalarFn, dual.v, order + 1, customH) * dual.d;

	if (!Number.isFinite(val) || !Number.isFinite(deriv)) {
		throw new RangeError('derivative evaluation overflowed to a non-finite value');
	}
	return { v: cleanZero(val), d: cleanZero(deriv) };
}

/**
 * Compute the calculus derivative over dual numbers `{ v, d }` carrying a
 * forward-mode tangent alongside the primal value, using an exact closed-form
 * power-series differentiation (Horner's method in dual arithmetic) or a
 * Richardson-extrapolated central-difference series for callable functions.
 *
 * For a dual number `z = v + d*eps` (`eps^2 = 0`) and derivative order `m >= 0`:
 *   `f^(m)(v + d*eps) = f^(m)(v) + f^(m+1)(v) * d * eps`
 *
 * - When `target` is an array of power-series coefficients `[c_0, c_1, ..., c_n]`
 *   representing `P(x) = sum_{k=0}^n c_k (x - center)^k` (where each `c_k` may be
 *   a finite number or a dual number `{ v, d }`), the `order`-th derivative is
 *   computed in closed form via term-by-term differentiation and dual Horner evaluation.
 * - When `target` is a function `f`, if `f` natively accepts and returns dual
 *   numbers `{ v, d }`, its forward-mode derivative is extracted exactly for order `1`
 *   and differentiated via Richardson-extrapolated central-difference series for
 *   higher orders / the dual tangent; scalar functions `f(x)` use the symmetric
 *   Richardson central-difference series for both value and tangent.
 *
 * @param {Array<number | DualNumber> | ((x: number) => number) | ((z: DualNumber) => DualNumber)} target
 *   Power-series coefficient array `[c_0, c_1, ...]` or differentiable function.
 * @param {DualNumber} dual - Dual number `{ v, d }` at which to evaluate the derivative.
 * @param {DerivativeDualSeriesOptions} [options] - Optional configuration (`order`, `center`, `h`).
 * @returns {DualNumber} Dual number `{ v, d }` containing the derivative value and its forward-mode tangent.
 */
export function derivativeDualSeries(target, dual, options) {
	const z = validateDual(dual, 'dual');
	const { order, center, h } = validateOptions(options);

	if (Array.isArray(target)) {
		return differentiatePowerSeries(target, z, order, center);
	}
	if (typeof target === 'function') {
		return differentiateCallable(target, z, order, h);
	}

	throw new TypeError('target must be a non-empty coefficient array or a function');
}
