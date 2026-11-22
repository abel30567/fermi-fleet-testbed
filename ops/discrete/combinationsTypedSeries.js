/**
 * Computes discrete binomial coefficients C(n, k) element-wise over Float64Array inputs.
 *
 * Uses a closed-form / identity-based implementation combining:
 * 1. Symmetry identity: C(n, k) = C(n, n - k), letting r = min(k, n - k).
 * 2. Closed-form log-gamma (Lanczos series) lower bound for O(1) IEEE-754 overflow detection.
 * 3. Closed-form multiplicative identity: C(n, r) = prod_{j=1..r} (n - r + j) / j,
 *    evaluated via exact BigInt division and converted once with round-to-nearest-even.
 *
 * @param {Float64Array} nValues - Non-negative safe integer values for n.
 * @param {Float64Array} kValues - Non-negative safe integer values for k.
 * @returns {Float64Array} Element-wise binomial coefficients C(n_i, k_i).
 *   Returns 0 when k_i > n_i, and Infinity when the exact result overflows Float64.
 * @throws {TypeError} If nValues or kValues is not a Float64Array.
 * @throws {RangeError} If nValues and kValues differ in length, or if any element
 *   is not a non-negative safe integer.
 */

// Lanczos approximation constants (g = 7, 9 terms) for log-gamma ln(Gamma(z)).
const LANCZOS_G = 7
const LANCZOS_COEFFS = [
	0.99999999999980993,
	676.5203681218851,
	-1259.1392167224028,
	771.32342877765313,
	-176.61502916214059,
	12.507343278686905,
	-0.13857109526572012,
	9.9843695780195716e-6,
	1.5056327351493116e-7,
]
const HALF_LN_2PI = 0.5 * Math.log(2 * Math.PI)

// For any r >= 515, C(n, r) >= C(2r, r) >= C(1030, 515) > Number.MAX_VALUE (~1.7977e308).
const MAX_FINITE_R = 514

// Conservative overflow threshold strictly above ln(Number.MAX_VALUE) (~709.782712893384).
const LN_OVERFLOW_BOUND = 710

/**
 * Evaluates ln(Gamma(z)) for z >= 1 using the Lanczos series.
 *
 * @param {number} z
 * @returns {number}
 */
function logGamma(z) {
	const x = z - 1
	let sum = LANCZOS_COEFFS[0]
	for (let i = 1; i < LANCZOS_COEFFS.length; i++) {
		sum += LANCZOS_COEFFS[i] / (x + i)
	}
	const t = x + LANCZOS_G + 0.5
	return HALF_LN_2PI + (x + 0.5) * Math.log(t) - t + Math.log(sum)
}

/**
 * Computes a single binomial coefficient C(n, k) for validated non-negative safe integers.
 *
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function binomialSingle(n, k) {
	if (k > n) return 0

	const r = k < n - k ? k : n - k
	if (r === 0) return 1
	if (r === 1) return n
	if (r > MAX_FINITE_R) return Infinity

	// Strict lower bound: ln C(n, r) >= r * ln(n - r + 1) - ln(Gamma(r + 1)).
	// Both terms are small (r <= 514), avoiding floating-point cancellation.
	const lowerBoundLn = r * Math.log(n - r + 1) - logGamma(r + 1)
	if (lowerBoundLn > LN_OVERFLOW_BOUND) return Infinity

	// Exact multiplicative identity: C(n, r) = prod_{j=1..r} (n - r + j) / j.
	// Every partial product of j consecutive integers is divisible by j!,
	// so BigInt division at each step is exact.
	const base = BigInt(n - r)
	let product = 1n
	for (let j = 1n; j <= BigInt(r); j++) {
		product = (product * (base + j)) / j
	}
	return Number(product)
}

export function combinationsTypedSeries(nValues, kValues) {
	if (!(nValues instanceof Float64Array)) {
		throw new TypeError('nValues must be a Float64Array')
	}
	if (!(kValues instanceof Float64Array)) {
		throw new TypeError('kValues must be a Float64Array')
	}

	const len = nValues.length
	if (len !== kValues.length) {
		throw new RangeError(
			`nValues and kValues must have equal length (got ${len} and ${kValues.length})`
		)
	}

	const out = new Float64Array(len)
	for (let i = 0; i < len; i++) {
		const n = nValues[i]
		const k = kValues[i]

		if (!Number.isSafeInteger(n) || n < 0) {
			throw new RangeError(
				`nValues[${i}] must be a non-negative safe integer, received ${n}`
			)
		}
		if (!Number.isSafeInteger(k) || k < 0) {
			throw new RangeError(
				`kValues[${i}] must be a non-negative safe integer, received ${k}`
			)
		}

		out[i] = binomialSingle(n, k)
	}

	return out
}
