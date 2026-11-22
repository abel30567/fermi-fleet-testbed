/**
 * High-precision half-pi split: HALF_PI_HI + HALF_PI_LO ≈ π / 2 to ~106 bits.
 * Using a compensated split avoids rounding loss when subtracting small values
 * near |x| → 1 in the reflection identity.
 */
const HALF_PI_HI = Math.PI / 2
const HALF_PI_LO = 6.123233995736766e-17

/** Maximum series iterations (|u| <= 0.5 converges in <= 28 terms in float64). */
const MAX_SERIES_TERMS = 100

/**
 * Evaluates arcsin(u) for 0 <= u <= 0.5 using the Maclaurin power series:
 *
 *   arcsin(u) = sum_{k=0..∞} ((2k)! / (4^k * (k!)^2 * (2k + 1))) * u^(2k + 1)
 *
 * Terms are generated via the recurrence:
 *   p_0 = u
 *   p_k = p_{k-1} * ((2k - 1) / (2k)) * u^2
 *   term_k = p_k / (2k + 1)
 *
 * Accumulates the k >= 1 tail separately with Kahan compensated summation
 * before adding to u to preserve full IEEE-754 float64 precision.
 *
 * @param {number} u - Non-negative finite number with 0 <= u <= 0.5.
 * @returns {number} arcsin(u) in radians.
 */
function arcsinSeriesUnitHalf(u) {
	if (u === 0) {
		return 0
	}

	const u2 = u * u
	let p = u
	let tail = 0
	let compensation = 0

	for (let k = 1; k <= MAX_SERIES_TERMS; k++) {
		const twoK = 2 * k
		p *= ((twoK - 1) / twoK) * u2
		const term = p / (twoK + 1)

		// Kahan compensated addition into tail
		const y = term - compensation
		const nextTail = tail + y
		compensation = (nextTail - tail) - y
		tail = nextTail

		// Stop once the term no longer affects the sum u + tail in float64
		if (u + (tail + term) === u + tail) {
			break
		}
	}

	return u + (tail - compensation)
}

/**
 * Computes the principal value of arcsin(x) (inverse sine) in radians over
 * IEEE-754 float64 numbers in [-1, 1], without delegating to `Math.asin`.
 *
 * Uses a two-regime series and identity formulation:
 * - For `|x| <= 0.5`: direct Maclaurin series with Kahan-compensated tail
 *   summation, which converges rapidly (at least 2 bits per term).
 * - For `0.5 < |x| < 1`: half-angle reflection identity
 *   `arcsin(x) = sign(x) * (π/2 - 2 * arcsin(sqrt((1 - |x|) / 2)))`,
 *   mapping the argument into `(0, 0.5)` where the series converges rapidly
 *   and `1 - |x|` is exact by Sterbenz's lemma.
 * - Preserves signed zero (`arcsinFloatSeries(-0)` is `-0`) and exact
 *   endpoints `±π/2` at `x = ±1`.
 *
 * @param {number} x - Finite real number in the closed interval [-1, 1].
 * @returns {number} Principal arcsin(x) in radians within [-π/2, π/2].
 * @throws {TypeError} If `x` is not a number.
 * @throws {RangeError} If `x` is non-finite (`NaN`, `±Infinity`) or outside `[-1, 1]`.
 */
export function arcsinFloatSeries(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number for x, received ${typeof x}`)
	}
	if (!Number.isFinite(x)) {
		throw new RangeError(`Expected a finite number for x, received ${x}`)
	}
	if (x < -1 || x > 1) {
		throw new RangeError(`Input x=${x} is out of domain [-1, 1]`)
	}

	// Preserve signed zero (+0 -> +0, -0 -> -0)
	if (x === 0) {
		return x
	}

	const sign = x < 0 ? -1 : 1
	const ax = Math.abs(x)

	if (ax === 1) {
		return sign * HALF_PI_HI
	}

	if (ax <= 0.5) {
		return sign * arcsinSeriesUnitHalf(ax)
	}

	// For 0.5 < |x| < 1, s = sqrt((1 - |x|) / 2) lies strictly in (0, 0.5).
	const s = Math.sqrt((1 - ax) / 2)
	const reduced = 2 * arcsinSeriesUnitHalf(s)
	return sign * (HALF_PI_HI - (reduced - HALF_PI_LO))
}
