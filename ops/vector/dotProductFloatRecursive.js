/**
 * Validates that a vector element is a finite IEEE-754 float64 Number.
 *
 * @param {unknown} value - Element value to validate.
 * @param {string} name - Parameter name for error reporting.
 * @param {number} index - Element index for error reporting.
 * @throws {TypeError} If the element is not a number.
 * @throws {RangeError} If the element is NaN or infinite.
 */
function validateFloat64(value, name, index) {
	if (typeof value !== 'number') {
		throw new TypeError(
			`Expected ${name}[${index}] to be a number, got ${typeof value}`,
		)
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(
			`Expected ${name}[${index}] to be a finite number, got ${value}`,
		)
	}
}

/**
 * Recursively computes the dot product over the half-open index range [lo, hi)
 * using divide-and-conquer pairwise summation.
 *
 * Splitting at the midpoint limits recursion depth to O(log n) and yields
 * pairwise-summation numerical accuracy O(epsilon * log n).
 *
 * @param {number[]} a - First vector.
 * @param {number[]} b - Second vector.
 * @param {number} lo - Inclusive lower index bound.
 * @param {number} hi - Exclusive upper index bound.
 * @returns {number} Partial dot product over [lo, hi).
 */
function dotRange(a, b, lo, hi) {
	const count = hi - lo
	if (count === 0) {
		return 0
	}
	if (count === 1) {
		const ai = a[lo]
		const bi = b[lo]
		validateFloat64(ai, 'a', lo)
		validateFloat64(bi, 'b', lo)
		return ai * bi
	}
	const mid = lo + Math.floor(count / 2)
	return dotRange(a, b, lo, mid) + dotRange(a, b, mid, hi)
}

/**
 * Computes the dot product of two vectors of IEEE-754 float64 numbers using a
 * recursive divide-and-conquer (pairwise summation) algorithm.
 *
 * @param {number[]} a - First input vector of finite numbers.
 * @param {number[]} b - Second input vector of finite numbers (same length as `a`).
 * @returns {number} The scalar dot product `sum(a[i] * b[i])`. Returns `0` for empty vectors.
 * @throws {TypeError} If `a` or `b` is not an Array, or contains a non-number element.
 * @throws {RangeError} If `a` and `b` have different lengths, or contain `NaN`/`±Infinity`.
 */
export function dotProductFloatRecursive(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError(`Expected 'a' to be an Array, got ${typeof a}`)
	}
	if (!Array.isArray(b)) {
		throw new TypeError(`Expected 'b' to be an Array, got ${typeof b}`)
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`,
		)
	}
	return dotRange(a, b, 0, a.length)
}
