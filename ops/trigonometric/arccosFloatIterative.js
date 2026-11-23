const PI_HI = Math.PI;
const PI_LO = 1.2246467991473532e-16;
const HALF_PI_HI = Math.PI / 2;
const HALF_PI_LO = 6.123233995736766e-17;
const MAX_ITERATIONS = 64;

/**
 * Evaluates arcsin(u) for |u| <= 0.5 via its iterative Maclaurin series
 * with compensated (Kahan) summation:
 *   arcsin(u) = sum_{k=0}^{inf} [(2k)! / (4^k (k!)^2 (2k + 1))] * u^(2k + 1)
 *
 * Since |u| <= 0.5, u^2 <= 0.25 and each successive term shrinks by more than
 * a factor of 4, converging to full IEEE-754 float64 precision in <= 30 steps.
 *
 * @param {number} u - Input value with |u| <= 0.5.
 * @returns {number} Approximation of arcsin(u) in radians.
 */
function arcsinSeriesIterative(u) {
	if (u === 0) {
		return 0;
	}

	const u2 = u * u;
	let sum = u;
	let comp = 0;
	let coeff = u;

	for (let k = 1; k <= MAX_ITERATIONS; k++) {
		coeff = (coeff * (2 * k - 1) * u2) / (2 * k);
		const term = coeff / (2 * k + 1);

		const y = term - comp;
		const nextSum = sum + y;
		comp = nextSum - sum - y;

		if (nextSum === sum && Math.abs(term) <= Math.abs(sum) * Number.EPSILON * 0.25) {
			break;
		}
		sum = nextSum;
	}

	return sum;
}

/**
 * Computes the arccosine (inverse cosine) of an IEEE-754 float64 number `x`
 * using a straightforward iterative Maclaurin series with half-angle range
 * reduction.
 *
 * Range reduction partitions the domain `[-1, 1]` into three regions so that
 * the iterative series is always evaluated on `|u| <= 0.5` and cancellation
 * near `x = ±1` is avoided:
 * - For `|x| <= 0.5`:  `arccos(x) = pi/2 - arcsin(x)`
 * - For `x > 0.5`:     `arccos(x) = 2 * arcsin(sqrt((1 - x) / 2))`
 * - For `x < -0.5`:    `arccos(x) = pi - 2 * arcsin(sqrt((1 + x) / 2))`
 *
 * Follows IEEE-754 semantics for out-of-domain and special float64 inputs:
 * returns `NaN` when `x` is `NaN`, `±Infinity`, or `|x| > 1`, and returns
 * `+0` for `x === 1`.
 *
 * @param {number} x - Primitive IEEE-754 float64 number in `[-1, 1]`.
 * @returns {number} The principal value of `arccos(x)` in radians in `[0, pi]`,
 *   or `NaN` if `x` is `NaN` or outside `[-1, 1]`.
 * @throws {TypeError} If `x` is not a primitive `number`.
 */
export function arccosFloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`arccosFloatIterative expected a number, got ${x === null ? 'null' : typeof x}`);
	}

	if (Number.isNaN(x) || x < -1 || x > 1) {
		return Number.NaN;
	}

	if (x === 1) {
		return 0;
	}

	if (x === -1) {
		return PI_HI;
	}

	if (x === 0) {
		return HALF_PI_HI;
	}

	if (x > 0.5) {
		const u = Math.sqrt((1 - x) * 0.5);
		return 2 * arcsinSeriesIterative(u);
	}

	if (x < -0.5) {
		const u = Math.sqrt((1 + x) * 0.5);
		const reduced = 2 * arcsinSeriesIterative(u);
		return PI_HI - (reduced - PI_LO);
	}

	const s = arcsinSeriesIterative(x);
	return HALF_PI_HI - (s - HALF_PI_LO);
}
