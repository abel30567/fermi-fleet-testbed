/**
 * Recursively computes the element-wise sum of two IEEE-754 float64 vectors
 * over the half-open index range [start, end) using divide-and-conquer.
 *
 * @param {number[]} a - First input vector.
 * @param {number[]} b - Second input vector.
 * @param {number[]} out - Pre-allocated output vector.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {void}
 */
function addRange(a, b, out, start, end) {
	if (end - start === 1) {
		const va = a[start]
		const vb = b[start]
		if (typeof va !== 'number' || typeof vb !== 'number') {
			throw new TypeError(`Vector elements at index ${start} must be numbers`)
		}
		out[start] = va + vb
		return
	}

	const mid = start + ((end - start) >>> 1)
	addRange(a, b, out, start, mid)
	addRange(a, b, out, mid, end)
}

/**
 * Computes the element-wise sum of two vectors of IEEE-754 float64 numbers
 * using a divide-and-conquer recursive strategy.
 *
 * Splits the index range in half recursively (O(log n) call depth, O(n) time)
 * and returns a new array without mutating either input.
 *
 * @param {number[]} a - First vector of IEEE-754 float64 numbers.
 * @param {number[]} b - Second vector of IEEE-754 float64 numbers (must match `a.length`).
 * @returns {number[]} New vector where each element `i` equals `a[i] + b[i]`.
 * @throws {TypeError} If either input is not an Array or any element is not a number.
 * @throws {RangeError} If the input vectors do not have the same length.
 */
export function vectorAddFloatRecursive(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) {
		throw new TypeError('Both inputs must be arrays of numbers')
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector length mismatch: ${a.length} !== ${b.length}`)
	}
	if (a.length === 0) {
		return []
	}

	const result = new Array(a.length)
	addRange(a, b, result, 0, a.length)
	return result
}
