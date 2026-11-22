/**
 * Computes the element-wise factorial of a Float64Array of non-negative integers
 * using a straightforward iterative multiplication loop.
 *
 * Algorithm:
 * For each element `n = values[i]`:
 *   - Validates that `n` is a finite, non-negative integer.
 *   - Initializes `acc = 1` and multiplies `acc *= k` for `k = 2 .. n`.
 *   - Stops early if `acc` overflows IEEE-754 double precision to `Infinity`
 *     (which occurs for all integers `n > 170`).
 *
 * The input array is never mutated; a new Float64Array of the same length is returned.
 *
 * @param {Float64Array} values - Input typed array of non-negative integers.
 * @returns {Float64Array} New Float64Array where `result[i] = values[i]!` (or `Infinity` for `values[i] > 170`).
 * @throws {TypeError} If `values` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element is `NaN`, non-finite (`Infinity`, `-Infinity`), negative, or non-integer.
 */
export function factorialTypedIterative(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('Expected values to be a Float64Array');
	}

	const len = values.length;
	const result = new Float64Array(len);

	for (let i = 0; i < len; i++) {
		const n = values[i];

		if (!Number.isFinite(n)) {
			throw new RangeError(`Element at index ${i} must be a finite non-negative integer, received ${n}`);
		}
		if (n < 0) {
			throw new RangeError(`Element at index ${i} must be non-negative, received ${n}`);
		}
		if (!Number.isInteger(n)) {
			throw new RangeError(`Element at index ${i} must be an integer, received ${n}`);
		}

		let acc = 1;
		for (let k = 2; k <= n; k++) {
			acc *= k;
			if (acc === Infinity) {
				break;
			}
		}
		result[i] = acc;
	}

	return result;
}
