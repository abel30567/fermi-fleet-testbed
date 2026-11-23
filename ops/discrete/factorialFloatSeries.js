/**
 * @fileoverview Factorial over IEEE-754 float64 numbers using an exact product
 * for small inputs (0 <= n <= 21) and the Stirling–Bernoulli asymptotic series
 * for Gamma(n + 1) across 22 <= n <= 170.
 */

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/**
 * Maximum integer whose factorial is exact in IEEE-754 binary64.
 * 21! = 51090942171709440000 = 194896477400625 * 2^18 (< 2^53 * 2^18).
 */
const EXACT_MAX_N = 21;

/**
 * Maximum integer whose factorial is finite in IEEE-754 binary64.
 * 170! ≈ 7.257415615307999e+306 < Number.MAX_VALUE; 171! overflows to Infinity.
 */
const FINITE_MAX_N = 170;

/**
 * Computes the factorial `n!` as an IEEE-754 float64 number.
 *
 * - For `0 <= n <= 21`, computes the exact product in float64.
 * - For `22 <= n <= 170`, evaluates `Gamma(n + 1)` via the Stirling–Bernoulli
 *   asymptotic series with split half-exponentiation to avoid intermediate
 *   overflow and achieve near-ULP accuracy (~1e-15 relative error).
 * - For finite integers `n > 170`, returns `Infinity` (float64 overflow).
 *
 * @param {number} n - A finite non-negative integer.
 * @returns {number} The factorial `n!` as a float64 number (`Infinity` for `n > 170`).
 * @throws {TypeError} If `n` is not a number.
 * @throws {RangeError} If `n` is NaN, infinite, non-integer, or negative.
 */
export function factorialFloatSeries(n) {
	if (typeof n !== 'number') {
		throw new TypeError(`Expected a number, got ${typeof n}`);
	}
	if (!Number.isFinite(n) || !Number.isInteger(n)) {
		throw new RangeError(`Expected a finite integer, got ${n}`);
	}
	if (n < 0) {
		throw new RangeError(`Expected a non-negative integer, got ${n}`);
	}

	if (n <= EXACT_MAX_N) {
		let result = 1;
		for (let i = 2; i <= n; i++) {
			result *= i;
		}
		return result;
	}

	if (n > FINITE_MAX_N) {
		return Infinity;
	}

	// Stirling–Bernoulli asymptotic series for Gamma(n + 1):
	// n! = sqrt(2 * pi * n) * (n / e)^n * exp(sum_{k=1..6} B_{2k} / (2k * (2k - 1) * n^(2k - 1)))
	// At n = 22, the omitted k = 7 term is < 3e-20, well below float64 epsilon.
	const invN = 1 / n;
	const invN2 = invN * invN;
	const series =
		invN *
		(1 / 12 +
			invN2 *
				(-1 / 360 +
					invN2 *
						(1 / 1260 +
							invN2 *
								(-1 / 1680 +
									invN2 * (1 / 1188 + invN2 * (-691 / 360360))))));

	// Split (n / e)^n = (n^(n/2) * e^(-n/2))^2 to prevent intermediate overflow up to n = 170.
	const halfPow = Math.pow(n, n / 2) * Math.exp(-n / 2);
	return SQRT_2PI * Math.sqrt(n) * Math.exp(series) * halfPow * halfPow;
}
