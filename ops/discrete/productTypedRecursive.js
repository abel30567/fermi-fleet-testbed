/**
 * Recursively computes the product of `values[start..end-1]` using
 * divide-and-conquer (balanced binary tree reduction).
 *
 * @param {Float64Array} values - Validated input array of finite numbers.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index (`end > start`).
 * @returns {number} Product of elements in the slice `[start, end)`.
 */
function productRange(values, start, end) {
	const count = end - start
	if (count === 1) {
		return values[start]
	}
	if (count === 2) {
		return values[start] * values[start + 1]
	}
	const mid = start + (count >>> 1)
	return productRange(values, start, mid) * productRange(values, mid, end)
}

/**
 * Computes the discrete product of all elements in a `Float64Array` using a
 * recursive divide-and-conquer implementation.
 *
 * The input range is recursively bisected until base cases of length 1 or 2 are
 * reached, bounding call-stack depth to `O(log n)`. Returns `1` (the
 * multiplicative identity) for an empty `Float64Array`, and normalizes `-0` to
 * `0`.
 *
 * @param {Float64Array} values - Input `Float64Array` of finite 64-bit floats.
 * @returns {number} The discrete product of all elements in `values`.
 * @throws {TypeError} If `values` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element of `values` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function productTypedRecursive(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('Expected values to be a Float64Array')
	}

	const len = values.length
	for (let i = 0; i < len; i++) {
		if (!Number.isFinite(values[i])) {
			throw new RangeError(
				`Expected all elements to be finite numbers; received ${values[i]} at index ${i}`
			)
		}
	}

	if (len === 0) {
		return 1
	}

	const result = productRange(values, 0, len)
	return result === 0 ? 0 : result
}
