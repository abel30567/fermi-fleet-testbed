/**
 * Validates that a multiset multiplicity is a non-negative safe integer.
 *
 * @param {unknown} count - Candidate multiplicity value.
 * @param {unknown} key - Associated multiset element key (for error reporting).
 * @param {string} paramName - Parameter name (`"a"` or `"b"`).
 * @throws {TypeError} If `count` is not a number or is `NaN`.
 * @throws {RangeError} If `count` is negative, non-integer, or not a safe integer.
 */
function validateCount(count, key, paramName) {
	if (typeof count !== 'number' || Number.isNaN(count)) {
		throw new TypeError(
			`Invalid count in multiset "${paramName}" for key ${String(key)}: expected a finite non-negative safe integer, got ${typeof count === 'number' ? 'NaN' : typeof count}`
		)
	}
	if (!Number.isSafeInteger(count) || count < 0) {
		throw new RangeError(
			`Invalid count in multiset "${paramName}" for key ${String(key)}: expected a non-negative safe integer, got ${count}`
		)
	}
}

/**
 * Recursively validates all `[key, count]` entries in a slice using divide-and-conquer.
 *
 * @param {Array<[any, unknown]>} entries - Array of map entries.
 * @param {number} low - Inclusive lower index.
 * @param {number} high - Exclusive upper index.
 * @param {string} paramName - Parameter name (`"a"` or `"b"`).
 */
function validateEntriesDivideAndConquer(entries, low, high, paramName) {
	if (low >= high) {
		return
	}
	if (high - low === 1) {
		const [key, count] = entries[low]
		validateCount(count, key, paramName)
		return
	}
	const mid = low + Math.floor((high - low) / 2)
	validateEntriesDivideAndConquer(entries, low, mid, paramName)
	validateEntriesDivideAndConquer(entries, mid, high, paramName)
}

/**
 * Recursively computes the multiset difference for `entries[low..high)` minus `subtrahend`
 * using divide-and-conquer and merges the disjoint sub-results in original key order.
 *
 * @template T
 * @param {Array<[T, number]>} entries - Validated entries from the minuend multiset.
 * @param {number} low - Inclusive lower index.
 * @param {number} high - Exclusive upper index.
 * @param {Map<T, number>} subtrahend - Validated subtrahend multiset.
 * @returns {Map<T, number>} Canonical multiset difference for this slice.
 */
function differenceDivideAndConquer(entries, low, high, subtrahend) {
	if (low >= high) {
		return new Map()
	}
	if (high - low === 1) {
		const [key, countA] = entries[low]
		const countB = subtrahend.get(key) ?? 0
		const remaining = countA - countB
		const result = new Map()
		if (remaining > 0) {
			result.set(key, remaining)
		}
		return result
	}

	const mid = low + Math.floor((high - low) / 2)
	const left = differenceDivideAndConquer(entries, low, mid, subtrahend)
	const right = differenceDivideAndConquer(entries, mid, high, subtrahend)

	for (const [key, count] of right) {
		left.set(key, count)
	}
	return left
}

/**
 * Computes the multiset (bag) difference `a \ b` over `Map<value, count>` using a
 * recursive divide-and-conquer strategy.
 *
 * For every element `x`, its multiplicity in the resulting multiset is
 * `max(0, countA(x) - countB(x))`. Only elements with a strictly positive resulting
 * multiplicity are included in the returned `Map`. Neither input `Map` is mutated,
 * and key insertion order from `a` is preserved.
 *
 * Recursion depth is `O(log n)` where `n = a.size` (and `O(log m)` for validating `b`).
 *
 * @template T
 * @param {Map<T, number>} a - Minuend multiset mapping elements to non-negative safe integer counts.
 * @param {Map<T, number>} b - Subtrahend multiset mapping elements to non-negative safe integer counts.
 * @returns {Map<T, number>} New canonical multiset containing elements with remaining count `> 0`.
 * @throws {TypeError} If `a` or `b` is not a `Map`, or any count is not a number / is `NaN`.
 * @throws {RangeError} If any count is negative, non-integer, infinite, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function setDifferenceMultisetRecursive(a, b) {
	if (!(a instanceof Map)) {
		throw new TypeError('First argument "a" must be a Map<value, count>')
	}
	if (!(b instanceof Map)) {
		throw new TypeError('Second argument "b" must be a Map<value, count>')
	}

	const entriesA = Array.from(a.entries())
	const entriesB = Array.from(b.entries())

	validateEntriesDivideAndConquer(entriesA, 0, entriesA.length, 'a')
	validateEntriesDivideAndConquer(entriesB, 0, entriesB.length, 'b')

	return differenceDivideAndConquer(entriesA, 0, entriesA.length, b)
}
