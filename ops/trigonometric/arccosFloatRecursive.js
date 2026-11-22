const HALF_PI = Math.PI / 2

/**
 * Threshold for the complement d = 1 - x below which the half-angle recursion
 * terminates and evaluates the small-angle Taylor series in s = sqrt(d / 2).
 * At d <= 1e-4, s^2 <= 5e-5, so the 6-term series truncation error is < 1e-23
 * (well below IEEE-754 float64 machine epsilon ~2.22e-16).
 */
const SMALL_COMPLEMENT_THRESHOLD = 1e-4

// Taylor coefficients for arcsin(s) / s = sum_{n>=0} c_n * s^(2n)
const C1 = 1 / 6
const C2 = 3 / 40
const C3 = 5 / 112
const C4 = 35 / 1152
const C5 = 63 / 2816

/**
 * Recursively computes arccos(1 - d) for d in (0, 1] using divide-and-conquer
 * half-angle reduction.
 *
 * From the half-angle identity cos(theta / 2) = sqrt((1 + cos(theta)) / 2)
 * with cos(theta) = 1 - d, the reduced complement is:
 *   d' = 1 - sqrt(1 - d / 2) = d / (2 * (1 + sqrt(1 - d / 2)))
 *
 * This rationalized recurrence avoids catastrophic cancellation near x = 1
 * (d -> 0) and shrinks d by roughly a factor of 4 at each recursive step,
 * terminating in O(log(1 / threshold)) depth.
 *
 * @param {number} d - Complement 1 - x in (0, 1].
 * @returns {number} arccos(1 - d) in radians.
 */
function arccosFromComplement(d) {
	if (d <= SMALL_COMPLEMENT_THRESHOLD) {
		// theta = 2 * arcsin(s), where s = sin(theta / 2) = sqrt(d / 2)
		const s2 = d * 0.5
		const s = Math.sqrt(s2)
		const poly = 1 + s2 * (C1 + s2 * (C2 + s2 * (C3 + s2 * (C4 + s2 * C5))))
		return 2 * s * poly
	}

	const nextD = d / (2 * (1 + Math.sqrt(1 - d * 0.5)))
	return 2 * arccosFromComplement(nextD)
}

/**
 * Computes the arccosine (inverse cosine) of an IEEE-754 float64 number
 * in the domain [-1, 1], returning an angle in radians in [0, pi].
 *
 * Uses a recursive divide-and-conquer half-angle reduction formulated in terms
 * of the complement d = 1 - |x| to maintain numerical stability near +/-1,
 * combined with the reflection identity arccos(x) = pi - arccos(-x) for x < 0.
 *
 * @param {number} x - Input value in [-1, 1] (or NaN).
 * @returns {number} Principal arccosine in [0, pi] radians, or NaN if x is NaN.
 * @throws {TypeError} If x is not a number.
 * @throws {RangeError} If x is outside the domain [-1, 1] (including +/-Infinity).
 */
export function arccosFloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, got ${typeof x}`)
	}

	if (Number.isNaN(x)) {
		return Number.NaN
	}

	if (x < -1 || x > 1) {
		throw new RangeError(`Input ${x} is out of domain [-1, 1]`)
	}

	if (x === 1) {
		return 0
	}

	if (x === -1) {
		return Math.PI
	}

	if (x === 0) {
		return HALF_PI
	}

	if (x < 0) {
		// arccos(x) = pi - arccos(-x), with complement d = 1 - (-x) = 1 + x
		return Math.PI - arccosFromComplement(1 + x)
	}

	return arccosFromComplement(1 - x)
}
