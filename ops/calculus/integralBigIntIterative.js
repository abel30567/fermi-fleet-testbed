/**
 * Fixed-point scaling factor (10^18).
 * A real number `r` is represented as `BigInt` value `round(r * 10^18)`.
 */
export const SCALE = 10n ** 18n;

/**
 * Default number of integration subintervals when `steps` is omitted.
 */
const DEFAULT_STEPS = 1000n;

/**
 * Rounds integer division `num / den` to the nearest BigInt (half away from zero).
 *
 * @param {bigint} num - Dividend.
 * @param {bigint} den - Strictly positive divisor (`den > 0n`).
 * @returns {bigint} Nearest BigInt quotient.
 */
function roundDiv(num, den) {
	const half = den / 2n;
	return num >= 0n ? (num + half) / den : (num - half) / den;
}

/**
 * Evaluates integrand `f` at fixed-point coordinate `x` and validates that the
 * returned value is a `BigInt`.
 *
 * @param {(x: bigint) => bigint} f - Integrand function.
 * @param {bigint} x - Evaluation point (fixed-point scaled by 10^18).
 * @returns {bigint} Function value `f(x)` (fixed-point scaled by 10^18).
 * @throws {TypeError} If `f(x)` does not return a `BigInt`.
 */
function evalIntegrand(f, x) {
	const y = f(x);
	if (typeof y !== 'bigint') {
		throw new TypeError(`f(x) must return a BigInt (received ${typeof y} at x=${x})`);
	}
	return y;
}

/**
 * Computes the definite integral of a function `f` over `[a, b]` using a
 * straightforward iterative composite Simpson's rule in fixed-point `BigInt`
 * arithmetic scaled by `10^18` (`SCALE = 10n ** 18n`).
 *
 * Fixed-point semantics:
 * - Inputs `a` and `b` are fixed-point `BigInt` values scaled by `10^18`
 *   (e.g., `2n * SCALE` represents `2.0`).
 * - The integrand `f(x)` receives a fixed-point `BigInt` `x` (scaled by `10^18`)
 *   and must return a fixed-point `BigInt` `f(x)` (scaled by `10^18`).
 * - The returned definite integral is a fixed-point `BigInt` scaled by `10^18`,
 *   rounded to the nearest integer (half away from zero).
 *
 * Method details (purely iterative, O(steps) evaluations):
 * - If `a === b`, returns `0n`.
 * - If `a > b`, integrates over `[b, a]` and negates the result so that
 *   `integral(f, a, b, steps) === -integral(f, b, a, steps)` holds exactly.
 * - For even `steps >= 2n`: composite Simpson's 1/3 rule (`O(h^4)`, exact for
 *   polynomials of degree <= 3).
 * - For odd `steps >= 3n`: composite Simpson's 1/3 rule on the first `steps - 3n`
 *   subintervals combined with Simpson's 3/8 rule on the final 3 subintervals
 *   (retaining `O(h^4)` accuracy and exactness for polynomials of degree <= 3).
 * - For `steps === 1n`: single-panel trapezoidal rule.
 *
 * @param {(x: bigint) => bigint} f - Integrand mapping fixed-point `x` to fixed-point `f(x)`.
 * @param {bigint} a - Lower integration bound (fixed-point scaled by 10^18).
 * @param {bigint} b - Upper integration bound (fixed-point scaled by 10^18).
 * @param {bigint} [steps=1000n] - Number of subintervals (positive `BigInt` >= `1n`).
 * @returns {bigint} Definite integral over `[a, b]` as fixed-point `BigInt` scaled by 10^18.
 * @throws {TypeError} If `f` is not a function, `a`/`b`/`steps` are not `BigInt`s,
 *   or `f(x)` returns a non-`BigInt` value.
 * @throws {RangeError} If `steps < 1n`.
 */
export function integralBigIntIterative(f, a, b, steps = DEFAULT_STEPS) {
	if (typeof f !== 'function') {
		throw new TypeError(`f must be a function (received ${typeof f})`);
	}
	if (typeof a !== 'bigint') {
		throw new TypeError(`a must be a BigInt (received ${typeof a})`);
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`b must be a BigInt (received ${typeof b})`);
	}
	if (typeof steps !== 'bigint') {
		throw new TypeError(`steps must be a BigInt (received ${typeof steps})`);
	}
	if (steps < 1n) {
		throw new RangeError(`steps must be a positive BigInt >= 1n (received ${steps})`);
	}

	if (a === b) {
		return 0n;
	}

	const sign = a < b ? 1n : -1n;
	const lo = a < b ? a : b;
	const hi = a < b ? b : a;
	const dx = hi - lo;

	// Single subinterval: trapezoidal rule
	if (steps === 1n) {
		const sum = evalIntegrand(f, lo) + evalIntegrand(f, hi);
		return sign * roundDiv(dx * sum, 2n * SCALE);
	}

	// Even number of subintervals: composite Simpson's 1/3 rule
	if (steps % 2n === 0n) {
		let weightedSum = evalIntegrand(f, lo) + evalIntegrand(f, hi);
		for (let i = 1n; i < steps; i++) {
			const xi = lo + roundDiv(dx * i, steps);
			const yi = evalIntegrand(f, xi);
			weightedSum += (i % 2n === 0n ? 2n : 4n) * yi;
		}
		return sign * roundDiv(dx * weightedSum, 3n * steps * SCALE);
	}

	// Odd number of subintervals >= 3n:
	// Composite Simpson's 1/3 on [0 .. split] + Simpson's 3/8 on [split .. steps],
	// combined under exact common denominator 24 * steps * SCALE:
	//   (h/3) * S_13 + (3h/8) * S_38 = (dx / (24 * steps)) * (8 * S_13 + 9 * S_38)
	const split = steps - 3n;
	let sum13 = 0n;
	let ySplit;

	if (split > 0n) {
		sum13 = evalIntegrand(f, lo);
		for (let i = 1n; i < split; i++) {
			const xi = lo + roundDiv(dx * i, steps);
			const yi = evalIntegrand(f, xi);
			sum13 += (i % 2n === 0n ? 2n : 4n) * yi;
		}
		const xSplit = lo + roundDiv(dx * split, steps);
		ySplit = evalIntegrand(f, xSplit);
		sum13 += ySplit;
	} else {
		ySplit = evalIntegrand(f, lo);
	}

	const x1 = lo + roundDiv(dx * (split + 1n), steps);
	const x2 = lo + roundDiv(dx * (split + 2n), steps);
	const sum38 =
		ySplit +
		3n * evalIntegrand(f, x1) +
		3n * evalIntegrand(f, x2) +
		evalIntegrand(f, hi);

	const combined = 8n * sum13 + 9n * sum38;
	return sign * roundDiv(dx * combined, 24n * steps * SCALE);
}
