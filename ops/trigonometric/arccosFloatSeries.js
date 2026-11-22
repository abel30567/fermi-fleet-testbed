/**
 * High-precision split constants for pi and pi / 2:
 *   PI     = PI_HI + PI_LO
 *   PI / 2 = PIO2_HI + PIO2_LO
 * Using hi + lo pairs preserves full IEEE-754 float64 accuracy during range
 * reconstruction (pi / 2 - arcsin(x) and pi - 2 * arcsin(u)).
 */
const PI_HI = Math.PI
const PI_LO = 1.2246467991473532e-16
const PIO2_HI = PI_HI * 0.5
const PIO2_LO = PI_LO * 0.5

/**
 * Maximum number of Maclaurin terms for arcsin(u) with |u| <= 0.5.
 * Since u^2 <= 0.25, term 30 is already below 1e-20, well past float64 precision.
 */
const MAX_SERIES_TERMS = 64

/**
 * Evaluates the Maclaurin tail S(z) = sum_{n=1..inf} [(2n)! / (4^n (n!)^2 (2n+1))] z^n
 * such that arcsin(u) = u + u * S(u^2), using Kahan compensated summation.
 *
 * Requires 0 <= z <= 0.25 for rapid, guaranteed convergence.
 *
 * @param {number} z - Equal to u^2, with 0 <= z <= 0.25.
 * @returns {number} Value of the series tail S(z).
 */
function arcsinSeriesTail(z) {
	if (z === 0) {
		return 0
	}

	let sum = 0
	let compensation = 0
	let coeffPow = 1

	for (let n = 1; n <= MAX_SERIES_TERMS; n++) {
		coeffPow *= ((2 * n - 1) / (2 * n)) * z
		const term = coeffPow / (2 * n + 1)

		// Kahan compensated summation to minimize rounding accumulation
		const y = term - compensation
		const next = sum + y
		compensation = next - sum - y
		sum = next

		if (term <= sum * Number.EPSILON * 0.25) {
			break
		}
	}

	return sum
}

/**
 * Computes arccos(x) in radians over IEEE-754 float64 numbers in [-1, 1]
 * using a Maclaurin series for arcsin combined with range-reduction identities
 * (without delegating to Math.acos or Math.asin).
 *
 * Range reduction:
 * - |x| <= 0.5: arccos(x) = pi/2 - arcsinSeries(x)
 * - x > 0.5:    arccos(x) = 2 * arcsinSeries(sqrt((1 - x) / 2))
 *               (exact 1 - x by Sterbenz's lemma; avoids cancellation near x = 1)
 * - x < -0.5:   arccos(x) = pi - 2 * arcsinSeries(sqrt((1 + x) / 2))
 *               (exact 1 + x by Sterbenz's lemma; preserves accuracy near x = -1)
 *
 * @param {number} x - Finite real number in the closed interval [-1, 1].
 * @returns {number} Principal value of arccos(x) in radians, in [0, pi].
 * @throws {TypeError} If x is not of type "number".
 * @throws {RangeError} If x is non-finite (NaN, +/-Infinity) or outside [-1, 1].
 */
export function arccosFloatSeries(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected x to be a number, received ${typeof x}`)
	}
	if (!Number.isFinite(x)) {
		throw new RangeError(`Expected x to be a finite number in [-1, 1], received ${x}`)
	}
	if (x < -1 || x > 1) {
		throw new RangeError(`Expected x to be in [-1, 1], received ${x}`)
	}

	// Exact boundary and midpoint values
	if (x === 1) {
		return 0
	}
	if (x === -1) {
		return PI_HI
	}
	if (x === 0) {
		return PIO2_HI
	}

	// Central region: |x| <= 0.5 -> pi/2 - arcsin(x)
	if (x >= -0.5 && x <= 0.5) {
		const tail = x * arcsinSeriesTail(x * x)
		// Compute (PIO2_HI - x) - (tail - PIO2_LO) to retain sub-ULP precision
		return PIO2_HI - x - (tail - PIO2_LO)
	}

	// Upper region: x > 0.5 -> 2 * arcsin(sqrt((1 - x) / 2))
	if (x > 0.5) {
		const z = (1 - x) * 0.5
		const u = Math.sqrt(z)
		const tail = u * arcsinSeriesTail(z)
		return 2 * (u + tail)
	}

	// Lower region: x < -0.5 -> pi - 2 * arcsin(sqrt((1 + x) / 2))
	const z = (1 + x) * 0.5
	const u = Math.sqrt(z)
	const tail = u * arcsinSeriesTail(z)
	const halfReduction = 2 * u
	const tailReduction = 2 * tail
	return PI_HI - halfReduction - (tailReduction - PI_LO)
}
