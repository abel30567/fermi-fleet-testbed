/**
 * Fixed-point scaling factor (10^18).
 * A real value `x` is represented as `BigInt(Math.round(x * 1e18))`.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

/**
 * Default initial finite-difference step size (10^-3 in 10^18 fixed-point).
 * Divisible by 2^15 so repeated halving produces exact integer steps, and
 * every step for the default order (3) is a multiple of 10^12.
 * @type {bigint}
 */
export const DEFAULT_STEP = 10n ** 15n;

/**
 * Default Richardson extrapolation depth (4 step levels: h, h/2, h/4, h/8),
 * yielding O(h^8) truncation accuracy (exact for polynomials of degree <= 8).
 * @type {number}
 */
export const DEFAULT_ORDER = 3;

/**
 * Maximum supported Richardson extrapolation depth.
 * @type {number}
 */
export const MAX_ORDER = 12;

/**
 * Compute greatest common divisor of two BigInts (non-negative result).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

/**
 * Normalize a rational number `num / den` into lowest terms with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function reduceRational(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcdBigInt(n, d);
	return { num: n / g, den: d / g };
}

/**
 * Exact BigInt division with round-half-to-even (banker's rounding).
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {bigint}
 */
function divRoundHalfToEven(num, den) {
	const neg = (num < 0n) !== (den < 0n);
	const absNum = num < 0n ? -num : num;
	const absDen = den < 0n ? -den : den;
	const q = absNum / absDen;
	const r = absNum % absDen;
	const twiceR = r << 1n;
	let rounded = q;
	if (twiceR > absDen || (twiceR === absDen && (q & 1n) === 1n)) {
		rounded = q + 1n;
	}
	return neg ? -rounded : rounded;
}

/**
 * Recursively construct the strictly decreasing step sequence
 * [step, step >> 1n, ..., step >> BigInt(order)].
 *
 * @param {bigint} step
 * @param {number} remaining
 * @param {bigint[]} acc
 * @returns {bigint[]}
 */
function buildStepsRecursive(step, remaining, acc) {
	acc.push(step);
	if (remaining === 0) {
		return acc;
	}
	return buildStepsRecursive(step >> 1n, remaining - 1, acc);
}

/**
 * Evaluate `fn` at a fresh copy of `point` with coordinate `dim` replaced by `newCoord`.
 *
 * @param {(coords: bigint[]) => bigint} fn
 * @param {bigint[]} point
 * @param {number} dim
 * @param {bigint} newCoord
 * @returns {bigint}
 */
function evalAtPerturbed(fn, point, dim, newCoord) {
	const coords = point.slice();
	coords[dim] = newCoord;
	const value = fn(coords);
	if (typeof value !== 'bigint') {
		throw new TypeError(
			`Expected scalar function fn to return a BigInt, got ${typeof value}`
		);
	}
	return value;
}

/**
 * Compute the partial derivative ∂f/∂x_dim(point) using recursive
 * Neville-Richardson extrapolation over exact BigInt rationals.
 *
 * Because central differences have an even error expansion
 *   D(h) = L + c_1 h^2 + c_2 h^4 + c_3 h^6 + ...,
 * Neville interpolation at t = h^2 = 0 eliminates all error terms up to
 * O(h^(2*order)) exactly—even when step sizes are not exact powers of two:
 *   R(i, 0) = ((f(x + h_i e_d) - f(x - h_i e_d)) * SCALE) / (2 * h_i)
 *   R(i, j) = (t_{i-j} * R(i, j-1) - t_i * R(i-1, j-1)) / (t_{i-j} - t_i)
 * where t_k = h_k^2.
 *
 * @param {(coords: bigint[]) => bigint} fn
 * @param {bigint[]} point
 * @param {number} dim
 * @param {bigint[]} steps
 * @returns {bigint}
 */
function partialDerivativeRecursive(fn, point, dim, steps) {
	const order = steps.length - 1;
	const stride = order + 1;
	const memo = new Map();

	function richardson(i, j) {
		const key = i * stride + j;
		if (memo.has(key)) {
			return memo.get(key);
		}

		let result;
		if (j === 0) {
			const h = steps[i];
			const fPlus = evalAtPerturbed(fn, point, dim, point[dim] + h);
			const fMinus = evalAtPerturbed(fn, point, dim, point[dim] - h);
			result = reduceRational((fPlus - fMinus) * SCALE, 2n * h);
		} else {
			const curr = richardson(i, j - 1);
			const prev = richardson(i - 1, j - 1);
			const tLow = steps[i] * steps[i];
			const tHigh = steps[i - j] * steps[i - j];
			const num = tHigh * curr.num * prev.den - tLow * prev.num * curr.den;
			const den = (tHigh - tLow) * curr.den * prev.den;
			result = reduceRational(num, den);
		}

		memo.set(key, result);
		return result;
	}

	const extrapolated = richardson(order, order);
	return divRoundHalfToEven(extrapolated.num, extrapolated.den);
}

/**
 * Divide-and-conquer computation of the gradient components over coordinate
 * index range `[lo, hi)`. Splits the range in half recursively (O(log n)
 * stack depth) and fills `out[lo..hi-1]`.
 *
 * @param {(coords: bigint[]) => bigint} fn
 * @param {bigint[]} point
 * @param {bigint[]} steps
 * @param {number} lo
 * @param {number} hi
 * @param {bigint[]} out
 * @returns {void}
 */
function computeGradientRange(fn, point, steps, lo, hi, out) {
	if (hi - lo === 1) {
		out[lo] = partialDerivativeRecursive(fn, point, lo, steps);
		return;
	}
	const mid = lo + ((hi - lo) >>> 1);
	computeGradientRange(fn, point, steps, lo, mid, out);
	computeGradientRange(fn, point, steps, mid, hi, out);
}

/**
 * Compute the gradient vector ∇f(point) = [∂f/∂x_0, ..., ∂f/∂x_{n-1}] of a
 * multivariable scalar function `fn: bigint[] -> bigint` at `point` using
 * fixed-point BigInt arithmetic scaled by `SCALE = 10n ** 18n`.
 *
 * Algorithm:
 * 1. Divide-and-conquer over the n coordinate dimensions `[0, n)` with
 *    O(log n) recursion depth.
 * 2. For each partial derivative ∂f/∂x_d, recursive memoized
 *    Neville-Richardson extrapolation on symmetric central differences over
 *    exact BigInt rationals (no intermediate rounding loss), rounded once at
 *    the end with round-half-to-even back to `SCALE = 10n ** 18n`.
 *
 * Scaling convention:
 * - Each input coordinate `point[i]` represents the real value `point[i] / 10^18`.
 * - `fn(coords)` takes a `bigint[]` scaled by `10^18` and must return a `bigint`
 *   scaled by `10^18`.
 * - Each output component `grad[i]` represents `∂f/∂x_i(point)` scaled by `10^18`.
 *
 * @param {(coords: bigint[]) => bigint} fn - Scalar function over fixed-point BigInt coordinates.
 * @param {bigint[]} point - Non-empty coordinate vector of fixed-point BigInts (scaled by 10^18).
 * @param {object} [options] - Optional numerical differentiation settings.
 * @param {bigint} [options.step=10n**15n] - Positive initial step size h_0 (scaled by 10^18).
 * @param {number} [options.order=3] - Richardson extrapolation depth in [0, 12].
 *   When omitted and `step < 2^DEFAULT_ORDER`, automatically clamped so the
 *   smallest halved step remains >= 1n.
 * @returns {bigint[]} Gradient vector of length `point.length`, scaled by 10^18.
 * @throws {TypeError} If `fn` is not a function, `point` is not an array of BigInts,
 *   `options` is not a plain object, `options.step` is not a BigInt,
 *   `options.order` is not an integer, or `fn` returns a non-BigInt value.
 * @throws {RangeError} If `point` is empty, `options.step <= 0n`,
 *   `options.order` is outside `[0, MAX_ORDER]`, or `options.step < 2^options.order`.
 */
export function gradientBigIntRecursive(fn, point, options = undefined) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function');
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of BigInt coordinates');
	}
	if (point.length === 0) {
		throw new RangeError('point must be a non-empty array');
	}
	for (let i = 0; i < point.length; i += 1) {
		if (typeof point[i] !== 'bigint') {
			throw new TypeError(`point[${i}] must be a BigInt, got ${typeof point[i]}`);
		}
	}

	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('options must be a plain object if provided');
		}
	}

	const { step = DEFAULT_STEP, order } = options ?? {};

	if (typeof step !== 'bigint') {
		throw new TypeError('options.step must be a BigInt');
	}
	if (step <= 0n) {
		throw new RangeError('options.step must be a positive BigInt');
	}

	let effectiveOrder;
	if (order === undefined) {
		effectiveOrder = DEFAULT_ORDER;
		while (effectiveOrder > 0 && (step >> BigInt(effectiveOrder)) < 1n) {
			effectiveOrder -= 1;
		}
	} else {
		if (typeof order !== 'number' || !Number.isInteger(order)) {
			throw new TypeError('options.order must be an integer');
		}
		if (order < 0 || order > MAX_ORDER) {
			throw new RangeError(`options.order must be between 0 and ${MAX_ORDER}`);
		}
		if ((step >> BigInt(order)) < 1n) {
			throw new RangeError(
				`options.step (${step}) is too small for options.order (${order}); step must be at least ${1n << BigInt(order)}`
			);
		}
		effectiveOrder = order;
	}

	const steps = buildStepsRecursive(step, effectiveOrder, []);
	const pointSnapshot = point.slice();
	const out = new Array(pointSnapshot.length);
	computeGradientRange(fn, pointSnapshot, steps, 0, pointSnapshot.length, out);
	return out;
}
