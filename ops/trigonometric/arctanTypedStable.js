/**
 * Numerically robust element-wise arctangent over Float64Array inputs.
 *
 * Uses 5-interval dyadic argument reduction (around 0, 0.5, 1.0, 1.5, and ∞)
 * with double-double (hi + lo) precomputed constants, Knuth/Dekker error-free
 * transformations (TwoSum / TwoProd) for compensated quotient and residual
 * evaluation, and compensated (Neumaier / TwoSum) Taylor series summation.
 *
 * Guarantees IEEE-754 special-value semantics (±0, ±Infinity, NaN, subnormals),
 * exact odd symmetry, and <= 1 ULP accuracy across the entire binary64 domain.
 */

// Double-double (hi + lo) constants for arctan(0.5), pi/4, arctan(1.5), pi/2.
// Verified to 200-bit fixed-point precision.
const ATAN_HALF_HI = 0.4636476090008061
const ATAN_HALF_LO = 2.2698777452961687e-17

const PI_OVER_4_HI = 0.7853981633974483
const PI_OVER_4_LO = 3.061616997868383e-17

const ATAN_THREE_HALF_HI = 0.982793723247329
const ATAN_THREE_HALF_LO = 1.3903311031230998e-17

const PI_OVER_2_HI = 1.5707963267948966
const PI_OVER_2_LO = 6.123233995736766e-17

// Veltkamp splitting factor 2^27 + 1 for Dekker's exact TwoProd.
const VELTKAMP_SPLIT = 134217729

// Thresholds for fast exact asymptotic branches:
// - Below 2^-27, |x^3 / 3| < 0.5 * ulp(x), so atan(x) === x in binary64.
// - Above 2^55, 1 / |x| < 0.5 * ulp(pi / 2), so atan(|x|) === pi / 2 in binary64.
const TINY_THRESHOLD = 2 ** -27
const HUGE_THRESHOLD = 2 ** 55

// Dyadic argument-reduction breakpoints (exact in binary64).
const BREAK_0 = 7 / 16   // 0.4375
const BREAK_1 = 11 / 16  // 0.6875
const BREAK_2 = 19 / 16  // 1.1875
const BREAK_3 = 39 / 16  // 2.4375

// Maximum Taylor series terms needed for |t| <= 7/16 so |t|^(2N+1)/(2N+1) < 2^-64.
const MAX_SERIES_TERMS = 26

// Tolerance relative to |t| to stop early when terms are negligible.
const SERIES_EPS = 1e-19

/**
 * Knuth's error-free transformation for floating-point addition.
 * Computes s + e === a + b exactly (for finite non-overflowing inputs).
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]} [sum, error]
 */
function twoSum(a, b) {
	const s = a + b
	const bb = s - a
	const e = (a - (s - bb)) + (b - bb)
	return [s, e]
}

/**
 * Dekker's error-free transformation for floating-point multiplication
 * using Veltkamp splitting (portable zero-dep alternative to FMA).
 * Computes p + e === a * b exactly when operands do not overflow/underflow.
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]} [product, error]
 */
function twoProd(a, b) {
	const p = a * b
	const ca = VELTKAMP_SPLIT * a
	const aHi = ca - (ca - a)
	const aLo = a - aHi
	const cb = VELTKAMP_SPLIT * b
	const bHi = cb - (cb - b)
	const bLo = b - bHi
	const e = ((aHi * bHi - p) + aHi * bLo + aLo * bHi) + aLo * bLo
	return [p, e]
}

/**
 * Double-double division (nHi + nLo) / (dHi + dLo) -> [qHi, qLo].
 * Produces a quotient accurate to ~106 bits (well beyond binary64 precision).
 *
 * @param {number} nHi
 * @param {number} nLo
 * @param {number} dHi
 * @param {number} dLo
 * @returns {[number, number]} [qHi, qLo]
 */
function ddDiv(nHi, nLo, dHi, dLo) {
	const q1 = nHi / dHi
	const [pHi, pLo] = twoProd(q1, dHi)
	// Residual: r = (nHi + nLo) - q1 * (dHi + dLo)
	const [sHi, sLo] = twoSum(nHi, -pHi)
	const r = sHi + (sLo + nLo - pLo - q1 * dLo)
	const q2 = r / dHi
	return twoSum(q1, q2)
}

/**
 * Evaluates the Taylor tail R(t) = sum_{k=1..N} (-1)^k * t^(2k+1) / (2k+1)
 * for |t| <= 7/16 using compensated summation and double-double precision
 * for the leading cubic term.
 *
 * @param {number} t
 * @returns {[number, number]} [tailHi, tailLo]
 */
function atanTailCompensated(t) {
	const [zHi, zLo] = twoProd(t, t)
	const [t3Hi, t3LoProd] = twoProd(t, zHi)
	const t3Lo = t3LoProd + t * zLo

	// Leading term: -t^3 / 3 computed in double-double precision.
	const [leadHi, leadLo] = ddDiv(-t3Hi, -t3Lo, 3, 0)

	// Accumulate remaining terms k = 2..MAX_SERIES_TERMS via TwoSum compensation.
	let sumHi = 0
	let sumLo = 0
	let power = t3Hi
	const z = zHi
	const stopBound = Math.abs(t) * SERIES_EPS

	for (let k = 2; k <= MAX_SERIES_TERMS; k++) {
		power *= z
		const denom = 2 * k + 1
		const term = (k & 1) === 1 ? -(power / denom) : power / denom
		if (Math.abs(term) <= stopBound) {
			break
		}
		const [s, e] = twoSum(sumHi, term)
		sumHi = s
		sumLo += e
	}

	// Combine leading double-double term with compensated tail sum.
	const [combHi, combErr] = twoSum(leadHi, sumHi)
	return twoSum(combHi, combErr + leadLo + sumLo)
}

/**
 * Computes arctan(x) for a single IEEE-754 binary64 scalar with <= 1 ULP error.
 *
 * @param {number} x
 * @returns {number}
 */
function atanScalarStable(x) {
	if (Number.isNaN(x)) {
		return NaN
	}
	if (x === 0) {
		return x // Preserves +0 and -0.
	}

	const neg = x < 0
	const a = neg ? -x : x

	if (!Number.isFinite(a) || a > HUGE_THRESHOLD) {
		return neg ? -PI_OVER_2_HI : PI_OVER_2_HI
	}
	if (a < TINY_THRESHOLD) {
		return x // Exact in binary64; avoids subnormal underflow in x^2.
	}

	let cHi = 0
	let cLo = 0
	let tHi = a
	let tLo = 0

	if (a < BREAK_0) {
		// Interval 0: [2^-27, 7/16) — no reduction needed.
		cHi = 0
		cLo = 0
		tHi = a
		tLo = 0
	} else if (a < BREAK_1) {
		// Interval 1: [7/16, 11/16) — reduce around 0.5: (2a - 1) / (2 + a).
		cHi = ATAN_HALF_HI
		cLo = ATAN_HALF_LO
		const num = 2 * a - 1 // Exact by Sterbenz's lemma.
		const [denHi, denLo] = twoSum(2, a)
		;[tHi, tLo] = ddDiv(num, 0, denHi, denLo)
	} else if (a < BREAK_2) {
		// Interval 2: [11/16, 19/16) — reduce around 1.0: (a - 1) / (a + 1).
		cHi = PI_OVER_4_HI
		cLo = PI_OVER_4_LO
		const num = a - 1 // Exact by Sterbenz's lemma.
		const [denHi, denLo] = twoSum(1, a)
		;[tHi, tLo] = ddDiv(num, 0, denHi, denLo)
	} else if (a < BREAK_3) {
		// Interval 3: [19/16, 39/16) — reduce around 1.5: (a - 1.5) / (1 + 1.5a).
		cHi = ATAN_THREE_HALF_HI
		cLo = ATAN_THREE_HALF_LO
		const num = a - 1.5 // Exact by Sterbenz's lemma.
		const [pHi, pLo] = twoProd(1.5, a)
		const [dHi, dErr] = twoSum(1, pHi)
		const [denHi, denLo] = twoSum(dHi, dErr + pLo)
		;[tHi, tLo] = ddDiv(num, 0, denHi, denLo)
	} else {
		// Interval 4: [39/16, 2^55] — reduce around ∞: pi/2 + atan(-1 / a).
		cHi = PI_OVER_2_HI
		cLo = PI_OVER_2_LO
		;[tHi, tLo] = ddDiv(-1, 0, a, 0)
	}

	// Evaluate atan(tHi + tLo) = tHi + R(tHi) + tLo / (1 + tHi^2) + O(tLo^2).
	const [tailHi, tailLo] = atanTailCompensated(tHi)
	const derivCorr = tLo === 0 ? 0 : tLo / (1 + tHi * tHi)

	// Compensated summation of cHi + tHi + tailHi + (cLo + tailLo + derivCorr).
	const [s1, e1] = twoSum(cHi, tHi)
	const [s2, e2] = twoSum(s1, tailHi)
	const result = s2 + (e1 + e2 + cLo + tailLo + derivCorr)

	return neg ? -result : result
}

/**
 * Computes the element-wise arctangent (in radians, within [-π/2, π/2]) over a
 * Float64Array using a numerically robust compensated-summation algorithm.
 *
 * @param {Float64Array} input - Input values (not mutated unless passed as `out`).
 * @param {Float64Array} [out] - Optional pre-allocated output Float64Array of the same length.
 * @returns {Float64Array} A Float64Array containing arctan(input[i]) for each element.
 * @throws {TypeError} If `input` is not a Float64Array, or if `out` is provided and not a Float64Array.
 * @throws {RangeError} If `out` is provided and its length does not match `input.length`.
 */
export function arctanTypedStable(input, out) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	let result
	if (out === undefined) {
		result = new Float64Array(input.length)
	} else {
		if (!(out instanceof Float64Array)) {
			throw new TypeError('Expected out to be a Float64Array')
		}
		if (out.length !== input.length) {
			throw new RangeError(
				`Expected out length (${out.length}) to match input length (${input.length})`
			)
		}
		result = out
	}

	for (let i = 0; i < input.length; i++) {
		result[i] = atanScalarStable(input[i])
	}

	return result
}
