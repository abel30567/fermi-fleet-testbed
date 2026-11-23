/**
 * Fixed-point scaling factor (10^18) representing 1.0 in BigInt fixed-point arithmetic.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

/**
 * Default central-difference step size (10^-6 in 10^18 fixed-point, i.e., 10^12n).
 * Balances O(h^2) truncation error against O(10^-18 / h) fixed-point rounding noise.
 * @type {bigint}
 */
export const DEFAULT_STEP = 10n ** 12n;

/**
 * Divides two BigInts with round-half-away-from-zero semantics.
 * Assumes `denominator > 0n`.
 *
 * @param {bigint} numerator
 * @param {bigint} denominator
 * @returns {bigint}
 */
function divRoundHalfAwayFromZero(numerator, denominator) {
	if (numerator >= 0n) {
		return (numerator + denominator / 2n) / denominator;
	}
	return -((-numerator + denominator / 2n) / denominator);
}

/**
 * Computes the numerical derivative of a fixed-point BigInt function `fn` at point `x`
 * using a straightforward iterative central finite-difference scheme.
 *
 * All domain (`x`, `h`), codomain (`fn(x)`), and output values use exact fixed-point
 * `bigint` arithmetic scaled by `SCALE = 10^18` (so `1.0` is represented as `10n ** 18n`).
 *
 * For derivative order `n >= 1`:
 * - Evaluates `fn` at `n + 1` symmetrically spaced grid points:
 *   `x_i = x + (2 * i - n) * h` for `i = 0, 1, ..., n`.
 * - Iteratively builds the `n`-th order finite difference in place.
 * - Scales by `SCALE^n` and divides by `(2 * h)^n` using round-half-away-from-zero.
 *
 * For `order = 1`, this reduces to the standard central finite difference:
 * `round((fn(x + h) - fn(x - h)) * 10^18 / (2 * h))`.
 *
 * @param {(x: bigint) => bigint} fn - Function mapping a 10^18-scaled BigInt to a 10^18-scaled BigInt.
 * @param {bigint} x - Evaluation point, scaled by 10^18.
 * @param {bigint} [h=DEFAULT_STEP] - Positive step size, scaled by 10^18 (defaults to 10^12n = 10^-6).
 * @param {number | bigint} [order=1] - Positive integer order of the derivative (1 for first derivative, 2 for second, etc.).
 * @returns {bigint} Approximate `order`-th derivative `fn^(order)(x)`, scaled by 10^18.
 * @throws {TypeError} If `fn` is not a function, `x` or `h` is not a bigint, `order` is not a number/bigint, or `fn` returns a non-bigint.
 * @throws {RangeError} If `h <= 0n` or `order` is not a positive safe integer.
 */
export function derivativeBigIntIterative(fn, x, h = DEFAULT_STEP, order = 1) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function');
	}
	if (typeof x !== 'bigint') {
		throw new TypeError('x must be a bigint');
	}
	if (typeof h !== 'bigint') {
		throw new TypeError('h must be a bigint');
	}
	if (h <= 0n) {
		throw new RangeError('h must be a positive bigint');
	}

	let n;
	if (typeof order === 'number') {
		if (!Number.isSafeInteger(order) || order < 1) {
			throw new RangeError('order must be a positive safe integer');
		}
		n = order;
	} else if (typeof order === 'bigint') {
		if (order < 1n || order > BigInt(Number.MAX_SAFE_INTEGER)) {
			throw new RangeError('order must be a positive safe integer');
		}
		n = Number(order);
	} else {
		throw new TypeError('order must be a positive integer (number or bigint)');
	}

	const nBig = BigInt(n);
	const twoH = 2n * h;

	// Sample n + 1 symmetrically spaced points: x + (2i - n) * h for i = 0..n
	const diffs = new Array(n + 1);
	let point = x - nBig * h;
	for (let i = 0; i <= n; i += 1) {
		const y = fn(point);
		if (typeof y !== 'bigint') {
			throw new TypeError('fn must return a bigint');
		}
		diffs[i] = y;
		point += twoH;
	}

	// Iteratively compute the n-th finite difference in place
	for (let level = 1; level <= n; level += 1) {
		const limit = n - level;
		for (let i = 0; i <= limit; i += 1) {
			diffs[i] = diffs[i + 1] - diffs[i];
		}
	}

	// Iteratively compute SCALE^n and (2h)^n
	let scalePow = 1n;
	let denomPow = 1n;
	for (let k = 0; k < n; k += 1) {
		scalePow *= SCALE;
		denomPow *= twoH;
	}

	return divRoundHalfAwayFromZero(diffs[0] * scalePow, denomPow);
}
