/**
 * Recursively computes element-wise addition of two Float64Array vectors over
 * the half-open index range [lo, hi) using divide-and-conquer.
 *
 * @param {Float64Array} a - First input vector.
 * @param {Float64Array} b - Second input vector.
 * @param {Float64Array} out - Preallocated output vector.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @throws {RangeError} If any element in [lo, hi) is NaN or non-finite.
 */
function addRange(a, b, out, lo, hi) {
	if (hi - lo === 1) {
		const av = a[lo]
		const bv = b[lo]
		if (!Number.isFinite(av)) {
			throw new RangeError(
				`Expected finite number in first vector at index ${lo}, received ${av}`,
			)
		}
		if (!Number.isFinite(bv)) {
			throw new RangeError(
				`Expected finite number in second vector at index ${lo}, received ${bv}`,
			)
		}
		out[lo] = av + bv
		return
	}

	const mid = lo + Math.floor((hi - lo) / 2)
	addRange(a, b, out, lo, mid)
	addRange(a, b, out, mid, hi)
}

/**
 * Computes element-wise addition of two equal-length Float64Array vectors
 * using a divide-and-conquer recursive strategy.
 *
 * @param {Float64Array} a - First input vector of finite numbers.
 * @param {Float64Array} b - Second input vector of finite numbers.
 * @returns {Float64Array} A new Float64Array containing `a[i] + b[i]` for each index `i`.
 * @throws {TypeError} If either `a` or `b` is not a Float64Array.
 * @throws {RangeError} If `a` and `b` have different lengths or contain NaN or non-finite values.
 */
export function vectorAddTypedRecursive(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument must be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument must be a Float64Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector lengths must match: received ${a.length} and ${b.length}`,
		)
	}

	const out = new Float64Array(a.length)
	if (a.length > 0) {
		addRange(a, b, out, 0, a.length)
	}
	return out
}
