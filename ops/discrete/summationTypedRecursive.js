/**
 * Recursive divide-and-conquer helper performing pairwise summation over
 * the half-open index range `[start, end)` of a `Float64Array`.
 *
 * @param {Float64Array} values - Validated input array.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {number} Sum of elements in `[start, end)`.
 */
function pairwiseSum(values, start, end) {
	const length = end - start
	if (length === 0) {
		return 0
	}
	if (length === 1) {
		return values[start]
	}
	if (length === 2) {
		return values[start] + values[start + 1]
	}

	const mid = start + Math.floor(length / 2)
	return pairwiseSum(values, start, mid) + pairwiseSum(values, mid, end)
}

/**
 * Computes the discrete summation of all elements in a `Float64Array` using
 * recursive divide-and-conquer (pairwise) summation.
 *
 * Pairwise summation splits the input recursively into halves, giving
 * `O(n)` time complexity, `O(log n)` call-stack depth, and improved numerical
 * stability (`O(eps * log n)` worst-case rounding error vs. `O(eps * n)` for
 * naive left-to-right summation).
 *
 * @param {Float64Array} values - A `Float64Array` of finite numbers to sum.
 * @returns {number} The discrete sum of all elements in `values` (`0` for an empty array).
 * @throws {TypeError} If `values` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element in `values` is `NaN`, `Infinity`, or `-Infinity`.
 *
 * @example
 * const total = summationTypedRecursive(new Float64Array([1.5, 2.5, 3.0]))
 * // => 7
 */
export function summationTypedRecursive(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError(
			`Expected values to be a Float64Array, received ${values === null ? 'null' : typeof values}`
		)
	}

	for (let i = 0; i < values.length; i += 1) {
		if (!Number.isFinite(values[i])) {
			throw new RangeError(
				`Expected finite number at index ${i}, received ${values[i]}`
			)
		}
	}

	return pairwiseSum(values, 0, values.length)
}
