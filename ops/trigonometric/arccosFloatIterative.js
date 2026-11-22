/**
 * Computes the inverse cosine (arccosine) of an IEEE-754 float64 number in radians,
 * returning a value in the interval `[0, Math.PI]`, using a straightforward iterative
 * Taylor series for `arcsin` combined with half-angle range reduction.
 *
 * Range reduction keeps the series argument within `|u| <= 0.5`, ensuring fast
 * convergence and full float64 precision across the entire domain `[-1, 1]`,
 * including values arbitrarily close to `±1`:
 * - For `x > 0.5`:  `arccos(x) = 2 * arcsin(sqrt((1 - x) / 2))`
 * - For `|x| <= 0.5`: `arccos(x) = pi / 2 - arcsin(x)`
 * - For `x < -0.5`: `arccos(x) = pi - 2 * arcsin(sqrt((1 + x) / 2))`
 *
 * @param {number} x - Input value in `[-1, 1]` (or `NaN`).
 * @returns {number} The arccosine of `x` in radians within `[0, Math.PI]`, or `NaN` if `x` is `NaN`.
 * @throws {TypeError} If `x` is not of type `'number'`.
 * @throws {RangeError} If `x < -1` or `x > 1` (including `Infinity` and `-Infinity`).
 */

const HALF_PI = Math.PI / 2
const MAX_ITERATIONS = 100

/**
 * Evaluates `arcsin(u)` for `|u| <= 0.5` via its iterative Maclaurin series:
 * `arcsin(u) = sum_{n=0}^{inf} ((2n)! / (4^n * (n!)^2 * (2n + 1))) * u^(2n + 1)`.
 *
 * @param {number} u - Reduced argument with `|u| <= 0.5`.
 * @returns {number} Approximation of `arcsin(u)` in radians.
 */
function arcsinSeries(u) {
	if (u === 0) {
		return 0
	}

	const u2 = u * u
	let coeff = u
	let sum = u

	for (let n = 1; n <= MAX_ITERATIONS; n++) {
		coeff *= ((2 * n - 1) / (2 * n)) * u2
		const term = coeff / (2 * n + 1)
		const nextSum = sum + term
		if (nextSum === sum) {
			break
		}
		sum = nextSum
	}

	return sum
}

/**
 * Computes the arccosine of `x` in radians using an iterative series implementation.
 *
 * @param {number} x - An IEEE-754 float64 number in `[-1, 1]` (or `NaN`).
 * @returns {number} Angle in radians in `[0, Math.PI]`, or `NaN` when `x` is `NaN`.
 * @throws {TypeError} If `x` is not a number.
 * @throws {RangeError} If `|x| > 1` (including `±Infinity`).
 */
export function arccosFloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, got ${typeof x}`)
	}

	if (Number.isNaN(x)) {
		return NaN
	}

	if (x < -1 || x > 1) {
		throw new RangeError(`Input out of domain [-1, 1]: ${x}`)
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

	if (x > 0.5) {
		const u = Math.sqrt((1 - x) / 2)
		return 2 * arcsinSeries(u)
	}

	if (x < -0.5) {
		const u = Math.sqrt((1 + x) / 2)
		return Math.PI - 2 * arcsinSeries(u)
	}

	return HALF_PI - arcsinSeries(x)
}
