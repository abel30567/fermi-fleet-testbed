/**
 * Element-wise discrete permutations P(n, k) = n! / (n - k)! over Float64Array inputs,
 * computed via closed-form identities and a cancellation-free Stirling-Bernoulli
 * asymptotic series for ln(Gamma(n + 1) / Gamma(n - k + 1)).
 *
 * @module ops/discrete/permutationsTypedSeries
 */

/**
 * Exact factorials 0! through 18! (all <= Number.MAX_SAFE_INTEGER = 2^53 - 1).
 * @type {readonly number[]}
 */
const EXACT_FACTORIALS = Object.freeze([
	1, // 0!
	1, // 1!
	2, // 2!
	6, // 3!
	24, // 4!
	120, // 5!
	720, // 6!
	5040, // 7!
	40320, // 8!
	362880, // 9!
	3628800, // 10!
	39916800, // 11!
	479001600, // 12!
	6227020800, // 13!
	87178291200, // 14!
	1307674368000, // 15!
	20922789888000, // 16!
	355687428096000, // 17!
	6402373705728000, // 18!
])

/**
 * Coefficients c_r = B_{2r} / (2r * (2r - 1)) for r = 1..8 of Stirling's
 * asymptotic series for ln(Gamma(z)):
 *   ln(Gamma(z)) = (z - 1/2) ln(z) - z + 1/2 ln(2*pi) + sum_{r=1..8} c_r / z^(2r - 1)
 * For z >= 20, the truncation remainder is bounded by ~1.1e-22 (< machine epsilon).
 * @type {readonly number[]}
 */
const STIRLING_COEFFS = Object.freeze([
	1 / 12,
	-1 / 360,
	1 / 1260,
	-1 / 1680,
	1 / 1188,
	-691 / 360360,
	1 / 156,
	-3617 / 122400,
])

const HALF_LOG_2PI = 0.5 * Math.log(2 * Math.PI)
const EXACT_TABLE_LIMIT = EXACT_FACTORIALS.length - 1

/**
 * Evaluates the Stirling asymptotic remainder series S(z) = sum_{r=1..8} c_r / z^(2r - 1)
 * using Horner's method in 1 / z^2.
 *
 * @param {number} z - Positive argument (expected z >= 20 for full Float64 precision).
 * @returns {number} Value of the Stirling series remainder.
 */
function stirlingRemainder(z) {
	const invZ = 1 / z
	const invZ2 = invZ * invZ
	let sum = 0
	for (let i = STIRLING_COEFFS.length - 1; i >= 0; i--) {
		sum = sum * invZ2 + STIRLING_COEFFS[i]
	}
	return sum * invZ
}

/**
 * Evaluates ln(1 + u) - u without catastrophic cancellation for small |u|
 * via the alternating Maclaurin series sum_{j=2..inf} (-1)^(j-1) u^j / j.
 *
 * @param {number} u - Non-negative ratio k / (n - k + 1).
 * @returns {number} Value of ln(1 + u) - u.
 */
function log1pMinusArg(u) {
	if (u <= 0.25) {
		let term = -u * u
		let sum = term / 2
		for (let j = 3; j <= 40; j++) {
			term *= -u
			const next = sum + term / j
			if (next === sum) break
			sum = next
		}
		return sum
	}
	return Math.log1p(u) - u
}

/**
 * Computes scalar P(n, k) = n! / (n - k)! for validated non-negative safe integers n, k.
 *
 * @param {number} n - Total number of items (non-negative safe integer).
 * @param {number} k - Number of items arranged (non-negative safe integer).
 * @returns {number} Number of k-permutations of n (or Infinity on Float64 overflow).
 */
function scalarPermutationsSeries(n, k) {
	// Closed-form combinatorial boundary and low-degree polynomial identities
	if (k === 0) return 1
	if (k > n) return 0
	if (k === 1) return n === 0 ? 0 : n
	if (k === 2) return n * (n - 1)
	if (k === 3) return n * (n - 1) * (n - 2)

	// Bit-exact closed-form factorial quotient for n <= 18
	if (n <= EXACT_TABLE_LIMIT) {
		return EXACT_FACTORIALS[n] / EXACT_FACTORIALS[n - k]
	}

	const m = n - k
	const b = n + 1
	let logP

	if (m <= EXACT_TABLE_LIMIT) {
		// b >= 20: Stirling series for ln(Gamma(n + 1)) minus exact ln((n - k)!)
		const logGammaB = (b - 0.5) * Math.log(b) - b + HALF_LOG_2PI + stirlingRemainder(b)
		logP = logGammaB - Math.log(EXACT_FACTORIALS[m])
	} else {
		// Both a = m + 1 >= 20 and b = a + k > 20:
		// Cancellation-free difference ln(Gamma(a + k)) - ln(Gamma(a))
		const a = m + 1
		const u = k / a
		const log1pU = Math.log1p(u)
		const mainTerm = k * Math.log(a) + (k - 0.5) * log1pU + a * log1pMinusArg(u)

		let remDiff = 0
		const invA = 1 / a
		const invA2 = invA * invA
		let invAPow = invA
		for (let i = 0; i < STIRLING_COEFFS.length; i++) {
			const p = 2 * i + 1
			remDiff += STIRLING_COEFFS[i] * invAPow * Math.expm1(-p * log1pU)
			invAPow *= invA2
		}
		logP = mainTerm + remDiff
	}

	const result = Math.exp(logP)
	if (!Number.isFinite(result)) {
		return Infinity
	}
	return result <= Number.MAX_SAFE_INTEGER ? Math.round(result) : result
}

/**
 * Computes element-wise discrete permutations P(n, k) = n! / (n - k)! over
 * Float64Array inputs using closed-form identities and a cancellation-free
 * Stirling-Bernoulli asymptotic series.
 *
 * For each index `i`:
 * - `n = nArray[i]` and `k = kArray[i]` must be non-negative safe integers
 *   (`0 <= n, k <= Number.MAX_SAFE_INTEGER`).
 * - Returns `1` when `k === 0` (including `P(0, 0) = 1`).
 * - Returns `0` when `k > n`.
 * - Returns `Infinity` if the result overflows IEEE-754 double precision.
 *
 * @param {Float64Array} nArray - Array of population sizes `n`.
 * @param {Float64Array} kArray - Array of arrangement lengths `k`.
 * @returns {Float64Array} A new Float64Array containing `P(nArray[i], kArray[i])`.
 * @throws {TypeError} If `nArray` or `kArray` is not a `Float64Array`.
 * @throws {RangeError} If input lengths differ, or any element is not a non-negative safe integer.
 */
export function permutationsTypedSeries(nArray, kArray) {
	if (!(nArray instanceof Float64Array)) {
		throw new TypeError('nArray must be a Float64Array')
	}
	if (!(kArray instanceof Float64Array)) {
		throw new TypeError('kArray must be a Float64Array')
	}
	if (nArray.length !== kArray.length) {
		throw new RangeError(
			`Input length mismatch: nArray.length (${nArray.length}) !== kArray.length (${kArray.length})`
		)
	}

	const len = nArray.length
	const out = new Float64Array(len)

	for (let i = 0; i < len; i++) {
		const n = nArray[i]
		const k = kArray[i]
		if (!Number.isSafeInteger(n) || n < 0) {
			throw new RangeError(`nArray[${i}] must be a non-negative safe integer, got ${n}`)
		}
		if (!Number.isSafeInteger(k) || k < 0) {
			throw new RangeError(`kArray[${i}] must be a non-negative safe integer, got ${k}`)
		}
		out[i] = scalarPermutationsSeries(n, k)
	}

	return out
}
