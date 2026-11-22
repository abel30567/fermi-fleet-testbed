/**
 * Recursively validates all elements in `v[lo..hi)` as finite IEEE-754 float64
 * numbers and returns the maximum absolute value in the slice.
 *
 * @param {number[] | Float64Array} v - Input vector.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {number} Maximum absolute value in `v[lo..hi)`.
 */
function validateAndMaxAbs(v, lo, hi) {
	if (hi - lo === 1) {
		const value = v[lo]
		if (typeof value !== 'number') {
			throw new TypeError(`Vector element at index ${lo} must be a number`)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(`Vector element at index ${lo} must be a finite number`)
		}
		return Math.abs(value)
	}

	const mid = lo + ((hi - lo) >>> 1)
	const leftMax = validateAndMaxAbs(v, lo, mid)
	const rightMax = validateAndMaxAbs(v, mid, hi)
	return leftMax >= rightMax ? leftMax : rightMax
}

/**
 * Recursively computes the pairwise sum of `(v[i] / scale)^2` over `v[lo..hi)`.
 * Divide-and-conquer pairwise summation maintains O(log n) call depth and
 * reduces floating-point accumulation error relative to naive left-to-right loops.
 *
 * @param {number[] | Float64Array} v - Validated input vector.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {number} scale - Positive maximum absolute component used for scaling.
 * @returns {number} Pairwise sum of squared scaled components.
 */
function sumScaledSquares(v, lo, hi, scale) {
	if (hi - lo === 1) {
		const scaled = v[lo] / scale
		return scaled * scaled
	}

	const mid = lo + ((hi - lo) >>> 1)
	return sumScaledSquares(v, lo, mid, scale) + sumScaledSquares(v, mid, hi, scale)
}

/**
 * Computes the Euclidean magnitude (L2 norm) of a vector of finite IEEE-754
 * float64 numbers using a divide-and-conquer recursive algorithm.
 *
 * Components are normalized by the recursively computed maximum absolute value
 * before squaring and pairwise-summing, preventing intermediate overflow and
 * underflow on extreme-magnitude vectors.
 *
 * @param {number[] | Float64Array} v - Input vector of finite numbers.
 * @returns {number} Non-negative Euclidean magnitude `||v||_2` (0 for an empty vector).
 * @throws {TypeError} If `v` is not an Array or Float64Array, or contains a non-number element.
 * @throws {RangeError} If `v` contains `NaN`, `Infinity`, or `-Infinity`.
 */
export function magnitudeFloatRecursive(v) {
	if (!Array.isArray(v) && !(v instanceof Float64Array)) {
		throw new TypeError('Input vector must be an Array or Float64Array')
	}

	const n = v.length
	if (n === 0) {
		return 0
	}

	const scale = validateAndMaxAbs(v, 0, n)
	if (scale === 0) {
		return 0
	}
	if (n === 1) {
		return scale
	}

	return scale * Math.sqrt(sumScaledSquares(v, 0, n, scale))
}
