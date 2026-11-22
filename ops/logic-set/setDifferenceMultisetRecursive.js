/**
 * Validates that a multiset count is a non-negative safe integer.
 *
 * @param {unknown} count - Candidate multiplicity value.
 * @param {string} paramName - Name of the parameter being validated.
 * @throws {TypeError} If count is not a number.
 * @throws {RangeError} If count is not a finite non-negative safe integer.
 */
function assertValidCount(count, paramName) {
	if (typeof count !== 'number') {
		throw new TypeError(
			`Expected numeric count in multiset "${paramName}", received ${typeof count}`
		)
	}
	if (!Number.isFinite(count) || !Number.isInteger(count) || !Number.isSafeInteger(count) || count < 0) {
		throw new RangeError(
			`Expected non-negative safe integer count in multiset "${paramName}", received ${count}`
		)
	}
}

/**
 * Recursively validates all entries in a slice [lo, hi) using divide-and-conquer.
 *
 * @template T
 * @param {Array<[T, number]>} entries - Array of [value, count] pairs.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {string} paramName - Name of the parameter being validated.
 */
function validateEntriesRange(entries, lo, hi, paramName) {
	if (lo >= hi) {
		return
	}
	if (hi - lo === 1) {
		assertValidCount(entries[lo][1], paramName)
		return
	}
	const mid = lo + ((hi - lo) >> 1)
	validateEntriesRange(entries, lo, mid, paramName)
	validateEntriesRange(entries, mid, hi, paramName)
}

/**
 * Merges two disjoint multiset result Maps in-place into the left Map,
 * preserving entry order from the original minuend.
 *
 * @template T
 * @param {Map<T, number>} left - Left sub-result Map.
 * @param {Map<T, number>} right - Right sub-result Map.
 * @returns {Map<T, number>} Merged Map containing entries from both halves.
 */
function mergeDisjointMaps(left, right) {
	for (const [key, count] of right) {
		left.set(key, count)
	}
	return left
}

/**
 * Recursively computes the multiset difference over entries[lo..hi) against subtrahend b
 * by splitting the entry range in half and merging sub-results.
 *
 * @template T
 * @param {Array<[T, number]>} entriesA - Entries of minuend multiset a.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {Map<T, number>} b - Subtrahend multiset.
 * @returns {Map<T, number>} Difference multiset for the slice [lo, hi).
 */
function diffEntriesRange(entriesA, lo, hi, b) {
	if (lo >= hi) {
		return new Map()
	}
	if (hi - lo === 1) {
		const [key, countA] = entriesA[lo]
		assertValidCount(countA, 'a')

		const countB = b.has(key) ? b.get(key) : 0
		const remaining = Math.max(0, countA - countB)

		const result = new Map()
		if (remaining > 0) {
			result.set(key, remaining)
		}
		return result
	}

	const mid = lo + ((hi - lo) >> 1)
	const left = diffEntriesRange(entriesA, lo, mid, b)
	const right = diffEntriesRange(entriesA, mid, hi, b)
	return mergeDisjointMaps(left, right)
}

/**
 * Computes the multiset difference `a \ b` over multisets represented as `Map<value, count>`,
 * using a recursive divide-and-conquer strategy.
 *
 * For each element `x` in `a`, the resulting multiplicity is `max(0, count_a(x) - count_b(x))`.
 * Elements whose resulting count is `0` are omitted from the returned Map.
 * Neither input Map is mutated.
 *
 * @template T
 * @param {Map<T, number>} a - Minuend multiset mapping values to non-negative safe integer counts.
 * @param {Map<T, number>} b - Subtrahend multiset mapping values to non-negative safe integer counts.
 * @returns {Map<T, number>} A new Map representing the multiset difference `a \ b` with positive counts only.
 * @throws {TypeError} If `a` or `b` is not a Map, or if any count is not a number.
 * @throws {RangeError} If any count in `a` or `b` is negative, non-integer, non-finite, or unsafe.
 */
export function setDifferenceMultisetRecursive(a, b) {
	if (!(a instanceof Map)) {
		throw new TypeError('Expected first argument "a" to be a Map')
	}
	if (!(b instanceof Map)) {
		throw new TypeError('Expected second argument "b" to be a Map')
	}

	const entriesB = Array.from(b.entries())
	validateEntriesRange(entriesB, 0, entriesB.length, 'b')

	const entriesA = Array.from(a.entries())
	return diffEntriesRange(entriesA, 0, entriesA.length, b)
}
