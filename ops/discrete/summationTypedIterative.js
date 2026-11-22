/**
 * Computes the discrete summation of all elements in a `Float64Array` using a
 * straightforward iterative accumulation loop:
 *
 *   sum(values) = sum_{i = 0}^{n - 1} values[i]
 *
 * By standard mathematical convention, the empty sum (when `values.length === 0`)
 * evaluates to `0`.
 *
 * Algorithm:
 *   Single linear pass (`for` loop) over the typed array, validating that each
 *   element is a finite IEEE-754 number before adding it to the accumulator.
 *   Time complexity: O(n). Extra space complexity: O(1).
 *
 * @param {Float64Array} values - Typed array of finite numeric terms to sum.
 * @returns {number} The discrete sum of all elements in `values` (`0` if empty).
 * @throws {TypeError} If `values` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element of `values` is `NaN`, `Infinity`, or `-Infinity`.
 */
export function summationTypedIterative(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('values must be a Float64Array')
	}

	let sum = 0
	for (let i = 0; i < values.length; i += 1) {
		const term = values[i]
		if (!Number.isFinite(term)) {
			throw new RangeError(
				`values[${i}] must be a finite number (received ${term})`
			)
		}
		sum += term
	}

	return sum
}
