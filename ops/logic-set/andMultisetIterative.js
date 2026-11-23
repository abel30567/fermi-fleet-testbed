function formatKey(value) {
	if (typeof value === 'symbol') {
		return value.toString()
	}
	try {
		return String(value)
	} catch {
		return Object.prototype.toString.call(value)
	}
}

/**
 * Validates that a value is a well-formed multiset represented as a Map<any, number>
 * whose counts are non-negative safe integers.
 *
 * @param {unknown} multiset - Candidate multiset to validate.
 * @param {string} paramName - Parameter name for descriptive error messages.
 * @throws {TypeError} If `multiset` is not a Map or any count is not a number.
 * @throws {RangeError} If any count is negative, non-finite, non-integer, or not a safe integer.
 */
function validateMultiset(multiset, paramName) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(`${paramName} must be a Map`)
	}

	for (const [value, count] of multiset) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`${paramName} count for key ${formatKey(value)} must be a number, got ${typeof count}`,
			)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`${paramName} count for key ${formatKey(value)} must be a non-negative safe integer, got ${count}`,
			)
		}
	}
}

/**
 * Computes the logical AND (multiset intersection / pointwise minimum) of two
 * multisets represented as `Map<value, count>` using a straightforward iterative
 * implementation.
 *
 * For every element present in both multisets with positive counts, the resulting
 * multiset contains that element with count `Math.min(countA, countB)`. Entries
 * with a resulting count of `0` are omitted. Neither input map is mutated.
 *
 * @template T
 * @param {Map<T, number>} a - First multiset mapping values to non-negative safe integer counts.
 * @param {Map<T, number>} b - Second multiset mapping values to non-negative safe integer counts.
 * @returns {Map<T, number>} A new multiset containing the intersection of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a `Map`, or if any count is not a number.
 * @throws {RangeError} If any count in `a` or `b` is not a non-negative safe integer.
 */
export function andMultisetIterative(a, b) {
	validateMultiset(a, 'a')
	validateMultiset(b, 'b')

	const result = new Map()
	for (const [value, countA] of a) {
		if (countA === 0 || !b.has(value)) {
			continue
		}
		const countB = b.get(value)
		const minCount = countA < countB ? countA : countB
		if (minCount > 0) {
			result.set(value, minCount)
		}
	}

	return result
}
