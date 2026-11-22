/**
 * Validates that a value is a multiset represented as a `Map` whose values
 * are all non-negative safe integers.
 *
 * @param {unknown} multiset - Candidate multiset to validate.
 * @param {string} name - Parameter name used in error messages.
 * @throws {TypeError} If `multiset` is not a `Map` or any count is not a number.
 * @throws {RangeError} If any count is negative or not a safe integer.
 */
function validateMultiset(multiset, name) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(`${name} must be a Map`)
	}
	for (const [key, count] of multiset) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`${name} count for key ${String(key)} must be a number`,
			)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`${name} count for key ${String(key)} must be a non-negative safe integer`,
			)
		}
	}
}

/**
 * Merges two disjoint `Map` instances into a new `Map` without mutating inputs.
 *
 * @template K
 * @param {Map<K, number>} left - Left half multiset.
 * @param {Map<K, number>} right - Right half multiset.
 * @returns {Map<K, number>} Combined multiset preserving left-then-right key order.
 */
function mergeDisjointMaps(left, right) {
	const merged = new Map(left)
	for (const [key, count] of right) {
		merged.set(key, count)
	}
	return merged
}

/**
 * Recursively computes the multiset complement over the slice `keys[start..end)`
 * using divide-and-conquer, splitting the key range in half and merging sub-maps.
 *
 * @template K
 * @param {K[]} keys - Array of keys from the universe multiset.
 * @param {number} start - Inclusive start index into `keys`.
 * @param {number} end - Exclusive end index into `keys`.
 * @param {Map<K, number>} a - Multiset to negate.
 * @param {Map<K, number>} universe - Universe multiset defining upper bounds.
 * @returns {Map<K, number>} Complement multiset for `keys[start..end)` with zero counts omitted.
 */
function complementRange(keys, start, end, a, universe) {
	if (start >= end) {
		return new Map()
	}
	if (end - start === 1) {
		const key = keys[start]
		const countU = universe.get(key)
		const countA = a.get(key) ?? 0
		const remaining = Math.max(0, countU - countA)
		const result = new Map()
		if (remaining > 0) {
			result.set(key, remaining)
		}
		return result
	}

	const mid = start + ((end - start) >>> 1)
	const left = complementRange(keys, start, mid, a, universe)
	const right = complementRange(keys, mid, end, a, universe)
	return mergeDisjointMaps(left, right)
}

/**
 * Computes the logical NOT (complement) of multiset `a` with respect to a
 * universe multiset `universe`, using a recursive divide-and-conquer algorithm
 * over the universe keys.
 *
 * For every key `x` in `universe`, the resulting count is
 * `Math.max(0, countU(x) - countA(x))`. Entries with count `0` are omitted,
 * and neither input `Map` is mutated.
 *
 * @template K
 * @param {Map<K, number>} a - Multiset whose complement is computed.
 * @param {Map<K, number>} universe - Universe multiset defining maximum counts.
 * @returns {Map<K, number>} New multiset containing the complement of `a` in `universe`.
 * @throws {TypeError} If `a` or `universe` is not a `Map`, or contains non-number counts.
 * @throws {RangeError} If any count in `a` or `universe` is negative or not a safe integer.
 */
export function notMultisetRecursive(a, universe) {
	validateMultiset(a, 'a')
	validateMultiset(universe, 'universe')

	const keys = Array.from(universe.keys())
	return complementRange(keys, 0, keys.length, a, universe)
}
