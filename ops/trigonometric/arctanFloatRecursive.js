const HALF_PI = Math.PI / 2

/**
 * Small-angle threshold for the recursive base case.
 * For 0 <= x <= 2^-8 (~0.00390625), the truncated degree-9 Maclaurin series
 * has relative truncation error <= x^10 / 11 / x = x^9 / 11 < 2e-23,
 * well below IEEE-754 float64 machine epsilon (~2.22e-16).
 */
const BASE_CASE_THRESHOLD = 1 / 256

/**
 * Recursively computes arctan(x) for 0 <= x <= 1 using half-angle reduction:
 *   arctan(x) = 2 * arctan(x / (1 + sqrt(1 + x^2)))
 *
 * Each recursive call shrinks x by strictly more than a factor of 2, reaching
 * BASE_CASE_THRESHOLD in at most 8 levels of recursion.
 *
 * @param {number} x - Non-negative finite float64 in [0, 1].
 * @returns {number} arctan(x) in radians.
 */
function arctanReduced(x) {
	if (x <= BASE_CASE_THRESHOLD) {
		const x2 = x * x
		// Horner form of x - x^3/3 + x^5/5 - x^7/7 + x^9/9, separated as x + x * poly
		// to preserve full 53-bit significand precision for small x.
		const poly = x2 * (-1 / 3 + x2 * (1 / 5 + x2 * (-1 / 7 + x2 / 9)))
		return x + x * poly
	}

	const halfAngleArg = x / (1 + Math.sqrt(1 + x * x))
	return 2 * arctanReduced(halfAngleArg)
}

/**
 * Computes the arctangent (inverse tangent) of an IEEE-754 float64 Number in
 * radians, returning a value in [-pi/2, pi/2], using a recursive
 * divide-and-conquer half-angle reduction algorithm.
 *
 * Reductions applied:
 * - Odd symmetry: arctan(-x) = -arctan(x)
 * - Reciprocal identity for |x| > 1: arctan(x) = pi/2 - arctan(1 / x)
 * - Recursive half-angle reduction for 0 < x <= 1:
 *   arctan(x) = 2 * arctan(x / (1 + sqrt(1 + x^2)))
 * - Small-angle base case (x <= 1/256): degree-9 Maclaurin polynomial
 *
 * Special IEEE-754 values follow standard semantics:
 * - arctanFloatRecursive(NaN) -> NaN
 * - arctanFloatRecursive(+0) -> +0, arctanFloatRecursive(-0) -> -0
 * - arctanFloatRecursive(+Infinity) -> +pi/2
 * - arctanFloatRecursive(-Infinity) -> -pi/2
 *
 * @param {number} x - Input value as a JavaScript primitive number (IEEE-754 float64).
 * @returns {number} The arctangent of x in radians within [-pi/2, pi/2].
 * @throws {TypeError} If x is not a primitive number.
 */
export function arctanFloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected x to be a number, received ${x === null ? 'null' : typeof x}`)
	}

	if (Number.isNaN(x)) {
		return NaN
	}

	if (x === 0) {
		// Preserves signed zero (+0 -> +0, -0 -> -0)
		return x
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
		return HALF_PI - arctanReduced(1 / x)
	}

	return arctanReduced(x)
}
