/**
 * Performs element-wise subtraction (`a[i] - b[i]`) over two `Float64Array`
 * inputs using a divide-and-conquer recursive strategy that splits the index
 * range `[lo, hi)` into halves.
 *
 * @param {Float64Array} a - Minuend typed array.
 * @param {Float64Array} b - Subtrahend typed array.
 * @returns {Float64Array} A new `Float64Array` containing `a[i] - b[i]` for each index `i`.
 * @throws {TypeError} If either `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` have different lengths.
 */
export function subtractTypedRecursive(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Expected first argument to be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Expected second argument to be a Float64Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Float64Array length mismatch: got ${a.length} and ${b.length}`
		)
	}

	const result = new Float64Array(a.length)

	/**
	 * Recursively populates `result[lo..hi-1]` by splitting `[lo, hi)` in half.
	 *
	 * @param {number} lo - Inclusive lower index bound.
	 * @param {number} hi - Exclusive upper index bound.
	 */
	function subtractRange(lo, hi) {
		const len = hi - lo
		if (len <= 0) {
			return
		}
		if (len === 1) {
			result[lo] = a[lo] - b[lo]
			return
		}
		const mid = lo + Math.floor(len / 2)
		subtractRange(lo, mid)
		subtractRange(mid, hi)
	}

	subtractRange(0, a.length)
	return result
}
