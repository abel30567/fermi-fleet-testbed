/**
 * Computes the arcsine (inverse sine) of an IEEE-754 float64 number in radians
 * using a recursive divide-and-conquer half-angle reduction paired with a
 * recursive Maclaurin series base case.
 *
 * Domain: `x ∈ [-1, 1]` (or `NaN`, which propagates as `NaN`).
 * Range: `[-π/2, π/2]`.
 *
 * Algorithm:
 * 1. Symmetry reduction: `arcsin(-x) = -arcsin(x)` (preserving signed zero).
 * 2. Complementary reduction for `x > 0.5`:
 *    `arcsin(x) = π/2 - 2 * arcsin(sqrt((1 - x) / 2))`,
 *    which avoids precision loss near `x = 1` and maps `(0.5, 1)` into `(0, 0.5)`.
 * 3. Recursive half-angle divide-and-conquer for `0 < x <= 0.5`:
 *    `arcsin(x) = 2 * arcsin(x / sqrt(2 * (1 + sqrt((1 - x) * (1 + x)))))`,
 *    using the cancellation-free rationalized half-angle identity until
 *    `x <= 2^-7`.
 * 4. Recursive Maclaurin series base case (summed on unwind from smallest
 *    term to largest for numerical accuracy):
 *    `arcsin(x) = sum_{k>=0} ((2k)! / (4^k (k!)^2 (2k + 1))) * x^(2k + 1)`.
 *
 * @param {number} x - Input value in `[-1, 1]`, or `NaN`.
 * @returns {number} The arcsine of `x` in radians within `[-π/2, π/2]`, or `NaN` if `x` is `NaN`.
 * @throws {TypeError} If `x` is not a JavaScript `number`.
 * @throws {RangeError} If `x` is outside the real domain `[-1, 1]` (including `±Infinity`).
 */

const HALF_PI = Math.PI / 2;
const REDUCTION_THRESHOLD = 1 / 128; // 2^-7, exact in IEEE-754 float64
const MAX_REDUCTION_DEPTH = 64;
const MAX_SERIES_TERMS = 12;

/**
 * Recursively evaluates the Maclaurin series for arcsin(x) for small non-negative x,
 * summing from the smallest term back up on stack unwind to preserve precision.
 *
 * @param {number} x2 - Precomputed x * x.
 * @param {number} numerTerm - Current numerator coefficient * x^(2k + 1).
 * @param {number} k - Current series index (starting at 0).
 * @param {number} stopTolerance - Magnitude threshold below which recursion terminates.
 * @returns {number} Series approximation of arcsin(x).
 */
function arcsinSeriesRecursive(x2, numerTerm, k, stopTolerance) {
	const term = numerTerm / (2 * k + 1);
	if (term === 0 || term <= stopTolerance || k >= MAX_SERIES_TERMS) {
		return term;
	}
	const nextK = k + 1;
	const nextNumerTerm = numerTerm * ((2 * nextK - 1) / (2 * nextK)) * x2;
	return arcsinSeriesRecursive(x2, nextNumerTerm, nextK, stopTolerance) + term;
}

/**
 * Recursively halves the target angle via the cancellation-free half-angle identity
 * until `x <= REDUCTION_THRESHOLD`, then evaluates the base-case series.
 *
 * @param {number} x - Value in `[0, 0.5]`.
 * @param {number} depth - Current recursion depth.
 * @returns {number} arcsin(x) in radians.
 */
function reduceHalfAngleRecursive(x, depth) {
	if (x <= REDUCTION_THRESHOLD || depth >= MAX_REDUCTION_DEPTH) {
		return arcsinSeriesRecursive(x * x, x, 0, x * Number.EPSILON * 0.25);
	}
	const cosTheta = Math.sqrt((1 - x) * (1 + x));
	const halfSin = x / Math.sqrt(2 * (1 + cosTheta));
	return 2 * reduceHalfAngleRecursive(halfSin, depth + 1);
}

/**
 * Computes arcsin(x) for strictly positive `x ∈ (0, 1)`.
 *
 * @param {number} x - Value in `(0, 1)`.
 * @returns {number} arcsin(x) in radians.
 */
function arcsinPositiveRecursive(x) {
	if (x > 0.5) {
		const reduced = Math.sqrt((1 - x) / 2);
		return HALF_PI - 2 * reduceHalfAngleRecursive(reduced, 0);
	}
	return reduceHalfAngleRecursive(x, 0);
}

export function arcsinFloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected x to be a number, got ${typeof x}`);
	}
	if (Number.isNaN(x)) {
		return Number.NaN;
	}
	if (x < -1 || x > 1) {
		throw new RangeError(`Expected x to be within [-1, 1], got ${x}`);
	}
	if (x === 0) {
		return x; // Preserves +0 and -0
	}
	if (x === 1) {
		return HALF_PI;
	}
	if (x === -1) {
		return -HALF_PI;
	}
	if (x < 0) {
		return -arcsinPositiveRecursive(-x);
	}
	return arcsinPositiveRecursive(x);
}
