/**
 * Computes the 1D discrete linear convolution of two finite IEEE-754 float64 sequences
 * using a recursive divide-and-conquer algorithm.
 *
 * For non-empty input arrays `a` (length n) and `b` (length m), the result `c` has
 * length `n + m - 1` where:
 *   c[k] = sum_{i + j = k} a[i] * b[j]
 *
 * If either input array is empty, an empty array `[]` is returned.
 *
 * Algorithm:
 * Recursively bisects the shorter sequence along index ranges without copying subarrays,
 * computes the two half-convolutions, and combines their overlapping regions via balanced
 * pairwise summation. This bounds recursion depth to O(log(min(n, m))), avoids subtraction-
 * induced catastrophic cancellation, and improves IEEE-754 summation accuracy compared to
 * sequential accumulation.
 *
 * @param {number[]} a - First input sequence of finite IEEE-754 float64 numbers.
 * @param {number[]} b - Second input sequence of finite IEEE-754 float64 numbers.
 * @returns {number[]} The discrete linear convolution of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an Array, is sparse, or contains non-number values.
 * @throws {RangeError} If `a` or `b` contains `NaN`, `Infinity`, or `-Infinity`.
 */
export function convolutionFloatRecursive(a, b) {
	validateFloatArray(a, 'a')
	validateFloatArray(b, 'b')

	if (a.length === 0 || b.length === 0) {
		return []
	}

	// Always divide along the shorter sequence to minimize recursion depth and call count.
	if (a.length <= b.length) {
		return convolveRange(a, 0, a.length, b)
	}
	return convolveRange(b, 0, b.length, a)
}

/**
 * Validates that the input is a dense Array of finite IEEE-754 float64 numbers.
 *
 * @param {unknown} arr
 * @param {string} name
 */
function validateFloatArray(arr, name) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`Expected "${name}" to be an Array of finite numbers`)
	}
	for (let i = 0; i < arr.length; i++) {
		if (!(i in arr)) {
			throw new TypeError(`Expected "${name}" to be a dense Array (hole at index ${i})`)
		}
		const value = arr[i]
		if (typeof value !== 'number') {
			throw new TypeError(`Expected "${name}[${i}]" to be a number, got ${typeof value}`)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(`Expected "${name}[${i}]" to be a finite float64 number, got ${value}`)
		}
	}
}

/**
 * Recursively computes the convolution of `a[aStart .. aStart + aLen - 1]` with `b`.
 *
 * @param {number[]} a - Shorter sequence being bisected.
 * @param {number} aStart - Inclusive start index in `a`.
 * @param {number} aLen - Length of the active slice of `a` (>= 1).
 * @param {number[]} b - Second sequence (non-empty).
 * @returns {number[]} Convolution of the active slice of `a` with `b`.
 */
function convolveRange(a, aStart, aLen, b) {
	if (aLen === 1) {
		const scalar = a[aStart]
		const out = new Array(b.length)
		for (let j = 0; j < b.length; j++) {
			const prod = scalar * b[j]
			out[j] = prod === 0 ? 0 : prod
		}
		return out
	}

	const mid = aLen >>> 1
	const left = convolveRange(a, aStart, mid, b)
	const right = convolveRange(a, aStart + mid, aLen - mid, b)

	return combineShifted(left, right, mid)
}

/**
 * Combines `left` and `right` (shifted right by `offset`) via element-wise addition.
 *
 * @param {number[]} left
 * @param {number[]} right
 * @param {number} offset
 * @returns {number[]}
 */
function combineShifted(left, right, offset) {
	const totalLen = offset + right.length
	const out = new Array(totalLen)

	let i = 0
	for (; i < offset; i++) {
		out[i] = left[i]
	}
	for (; i < left.length; i++) {
		const sum = left[i] + right[i - offset]
		out[i] = sum === 0 ? 0 : sum
	}
	for (; i < totalLen; i++) {
		out[i] = right[i - offset]
	}

	return out
}
