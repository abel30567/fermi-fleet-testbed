/**
 * Recursively computes the Euclidean magnitude of a Float64Array slice [lo, hi)
 * using divide-and-conquer and Math.hypot for overflow/underflow safety.
 *
 * @param {Float64Array} v - Input vector.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {number} Euclidean norm of v[lo..hi).
 * @throws {RangeError} If any element in [lo, hi) is NaN or non-finite.
 */
function rangeMagnitude(v, lo, hi) {
	const len = hi - lo
	if (len === 0) {
		return 0
	}
	if (len === 1) {
		const value = v[lo]
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`Expected finite number at index ${lo}, got ${value}`
			)
		}
		return Math.abs(value)
	}
	const mid = lo + Math.floor(len / 2)
	const leftNorm = rangeMagnitude(v, lo, mid)
	const rightNorm = rangeMagnitude(v, mid, hi)
	return Math.hypot(leftNorm, rightNorm)
}

/**
 * Computes the Euclidean magnitude (L2 norm) of a Float64Array vector using
 * a divide-and-conquer recursive algorithm.
 *
 * Splits the index range [0, v.length) into halves recursively and combines
 * subproblem norms with `Math.hypot(leftNorm, rightNorm)` to avoid intermediate
 * floating-point overflow and underflow.
 *
 * @param {Float64Array} v - Input vector of finite double-precision floats.
 * @returns {number} Non-negative Euclidean magnitude of `v` (`0` for an empty vector).
 * @throws {TypeError} If `v` is not a `Float64Array`.
 * @throws {RangeError} If any element of `v` is `NaN`, `Infinity`, or `-Infinity`.
 */
export function magnitudeTypedRecursive(v) {
	if (!(v instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}
	return rangeMagnitude(v, 0, v.length)
}
