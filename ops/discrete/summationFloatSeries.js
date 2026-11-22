/**
 * Validates that an index bound is a finite safe integer.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
function validateBound(value, name) {
	if (typeof value !== 'number') {
		throw new TypeError(`${name} must be a number`);
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be a finite integer`);
	}
	if (!Number.isInteger(value)) {
		throw new RangeError(`${name} must be an integer`);
	}
	if (!Number.isSafeInteger(value)) {
		throw new RangeError(`${name} must be a safe integer`);
	}
	return value;
}

/**
 * Validates that a summand is a finite IEEE-754 float64 number.
 *
 * @param {unknown} value
 * @param {string} context
 * @returns {number}
 */
function validateTerm(value, context) {
	if (typeof value !== 'number') {
		throw new TypeError(`${context} must be a number`);
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`${context} must be a finite number`);
	}
	return value;
}

/**
 * Computes a discrete finite summation over IEEE-754 float64 numbers using
 * Kahan-Babuška-Neumaier (KBN) compensated summation to minimize floating-point
 * rounding error and catastrophic cancellation.
 *
 * Supports two call forms:
 * 1. Functional series form: `summationFloatSeries(termFn, start, end)`
 *    Evaluates `\sum_{k=start}^{end} termFn(k)` for safe integer bounds `start`
 *    and `end`. Returns `0` when `start > end` without invoking `termFn`.
 * 2. Array form: `summationFloatSeries(values)`
 *    Evaluates `\sum_{i=0}^{values.length - 1} values[i]` for an array of
 *    finite IEEE-754 float64 numbers. Returns `0` for an empty array.
 *
 * Algorithm (Neumaier, 1974):
 * Maintains a running `sum` and low-order error `compensation`. For each term `x`:
 * - `nextSum = sum + x`
 * - If `|sum| >= |x|`, `compensation += (sum - nextSum) + x`
 * - Otherwise, `compensation += (x - nextSum) + sum`
 * - `sum = nextSum`
 * Final result is `sum + compensation`, preserving accuracy even when a newly
 * added term is much larger in magnitude than the running sum.
 *
 * @param {((k: number) => number) | readonly number[]} termFnOrValues
 *   Either a term-generating function `termFn(k)` or an array of finite numbers.
 * @param {number} [start]
 *   Inclusive lower integer bound (required when `termFnOrValues` is a function;
 *   must be omitted when passing an array).
 * @param {number} [end]
 *   Inclusive upper integer bound (required when `termFnOrValues` is a function;
 *   must be omitted when passing an array).
 * @returns {number} The compensated IEEE-754 float64 sum.
 * @throws {TypeError} If `termFnOrValues` is neither a function nor an array,
 *   if extra arguments are passed with an array, if `start`/`end` are not
 *   numbers, or if any term/element is not a number.
 * @throws {RangeError} If `start`/`end` are non-finite, non-integer, or outside
 *   the safe integer range, if any term/element is non-finite (`NaN`, `±Infinity`),
 *   or if the accumulated sum overflows finite IEEE-754 float64 range.
 */
export function summationFloatSeries(termFnOrValues, start, end) {
	let sum = 0;
	let compensation = 0;

	if (Array.isArray(termFnOrValues)) {
		if (start !== undefined || end !== undefined) {
			throw new TypeError(
				'summationFloatSeries expects a single argument when summing an array',
			);
		}

		for (let i = 0; i < termFnOrValues.length; i += 1) {
			const x = validateTerm(termFnOrValues[i], `values[${i}]`);
			const nextSum = sum + x;
			if (!Number.isFinite(nextSum)) {
				throw new RangeError(
					'Summation overflowed finite IEEE-754 float64 range',
				);
			}
			if (Math.abs(sum) >= Math.abs(x)) {
				compensation += (sum - nextSum) + x;
			} else {
				compensation += (x - nextSum) + sum;
			}
			sum = nextSum;
		}
	} else if (typeof termFnOrValues === 'function') {
		const lower = validateBound(start, 'start');
		const upper = validateBound(end, 'end');

		if (lower > upper) {
			return 0;
		}

		for (let k = lower; ; k += 1) {
			const x = validateTerm(termFnOrValues(k), `termFn(${k})`);
			const nextSum = sum + x;
			if (!Number.isFinite(nextSum)) {
				throw new RangeError(
					'Summation overflowed finite IEEE-754 float64 range',
				);
			}
			if (Math.abs(sum) >= Math.abs(x)) {
				compensation += (sum - nextSum) + x;
			} else {
				compensation += (x - nextSum) + sum;
			}
			sum = nextSum;

			if (k === upper) {
				break;
			}
		}
	} else {
		throw new TypeError(
			'First argument must be a term function or an array of finite numbers',
		);
	}

	const total = sum + compensation;
	if (!Number.isFinite(total)) {
		throw new RangeError('Summation overflowed finite IEEE-754 float64 range');
	}
	return total === 0 ? 0 : total;
}
