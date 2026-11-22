/**
 * Computes the discrete product of an array of finite IEEE-754 float64 numbers
 * using a recursive divide-and-conquer (pairwise) multiplication strategy.
 *
 * The balanced binary recursion tree runs in O(n) time and O(log n) stack space
 * without allocating intermediate sub-arrays.
 *
 * @param {number[]} values - Array of finite IEEE-754 float64 numbers to multiply.
 * @returns {number} The product of all elements in `values`, or `1` for an empty array.
 * @throws {TypeError} If `values` is not an Array or contains any non-number element (including sparse holes).
 * @throws {RangeError} If any element in `values` is non-finite (`NaN`, `Infinity`, or `-Infinity`).
 */
export function productFloatRecursive(values) {
	if (!Array.isArray(values)) {
		throw new TypeError('values must be an array of finite numbers')
	}

	const length = values.length
	for (let i = 0; i < length; i += 1) {
		const value = values[i]
		if (typeof value !== 'number') {
			throw new TypeError(`values[${i}] must be a number`)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(`values[${i}] must be a finite number`)
		}
	}

	if (length === 0) {
		return 1
	}

	return multiplyRange(values, 0, length)
}

/**
 * Recursively multiplies elements in `values[start..end)` using divide-and-conquer.
 *
 * @param {number[]} values - Validated array of finite numbers.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index (must satisfy `end > start`).
 * @returns {number} Product of the slice `values[start..end)`.
 */
function multiplyRange(values, start, end) {
	const count = end - start
	if (count === 1) {
		return values[start]
	}
	if (count === 2) {
		return values[start] * values[start + 1]
	}
	const mid = start + (count >>> 1)
	return multiplyRange(values, start, mid) * multiplyRange(values, mid, end)
}
