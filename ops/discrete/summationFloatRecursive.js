/**
 * Computes the discrete summation of a sequence of IEEE-754 float64 numbers
 * using a recursive divide-and-conquer (pairwise summation) algorithm.
 *
 * Pairwise summation splits the input range recursively into two halves and
 * sums the partial results, achieving O(n) time, O(log n) stack depth, and
 * O(epsilon * log n) worst-case rounding error instead of naive summation's
 * O(epsilon * n).
 *
 * IEEE-754 special values (`NaN`, `Infinity`, `-Infinity`, `-0`) follow
 * standard float64 addition semantics. An empty sequence returns `+0`.
 *
 * @param {readonly number[] | Float64Array} values - Sequence of IEEE-754 float64 numbers to sum.
 * @returns {number} The discrete sum of all elements in `values`.
 * @throws {TypeError} If `values` is not an Array or Float64Array, or if any element is not a number (including sparse array holes).
 */
export function summationFloatRecursive(values) {
	const isFloat64Array = values instanceof Float64Array
	if (!Array.isArray(values) && !isFloat64Array) {
		throw new TypeError('values must be an Array or Float64Array of numbers')
	}

	const length = values.length
	if (!isFloat64Array) {
		for (let i = 0; i < length; i++) {
			if (!(i in values) || typeof values[i] !== 'number') {
				throw new TypeError(`values[${i}] must be a number`)
			}
		}
	}

	if (length === 0) {
		return 0
	}

	return sumRange(values, 0, length)
}

/**
 * Recursively sums `values[start..end)` via divide-and-conquer.
 *
 * @param {readonly number[] | Float64Array} values
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index (`end > start`).
 * @returns {number}
 */
function sumRange(values, start, end) {
	const count = end - start
	if (count === 1) {
		return values[start]
	}
	if (count === 2) {
		return values[start] + values[start + 1]
	}

	const mid = start + Math.floor(count / 2)
	return sumRange(values, start, mid) + sumRange(values, mid, end)
}
