/**
 * Recursively computes the natural logarithm of elements in a slice of a Float64Array
 * using divide-and-conquer binary splitting.
 *
 * @param {Float64Array} input - Source typed array of strictly positive finite numbers.
 * @param {Float64Array} output - Destination typed array of the same length as input.
 * @param {number} start - Inclusive start index of the current slice.
 * @param {number} end - Exclusive end index of the current slice.
 * @throws {RangeError} If any element in the slice is not a finite strictly positive number.
 */
function computeLnSlice(input, output, start, end) {
	if (start >= end) {
		return
	}

	if (end - start === 1) {
		const value = input[start]
		if (!Number.isFinite(value) || value <= 0) {
			throw new RangeError(
				`lnTypedRecursive: element at index ${start} must be a finite positive number (> 0), got ${value}`,
			)
		}
		output[start] = Math.log(value)
		return
	}

	const mid = start + ((end - start) >>> 1)
	computeLnSlice(input, output, start, mid)
	computeLnSlice(input, output, mid, end)
}

/**
 * Computes the element-wise natural logarithm (base e) of a Float64Array
 * using a recursive divide-and-conquer implementation.
 *
 * Does not mutate the input array; returns a new Float64Array of equal length.
 *
 * @param {Float64Array} input - Input Float64Array containing strictly positive finite values (> 0).
 * @returns {Float64Array} A new Float64Array where each element is `Math.log(input[i])`.
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element of `input` is `<= 0`, `NaN`, or non-finite (`±Infinity`).
 */
export function lnTypedRecursive(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError(
			`lnTypedRecursive: expected a Float64Array, got ${input === null ? 'null' : typeof input}`,
		)
	}

	const result = new Float64Array(input.length)
	computeLnSlice(input, result, 0, input.length)
	return result
}
