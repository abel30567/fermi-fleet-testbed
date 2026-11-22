/**
 * Computes the discrete sum of an array of finite IEEE-754 float64 numbers
 * using recursive pairwise (divide-and-conquer) summation.
 *
 * Pairwise summation splits the input range at its midpoint recursively until
 * reaching base cases of length 0, 1, or 2, reducing accumulated floating-point
 * rounding error from O(n * eps) to O(log(n) * eps) with O(log n) stack depth
 * and zero intermediate array allocations.
 *
 * @param {number[]} values - Array of finite IEEE-754 float64 numbers to sum.
 * @returns {number} The sum of all elements in `values`, or `0` if empty.
 * @throws {TypeError} If `values` is not an Array, contains sparse holes, or contains non-number elements.
 * @throws {RangeError} If any element in `values` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
export function summationFloatRecursive(values) {
	if (!Array.isArray(values)) {
		throw new TypeError('values must be an Array of finite numbers')
	}

	const len = values.length
	for (let i = 0; i < len; i++) {
		if (!(i in values)) {
			throw new TypeError(`values[${i}] must not be an empty slot`)
		}
		const value = values[i]
		if (typeof value !== 'number') {
			throw new TypeError(`values[${i}] must be a number, got ${typeof value}`)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(`values[${i}] must be a finite number, got ${value}`)
		}
	}

	return sumRange(values, 0, len)
}

/**
 * Recursively sums `values[start .. end - 1]` by splitting at the midpoint.
 *
 * @param {number[]} values - Validated array of finite numbers.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {number} Partial sum over `[start, end)`.
 */
function sumRange(values, start, end) {
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
	return sumRange(values, start, mid) + sumRange(values, mid, end)
}
