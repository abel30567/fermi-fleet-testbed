/**
 * Recursively computes the exact dot product of `a[lo..hi)` and `b[lo..hi)`
 * using binary divide-and-conquer.
 *
 * @param {readonly bigint[]} a - First vector of BigInt integers.
 * @param {readonly bigint[]} b - Second vector of BigInt integers.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {bigint} Exact sum of `a[i] * b[i]` for `lo <= i < hi`.
 * @throws {TypeError} If any element in the slice is not a `bigint`.
 */
function dotRange(a, b, lo, hi) {
	const len = hi - lo
	if (len === 0) {
		return 0n
	}
	if (len === 1) {
		const ai = a[lo]
		const bi = b[lo]
		if (typeof ai !== 'bigint') {
			throw new TypeError(
				`Expected bigint at index ${lo} of first vector, got ${typeof ai}`
			)
		}
		if (typeof bi !== 'bigint') {
			throw new TypeError(
				`Expected bigint at index ${lo} of second vector, got ${typeof bi}`
			)
		}
		return ai * bi
	}

	const mid = lo + Math.floor(len / 2)
	return dotRange(a, b, lo, mid) + dotRange(a, b, mid, hi)
}

/**
 * Computes the exact dot product of two equal-length `BigInt` vectors using a
 * recursive binary divide-and-conquer algorithm.
 *
 * Because the dot product of integer vectors is always an exact integer, no
 * fixed-point scaling is applied; the returned `bigint` is the exact sum
 * `sum_{i=0}^{n-1} a[i] * b[i]`. For empty vectors `([], [])`, returns `0n`
 * (the empty sum identity).
 *
 * Algorithm:
 * Splits the index interval `[lo, hi)` at its midpoint into `[lo, mid)` and
 * `[mid, hi)` recursively without copying subarrays, combining partial sums in
 * a balanced binary tree. Stack depth is `O(log n)` (preventing stack overflow
 * on large vectors) and auxiliary heap allocation is `O(1)`.
 *
 * @param {readonly bigint[]} a - First vector of `bigint` values.
 * @param {readonly bigint[]} b - Second vector of `bigint` values.
 * @returns {bigint} Exact `bigint` dot product of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element is not a `bigint`.
 * @throws {RangeError} If `a` and `b` have different lengths.
 */
export function dotProductBigIntRecursive(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError(`Expected first argument to be an Array, got ${typeof a}`)
	}
	if (!Array.isArray(b)) {
		throw new TypeError(`Expected second argument to be an Array, got ${typeof b}`)
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: expected equal lengths, got ${a.length} and ${b.length}`
		)
	}

	return dotRange(a, b, 0, a.length)
}
