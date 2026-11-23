/**
 * Computes the definite numerical integral of a uniformly sampled series
 * stored in a Float64Array using closed-form Newton-Cotes quadrature rules.
 *
 * Quadrature strategy for `m = values.length - 1` subintervals of width `step`:
 * - `values.length <= 1`: returns `0`.
 * - `m === 1` (2 samples): trapezoidal rule `(step / 2) * (y0 + y1)`.
 * - `m >= 2` and `m` even: composite Simpson's 1/3 rule over all `m` intervals.
 * - `m >= 3` and `m` odd: composite Simpson's 1/3 rule over the first `m - 3`
 *   intervals combined with Simpson's 3/8 rule over the final 3 intervals.
 *
 * Both Simpson rules are exact for polynomials up to degree 3 and achieve
 * O(step^4) global accuracy on smooth functions.
 *
 * @param {Float64Array} values - Uniformly spaced function samples.
 * @param {number} [step=1] - Positive finite spacing between consecutive samples.
 * @returns {number} Approximate definite integral over the sampled domain.
 * @throws {TypeError} If `values` is not a Float64Array or `step` is not a number.
 * @throws {RangeError} If `step` is not a positive finite number.
 */
export function integralTypedSeries(values, step = 1) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('values must be a Float64Array');
	}
	if (typeof step !== 'number') {
		throw new TypeError('step must be a number');
	}
	if (!Number.isFinite(step) || step <= 0) {
		throw new RangeError('step must be a positive finite number');
	}

	const n = values.length;
	if (n <= 1) {
		return 0;
	}

	const intervals = n - 1;
	if (intervals === 1) {
		const result = (step / 2) * (values[0] + values[1]);
		return result === 0 ? 0 : result;
	}

	let total = 0;
	const simpson13Limit = intervals % 2 === 0 ? intervals : intervals - 3;

	if (simpson13Limit >= 2) {
		let oddSum = 0;
		let evenSum = 0;
		for (let i = 1; i < simpson13Limit; i += 2) {
			oddSum += values[i];
		}
		for (let i = 2; i < simpson13Limit; i += 2) {
			evenSum += values[i];
		}
		total +=
			(step / 3) *
			(values[0] + values[simpson13Limit] + 4 * oddSum + 2 * evenSum);
	}

	if (intervals % 2 === 1) {
		const k = simpson13Limit;
		total +=
			((3 * step) / 8) *
			(values[k] + 3 * values[k + 1] + 3 * values[k + 2] + values[k + 3]);
	}

	return total === 0 ? 0 : total;
}
