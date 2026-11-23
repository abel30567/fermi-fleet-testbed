/**
 * Computes the element-wise base-2 logarithm of a {@link Float64Array} using a
 * recursive divide-and-conquer traversal.
 *
 * The input array is not mutated; a new {@link Float64Array} of the same length
 * is returned. Because each recursive split halves the range, call-stack depth
 * is bounded by `O(log n)`.
 *
 * @param {Float64Array} input - A Float64Array whose elements are all finite positive numbers (`x > 0`).
 * @returns {Float64Array} A new Float64Array where `result[i] = Math.log2(input[i])`.
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element in `input` is not a finite positive number (`<= 0`, `NaN`, or `±Infinity`).
 */
export function log2TypedRecursive(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	const length = input.length
	const output = new Float64Array(length)

	if (length === 0) {
		return output
	}

	computeRange(input, output, 0, length)
	return output
}

/**
 * Recursively computes `Math.log2` for elements in `[start, end)` via
 * divide-and-conquer.
 *
 * @param {Float64Array} input
 * @param {Float64Array} output
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index (`end > start`).
 */
function computeRange(input, output, start, end) {
	if (end - start === 1) {
		const value = input[start]
		if (!Number.isFinite(value) || value <= 0) {
			throw new RangeError(
				`Invalid element at index ${start}: expected a finite positive number, got ${value}`
			)
		}
		output[start] = Math.log2(value)
		return
	}

	const mid = start + ((end - start) >>> 1)
	computeRange(input, output, start, mid)
	computeRange(input, output, mid, end)
}
