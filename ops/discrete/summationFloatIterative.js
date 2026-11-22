/**
 * Computes the discrete finite summation
 * `sum_{k = start}^{end} termFn(k)` over IEEE-754 float64 `Number` values
 * using a straightforward iterative accumulator.
 *
 * Follows the standard empty-sum convention: when `start > end`, returns `0`
 * without invoking `termFn`.
 *
 * @param {number} start - Inclusive lower summation index (safe integer).
 * @param {number} end - Inclusive upper summation index (safe integer).
 * @param {(k: number) => number} [termFn=(k) => k] - Function mapping each integer index `k` to a finite IEEE-754 float64 term.
 * @returns {number} The iteratively accumulated finite float64 sum.
 * @throws {TypeError} If `start` or `end` is not a number, `termFn` is not a function, or `termFn(k)` returns a non-number.
 * @throws {RangeError} If `start` or `end` is not a safe integer, `termFn(k)` returns a non-finite number (`NaN`, `±Infinity`), or the running sum overflows finite float64 range.
 */
export function summationFloatIterative(start, end, termFn = (k) => k) {
	if (typeof start !== 'number') {
		throw new TypeError('start must be a number')
	}
	if (!Number.isSafeInteger(start)) {
		throw new RangeError('start must be a safe integer')
	}
	if (typeof end !== 'number') {
		throw new TypeError('end must be a number')
	}
	if (!Number.isSafeInteger(end)) {
		throw new RangeError('end must be a safe integer')
	}
	if (typeof termFn !== 'function') {
		throw new TypeError('termFn must be a function')
	}

	if (start > end) {
		return 0
	}

	let sum = 0
	for (let k = start; ; k += 1) {
		const term = termFn(k)
		if (typeof term !== 'number') {
			throw new TypeError(`termFn(${k}) must return a number`)
		}
		if (!Number.isFinite(term)) {
			throw new RangeError(`termFn(${k}) must return a finite number`)
		}
		sum += term
		if (!Number.isFinite(sum)) {
			throw new RangeError(`summation overflowed finite float64 range at k=${k}`)
		}
		if (k === end) {
			break
		}
	}

	return sum
}
