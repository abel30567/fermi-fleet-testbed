/**
 * Computes the discrete product of an array of IEEE-754 float64 numbers
 * using a recursive divide-and-conquer (pairwise) reduction.
 *
 * The multiplicative identity `1` is returned for an empty array.
 * Because the array is split in half at each step, recursion depth is
 * O(log n), avoiding call-stack overflow on large inputs while reducing
 * worst-case floating-point rounding error accumulation compared to linear
 * left-to-right multiplication.
 *
 * Standard IEEE-754 float64 arithmetic semantics apply for special values
 * (`NaN`, `Infinity`, `-Infinity`, `-0`, overflow, and underflow).
 *
 * @param {readonly number[]} values - Array of IEEE-754 float64 numbers to multiply.
 * @returns {number} The discrete product of all elements in `values`.
 * @throws {TypeError} If `values` is not an Array or contains any non-number element (including sparse holes).
 */
export function productFloatRecursive(values) {
	if (!Array.isArray(values)) {
		throw new TypeError('Expected values to be an array of numbers')
	}

	const len = values.length
	for (let i = 0; i < len; i++) {
		if (typeof values[i] !== 'number') {
			throw new TypeError(
				`Expected number at index ${i}, received ${values[i] === null ? 'null' : typeof values[i]}`
			)
		}
	}

	if (len === 0) {
		return 1
	}

	return multiplyRange(values, 0, len)
}

/**
 * Recursively multiplies `values[start..end)` using divide-and-conquer.
 *
 * @param {readonly number[]} values - Validated array of float64 numbers.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index (must be strictly greater than `start`).
 * @returns {number} Product of the slice `values[start..end)`.
 */
function multiplyRange(values, start, end) {
	const count = end - start
	if (count === 1) {
		return values[start]
	}

	const mid = start + (count >>> 1)
	return multiplyRange(values, start, mid) * multiplyRange(values, mid, end)
}
