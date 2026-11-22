const LANCZOS_G = 7;
const LANCZOS_P = [
	0.99999999999980993,
	676.5203681218851,
	-1259.1392167224028,
	771.32342877765313,
	-176.61502916214059,
	12.507343278686905,
	-0.13857109526572012,
	9.9843695780195716e-6,
	1.5056327351493116e-7,
];

const HALF_LN_2PI = 0.5 * Math.log(2 * Math.PI);

// For r = min(k, n - k) > 514, C(n, r) >= C(1030, 515) > Number.MAX_VALUE.
// Falling back to the Lanczos log-gamma identity avoids long loops for huge k.
const LOG_GAMMA_THRESHOLD = 514;

/**
 * Computes the greatest common divisor of two positive safe integers using
 * the Euclidean algorithm.
 *
 * @param {number} a - Positive safe integer.
 * @param {number} b - Positive safe integer.
 * @returns {number} Greatest common divisor of `a` and `b`.
 */
function gcd(a, b) {
	let x = a;
	let y = b;
	while (y !== 0) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

/**
 * Evaluates ln(Gamma(z)) for positive real `z` via the 9-term Lanczos series
 * approximation (g = 7).
 *
 * @param {number} z - Positive finite real number.
 * @returns {number} Natural logarithm of Gamma(z).
 */
function logGamma(z) {
	const x = z - 1;
	let series = LANCZOS_P[0];
	for (let i = 1; i < LANCZOS_P.length; i++) {
		series += LANCZOS_P[i] / (x + i);
	}
	const t = x + LANCZOS_G + 0.5;
	return HALF_LN_2PI + (x + 0.5) * Math.log(t) - t + Math.log(series);
}

/**
 * Validates that a parameter is a finite non-negative integer Number.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not of type `number`.
 * @throws {RangeError} If `value` is NaN, non-finite, non-integer, or negative.
 */
function validateNonNegativeInteger(value, name) {
	if (typeof value !== 'number') {
		throw new TypeError(`${name} must be a number`);
	}
	if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
		throw new RangeError(`${name} must be a non-negative integer`);
	}
}

/**
 * Computes the binomial coefficient C(n, k) = n! / (k! * (n - k)!) over
 * IEEE-754 float64 Numbers.
 *
 * Algorithm:
 * 1. Applies the reflection symmetry C(n, k) = C(n, min(k, n - k)).
 * 2. For `r = min(k, n - k) <= 514`, evaluates the multiplicative closed-form
 *    identity `prod_{i=1}^{r} (n - r + i) / i`:
 *    - While intermediate values fit in exact safe integers, cancels
 *      `gcd(n - r + i, i)` and divides before multiplying so that every
 *      result `<= Number.MAX_SAFE_INTEGER` is bit-exact.
 *    - Beyond `Number.MAX_SAFE_INTEGER`, divides by `i` before multiplying by
 *      `(n - r + i)` to avoid premature intermediate overflow near
 *      `Number.MAX_VALUE` (e.g. C(1029, 514)).
 * 3. For very large `r > 514`, falls back to the Lanczos log-gamma series
 *    identity `exp(lnGamma(n + 1) - lnGamma(r + 1) - lnGamma(n - r + 1))`
 *    to evaluate in O(1) time without iterating `r` times.
 *
 * @param {number} n - Total number of items (non-negative integer).
 * @param {number} k - Number of chosen items (non-negative integer).
 * @returns {number} The binomial coefficient C(n, k) as an IEEE-754 float64
 *   Number (returns `0` when `k > n`, `1` when `k === 0` or `k === n`, and
 *   `Infinity` when the exact value exceeds `Number.MAX_VALUE`).
 * @throws {TypeError} If `n` or `k` is not a number.
 * @throws {RangeError} If `n` or `k` is NaN, non-finite, non-integer, or negative.
 */
export function combinationsFloatSeries(n, k) {
	validateNonNegativeInteger(n, 'n');
	validateNonNegativeInteger(k, 'k');

	if (k > n) {
		return 0;
	}
	if (k === 0 || k === n) {
		return 1;
	}

	const r = Math.min(k, n - k);
	if (r === 1) {
		return n;
	}

	if (r > LOG_GAMMA_THRESHOLD) {
		const lnC = logGamma(n + 1) - logGamma(r + 1) - logGamma(n - r + 1);
		if (Number.isNaN(lnC)) {
			return Infinity;
		}
		return Math.exp(lnC);
	}

	let result = 1;
	for (let i = 1; i <= r; i++) {
		let num = n - r + i;
		let den = i;
		if (result <= Number.MAX_SAFE_INTEGER && num <= Number.MAX_SAFE_INTEGER) {
			const g = gcd(num, den);
			num /= g;
			den /= g;
		}
		result = (result / den) * num;
		if (!Number.isFinite(result)) {
			return Infinity;
		}
	}

	return result;
}
