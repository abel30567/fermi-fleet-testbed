/**
 * Half of pi (π / 2), the asymptotic limit of arctan(x) as x → +∞.
 */
const HALF_PI = Math.PI / 2

/**
 * Threshold below which argument halving stops and Gauss's continued fraction
 * is evaluated directly. At x ≤ 0.125, depth 8 achieves full IEEE-754 float64 precision.
 */
const REDUCTION_THRESHOLD = 0.125

/**
 * Threshold below which atan(x) === x in IEEE-754 float64 (since x^3 / 3 < ulp(x) / 2).
 */
const SMALL_X_THRESHOLD = 1e-8

/**
 * Maximum recursion depth for Gauss's continued fraction at the base case.
 */
const CF_MAX_DEPTH = 8

/**
 * Recursively evaluates the denominator of Gauss's continued fraction for arctan(x):
 *
 *   arctan(x) = x / (1 + (1x)^2 / (3 + (2x)^2 / (5 + (3x)^2 / (7 + ...))))
 *
 * @param {number} x2 - Precomputed x * x for 0 < x ≤ REDUCTION_THRESHOLD.
 * @param {number} depth - Current recursion level (starts at 0).
 * @param {number} maxDepth - Terminal recursion level.
 * @returns {number} Continued-fraction denominator from `depth` to `maxDepth`.
 */
function evalGaussContinuedFraction(x2, depth, maxDepth) {
	const odd = 2 * depth + 1
	if (depth >= maxDepth) {
		return odd
	}
	const next = depth + 1
	return odd + (next * next * x2) / evalGaussContinuedFraction(x2, next, maxDepth)
}

/**
 * Divide-and-conquer recursive arctan for positive inputs 0 < x ≤ 1.
 *
 * Repeatedly halves the angle via the half-angle identity:
 *   arctan(x) = 2 * arctan(x / (1 + sqrt(1 + x^2)))
 * until x ≤ REDUCTION_THRESHOLD, then evaluates the base case recursively
 * using Gauss's continued fraction.
 *
 * @param {number} x - Positive finite float64 in (0, 1].
 * @returns {number} arctan(x) in radians.
 */
function arctanUnitPositive(x) {
	if (x <= SMALL_X_THRESHOLD) {
		return x
	}
	if (x <= REDUCTION_THRESHOLD) {
		return x / evalGaussContinuedFraction(x * x, 0, CF_MAX_DEPTH)
	}
	const halved = x / (1 + Math.sqrt(1 + x * x))
	return 2 * arctanUnitPositive(halved)
}

/**
 * Computes the trigonometric arctangent (inverse tangent) of an IEEE-754 float64
 * number in radians, returning a value in [-π/2, π/2], using a recursive
 * divide-and-conquer algorithm (odd symmetry, reciprocal range reduction,
 * recursive half-angle reduction, and recursive Gauss continued fraction).
 *
 * @param {number} x - Input IEEE-754 float64 number.
 * @returns {number} The arctangent of `x` in radians, in [-π/2, π/2].
 * @throws {TypeError} If `x` is not a JavaScript number.
 */
export function arctanFloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, received ${typeof x}`)
	}
	if (Number.isNaN(x)) {
		return NaN
	}
	if (x === 0) {
		return x // Preserves IEEE-754 signed zero (+0 and -0).
	}
	if (x === Infinity) {
		return HALF_PI
	}
	if (x === -Infinity) {
		return -HALF_PI
	}
	if (x < 0) {
		return -arctanFloatRecursive(-x)
	}
	if (x > 1) {
		return HALF_PI - arctanUnitPositive(1 / x)
	}
	return arctanUnitPositive(x)
}
