/**
 * @fileoverview Iterative floating-point exponentiation over IEEE-754 float64 numbers.
 *
 * Implements `powerFloatIterative(base, exponent)` with zero external dependencies:
 * - Integer exponents use iterative exponentiation by squaring.
 * - Fractional exponents use `exp(exponent * ln(base))`, where both `ln` and `exp`
 *   are computed via range-reduced iterative power series.
 * - Follows IEEE-754 / ECMA-262 special-value semantics for `0`, `-0`, `±Infinity`,
 *   `NaN`, and domain errors (negative base with non-integer exponent returns `NaN`),
 *   while rejecting non-number inputs with a `TypeError`.
 */

const SQRT2 = Math.SQRT2
const SQRT1_2 = Math.SQRT1_2

// High/low Cody-Waite split of ln(2) so `k * LN2_HI` is exact for all |k| <= 2^21.
const LN2_HI = 6.9314718036912381649e-1
const LN2_LO = 1.90821492927058770002e-10
const LN2 = LN2_HI + LN2_LO

const MAX_SERIES_ITERATIONS = 100

/**
 * Returns true if `value` is a finite odd integer in IEEE-754 float64.
 * Note that every float64 integer with |value| >= 2^53 is even.
 *
 * @param {number} value
 * @returns {boolean}
 */
function isOddInteger(value) {
	return Number.isInteger(value) && Math.abs(value % 2) === 1
}

/**
 * Computes `base ** n` for a non-negative finite integer `n` using iterative
 * exponentiation by squaring.
 *
 * @param {number} base
 * @param {number} n - Non-negative finite integer exponent.
 * @returns {number}
 */
function intPowBySquaring(base, n) {
	let result = 1
	let factor = base
	let remaining = n

	while (remaining > 0) {
		if (remaining % 2 === 1) {
			result *= factor
		}
		remaining = Math.floor(remaining / 2)
		if (remaining > 0) {
			factor *= factor
		}
	}

	return result
}

/**
 * Scales `value` by `2^k` without premature overflow or double rounding into
 * subnormal float64 values.
 *
 * @param {number} value - Positive finite number near 1.
 * @param {number} k - Integer power of two.
 * @returns {number}
 */
function scaleByPowerOfTwo(value, k) {
	if (k === 0) return value
	if (k > 1024) return Infinity
	if (k < -1075) return 0

	if (k > 512) {
		return value * intPowBySquaring(2, 512) * intPowBySquaring(2, k - 512)
	}
	if (k < -512) {
		return value * intPowBySquaring(0.5, 512) * intPowBySquaring(0.5, -k - 512)
	}
	if (k > 0) {
		return value * intPowBySquaring(2, k)
	}
	return value * intPowBySquaring(0.5, -k)
}

/**
 * Computes the natural logarithm `ln(x)` for finite `x > 0` using iterative
 * binary range reduction into `[sqrt(2)/2, sqrt(2)]` followed by the iterative
 * hyperbolic arctangent series:
 *   `ln(m) = 2 * sum_{n=0..inf} t^(2n+1) / (2n + 1)`, where `t = (m - 1) / (m + 1)`.
 *
 * @param {number} x - Positive finite number.
 * @returns {number}
 */
function lnIterative(x) {
	let m = x
	let k = 0

	while (m >= SQRT2) {
		m *= 0.5
		k += 1
	}
	while (m < SQRT1_2) {
		m *= 2
		k -= 1
	}

	const t = (m - 1) / (m + 1)
	const t2 = t * t
	let term = t
	let sum = t

	for (let n = 1; n <= MAX_SERIES_ITERATIONS; n += 1) {
		term *= t2
		const next = sum + term / (2 * n + 1)
		if (next === sum) break
		sum = next
	}

	return k * LN2_HI + (k * LN2_LO + 2 * sum)
}

/**
 * Computes `e^x` for finite `x` using Cody-Waite range reduction
 * `x = k * ln(2) + r` with `|r| <= ln(2) / 2`, followed by the iterative
 * Taylor series for `exp(r)` and exact scaling by `2^k`.
 *
 * @param {number} x - Finite real exponent.
 * @returns {number}
 */
function expIterative(x) {
	if (x > 710) return Infinity
	if (x < -746) return 0

	const k = Math.round(x / LN2)
	const r = x - k * LN2_HI - k * LN2_LO

	let sum = 1
	let term = 1

	for (let n = 1; n <= MAX_SERIES_ITERATIONS; n += 1) {
		term = (term * r) / n
		const next = sum + term
		if (next === sum) break
		sum = next
	}

	return scaleByPowerOfTwo(sum, k)
}

/**
 * Raises `base` to the power `exponent` over IEEE-754 float64 numbers using an
 * iterative implementation.
 *
 * - For integer exponents, uses iterative exponentiation by squaring.
 * - For fractional exponents with positive base, computes `exp(exponent * ln(base))`
 *   using range-reduced iterative series.
 * - Throws a `TypeError` if either argument is not a `number`.
 * - Returns `NaN` for real-domain errors (negative finite base with a non-integer
 *   exponent) and follows IEEE-754 / ECMA-262 semantics for `0`, `-0`, `±Infinity`,
 *   and `NaN`.
 *
 * @param {number} base - The base value (IEEE-754 float64 number).
 * @param {number} exponent - The exponent value (IEEE-754 float64 number).
 * @returns {number} `base` raised to the power `exponent`.
 * @throws {TypeError} If `base` or `exponent` is not of type `'number'`.
 */
export function powerFloatIterative(base, exponent) {
	if (typeof base !== 'number') {
		throw new TypeError(`Expected base to be a number, got ${typeof base}`)
	}
	if (typeof exponent !== 'number') {
		throw new TypeError(`Expected exponent to be a number, got ${typeof exponent}`)
	}

	// IEEE-754 / ECMA-262 special cases
	if (Number.isNaN(exponent)) return NaN
	if (exponent === 0) return 1
	if (Number.isNaN(base)) return NaN

	if (!Number.isFinite(exponent)) {
		const absBase = Math.abs(base)
		if (absBase === 1) return NaN
		if (exponent > 0) {
			return absBase > 1 ? Infinity : 0
		}
		return absBase > 1 ? 0 : Infinity
	}

	if (!Number.isFinite(base)) {
		if (base > 0) {
			return exponent > 0 ? Infinity : 0
		}
		const odd = isOddInteger(exponent)
		if (exponent > 0) {
			return odd ? -Infinity : Infinity
		}
		return odd ? -0 : 0
	}

	if (base === 0) {
		const isNegZero = Object.is(base, -0)
		const odd = isOddInteger(exponent)
		if (exponent > 0) {
			return isNegZero && odd ? -0 : 0
		}
		return isNegZero && odd ? -Infinity : Infinity
	}

	if (base === 1) return 1

	if (Number.isInteger(exponent)) {
		if (base === -1) {
			return isOddInteger(exponent) ? -1 : 1
		}
		if (exponent > 0) {
			return intPowBySquaring(base, exponent)
		}
		const positivePow = intPowBySquaring(base, -exponent)
		if (Number.isFinite(positivePow)) {
			return 1 / positivePow
		}
		// Fallback avoids losing subnormal precision when `base^(-exponent)` overflows.
		return intPowBySquaring(1 / base, -exponent)
	}

	// Domain error: negative finite base with a non-integer finite exponent
	if (base < 0) return NaN

	return expIterative(exponent * lnIterative(base))
}
