/**
 * Discrete factorial evaluated element-wise over a Float64Array using a
 * Stirling asymptotic series and factorial shift identity.
 *
 * For n >= 15 (and n <= 170), n! is computed via the multiplicative Stirling
 * series with Bernoulli correction terms B_2 through B_16:
 *
 *   n! = sqrt(2 * pi * n) * (n^(n/2) * exp(-n)) * n^(n/2) * exp(R(n))
 *   R(n) = sum_{k=1}^{8} (B_{2k} / (2k * (2k - 1))) / n^(2k - 1)
 *
 * Splitting n^n into n^(n/2) * exp(-n) * n^(n/2) avoids intermediate overflow
 * and underflow up to n = 170 (the largest integer whose factorial fits in
 * IEEE-754 binary64).
 *
 * For 0 <= n < 15, the downward shift identity is applied from the rounded
 * series value at m = 15 (15! = 1,307,674,368,000 < 2^53):
 *
 *   n! = 15! / prod_{j = n + 1}^{15} j
 *
 * For finite non-negative integers n >= 171, the result overflows binary64
 * and is returned as Infinity.
 */

const TWO_PI = 2 * Math.PI
const STIRLING_THRESHOLD = 15
const MAX_FINITE_FACTORIAL_N = 170

/**
 * Stirling asymptotic series coefficients c_k = B_{2k} / (2k * (2k - 1))
 * for k = 1..8, stored from highest order to lowest order for Horner evaluation.
 */
const STIRLING_COEFFS_DESC = Object.freeze([
	-3617 / 122400, // k = 8: B_16 / (16 * 15)
	1 / 156,        // k = 7: B_14 / (14 * 13)
	-691 / 360360,  // k = 6: B_12 / (12 * 11)
	1 / 1188,       // k = 5: B_10 / (10 * 9)
	-1 / 1680,      // k = 4: B_8  / (8  * 7)
	1 / 1260,       // k = 3: B_6  / (6  * 5)
	-1 / 360,       // k = 2: B_4  / (4  * 3)
	1 / 12,         // k = 1: B_2  / (2  * 1)
])

/**
 * Evaluate n! via the multiplicative Stirling asymptotic series for n >= 15.
 *
 * @param {number} n - Finite integer with 15 <= n <= 170.
 * @returns {number} Approximation of n! accurate to within a few ULPs.
 */
function stirlingSeriesFactorial(n) {
	const invN = 1 / n
	const invN2 = invN * invN

	let poly = 0
	for (let k = 0; k < STIRLING_COEFFS_DESC.length; k++) {
		poly = poly * invN2 + STIRLING_COEFFS_DESC[k]
	}
	const remainder = invN * poly

	const halfN = n * 0.5
	const halfPow = Math.pow(n, halfN)
	const scaledCore = (halfPow * Math.exp(-n)) * halfPow
	return scaledCore * Math.sqrt(TWO_PI * n) * Math.exp(remainder)
}

/**
 * Compute discrete factorial n! for a validated finite non-negative integer.
 *
 * @param {number} n - Validated finite non-negative integer.
 * @returns {number} Value of n! in IEEE-754 float64 (Infinity for n >= 171).
 */
function factorialScalar(n) {
	if (n > MAX_FINITE_FACTORIAL_N) {
		return Infinity
	}

	if (n < STIRLING_THRESHOLD) {
		// Exact 15! obtained from Stirling's series (15! < 2^53), shifted down via n! = 15! / prod_{j=n+1}^{15} j.
		let value = Math.round(stirlingSeriesFactorial(STIRLING_THRESHOLD))
		for (let j = STIRLING_THRESHOLD; j > n; j--) {
			value /= j
		}
		return value
	}

	return stirlingSeriesFactorial(n)
}

/**
 * Compute discrete factorial (n!) element-wise over a Float64Array using
 * Stirling's asymptotic series and the factorial shift identity.
 *
 * Does not mutate the input array.
 *
 * @param {Float64Array} input - Float64Array of finite non-negative integers.
 * @returns {Float64Array} New Float64Array containing n! for each element.
 * @throws {TypeError} If input is not a Float64Array.
 * @throws {RangeError} If any element is not a finite non-negative integer.
 */
export function factorialTypedSeries(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError(
			`factorialTypedSeries expected a Float64Array, received ${input === null ? 'null' : typeof input}`
		)
	}

	const len = input.length
	const output = new Float64Array(len)

	for (let i = 0; i < len; i++) {
		const n = input[i]
		if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
			throw new RangeError(
				`factorialTypedSeries requires finite non-negative integers; got ${n} at index ${i}`
			)
		}
		output[i] = factorialScalar(n)
	}

	return output
}
