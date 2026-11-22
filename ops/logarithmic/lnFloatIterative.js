const SQRT2 = Math.SQRT2
const SQRT1_2 = Math.SQRT1_2

// High/low split of ln(2) so k * LN2_HI is exact for all IEEE-754 float64 exponents k in [-1074, 1024].
const LN2_HI = 0.6931471803691238
const LN2_LO = 1.9082149292705877e-10
const MAX_SERIES_DENOM = 101

/**
 * Computes the natural logarithm ln(x) of a positive IEEE-754 float64 number
 * using iterative range reduction and the iterative atanh Taylor series.
 *
 * First reduces x = m * 2^k iteratively so that m lies in [sqrt(1/2), sqrt(2)).
 * Then computes ln(m) = 2 * sum_{j=0}^{inf} t^(2j+1) / (2j+1) where t = (m - 1) / (m + 1),
 * iterating until additional terms no longer change the float64 sum, and combines
 * ln(x) = k * ln(2) + ln(m) using a high/low split of ln(2).
 *
 * @param {number} x - The positive number whose natural logarithm is computed.
 * @returns {number} The natural logarithm of `x` (`NaN` for `NaN`, `Infinity` for `Infinity`).
 * @throws {TypeError} If `x` is not a number.
 * @throws {RangeError} If `x <= 0` (including `0`, `-0`, negative finite numbers, and `-Infinity`).
 */
export function lnFloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, got ${typeof x}`)
	}

	if (Number.isNaN(x)) {
		return Number.NaN
	}

	if (x <= 0) {
		throw new RangeError(`Expected a positive number (> 0), got ${x}`)
	}

	if (x === Number.POSITIVE_INFINITY) {
		return Number.POSITIVE_INFINITY
	}

	if (x === 1) {
		return 0
	}

	// Iterative range reduction: find integer k and mantissa m in [sqrt(1/2), sqrt(2))
	// such that x = m * 2^k. Multiplying or dividing by 2 is exact in IEEE-754 float64.
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

	// Iterative atanh series: ln(m) = 2 * (t + t^3/3 + t^5/5 + ...), t = (m - 1) / (m + 1).
	// Since m in [sqrt(1/2), sqrt(2)), |t| <= 3 - 2*sqrt(2) ~= 0.1716, so t^2 < 0.03.
	const t = (m - 1) / (m + 1)
	const t2 = t * t
	let term = t
	let sum = t

	for (let denom = 3; denom <= MAX_SERIES_DENOM; denom += 2) {
		term *= t2
		const nextSum = sum + term / denom
		if (nextSum === sum) {
			break
		}
		sum = nextSum
	}

	return k * LN2_HI + (k * LN2_LO + 2 * sum)
}
