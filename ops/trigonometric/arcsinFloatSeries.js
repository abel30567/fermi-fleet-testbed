/**
 * High-precision split of π / 2 into IEEE-754 float64 high and low components
 * such that PIO2_HI + PIO2_LO ≈ π / 2 to ~106 bits of precision.
 */
const PIO2_HI = 1.57079632679489655800e+00; // Math.PI / 2
const PIO2_LO = 6.12323399573676603587e-17; // (π / 2) - PIO2_HI

/**
 * Evaluates the tail of the Maclaurin series for arcsin(t) - t:
 *   sum_{k=1..∞} ((2k - 1)!! / (2k)!!) * t^(2k + 1) / (2k + 1)
 * for 0 < t <= 0.5, using Kahan compensated summation.
 *
 * Because t^2 <= 0.25, each successive term shrinks by at least a factor of 4
 * and all terms are strictly positive, converging to full IEEE-754 float64
 * precision in at most ~28 iterations without catastrophic cancellation.
 *
 * @param {number} t - Input in (0, 0.5].
 * @returns {number} The series tail arcsin(t) - t.
 */
function arcsinSeriesTail(t) {
	const t2 = t * t;
	let coeffPow = t;
	let sum = 0;
	let comp = 0;

	for (let k = 1; k <= 64; k++) {
		coeffPow *= ((2 * k - 1) / (2 * k)) * t2;
		const term = coeffPow / (2 * k + 1);

		// Kahan compensated summation for the tail
		const y = term - comp;
		const nextSum = sum + y;
		comp = (nextSum - sum) - y;
		sum = nextSum;

		if (term <= t * 1e-17 || term === 0) {
			break;
		}
	}

	return sum;
}

/**
 * Computes the trigonometric arcsine (inverse sine) of an IEEE-754 float64
 * number `x` in `[-1, 1]`, returning an angle in radians in `[-π/2, π/2]`.
 *
 * Uses a series and half-angle identity reduction without calling `Math.asin`:
 * - Odd symmetry reduces `x < 0` to `|x|` while preserving signed zero (`-0`).
 * - For `|x| <= 0.5`, evaluates the Maclaurin power series directly:
 *     `arcsin(x) = x + sum_{k=1..∞} ((2k-1)!! / (2k)!!) * x^(2k+1) / (2k+1)`.
 * - For `0.5 < |x| < 1`, applies the half-angle identity:
 *     `arcsin(x) = π/2 - 2 * arcsin(sqrt((1 - x) / 2))`,
 *   mapping the series argument into `(0, 0.5)` for rapid convergence and
 *   using a high/low split of `π/2` to preserve full float64 accuracy.
 *
 * @param {number} x - Finite IEEE-754 float64 number in the closed interval `[-1, 1]`.
 * @returns {number} Principal value of `arcsin(x)` in radians, in `[-π/2, π/2]`.
 * @throws {TypeError} If `x` is not a `number`.
 * @throws {RangeError} If `x` is `NaN`, non-finite, or outside `[-1, 1]`.
 */
export function arcsinFloatSeries(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected x to be a number, got ${typeof x}`);
	}
	if (!Number.isFinite(x)) {
		throw new RangeError(`Expected x to be a finite number in [-1, 1], got ${x}`);
	}
	if (x < -1 || x > 1) {
		throw new RangeError(`Expected x to be in [-1, 1], got ${x}`);
	}

	// Preserve signed zero (+0 -> +0, -0 -> -0)
	if (x === 0) {
		return x;
	}

	const negative = x < 0;
	const ax = negative ? -x : x;

	let result;
	if (ax === 1) {
		result = PIO2_HI;
	} else if (ax <= 0.5) {
		result = ax + arcsinSeriesTail(ax);
	} else {
		// Exact by Sterbenz's lemma since 0.5 < ax < 1
		const s = Math.sqrt((1 - ax) * 0.5);
		const tail = arcsinSeriesTail(s);
		result = (PIO2_HI - 2 * s) - (2 * tail - PIO2_LO);
	}

	return negative ? -result : result;
}
