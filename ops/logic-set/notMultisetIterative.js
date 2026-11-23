/**
 * Safely formats a Map key for diagnostic error messages.
 *
 * @param {unknown} key - Key to format.
 * @returns {string} Human-readable representation of the key.
 */
function formatKey(key) {
	try {
		return String(key)
	} catch {
		return '[unprintable key]'
	}
}

/**
 * Validates that a value is a Map whose entries all have non-negative safe integer counts.
 *
 * @param {unknown} value - Candidate multiset to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `value` is not a Map or any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, or not a safe integer.
 */
function validateMultiset(value, name) {
	if (!(value instanceof Map)) {
		throw new TypeError(`${name} must be a Map`)
	}
	for (const [key, count] of value) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`${name} count for key ${formatKey(key)} must be a number`
			)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`${name} count for key ${formatKey(key)} must be a non-negative safe integer`
			)
		}
	}
}

/**
 * Computes the logical NOT (relative complement) of a multiset with respect to a
 * universe multiset using a straightforward iterative implementation.
 *
 * Each multiset is represented as a `Map<T, number>` mapping elements to their
 * non-negative safe integer multiplicities. For every element `x` in `universe`,
 * the resulting multiplicity is `max(0, universe(x) - multiset(x))`, and entries
 * with a resulting multiplicity of `0` are omitted from the returned `Map`.
 *
 * Time complexity: O(|multiset| + |universe|).
 * Space complexity: O(|universe|).
 *
 * @template T
 * @param {Map<T, number>} multiset - Input multiset whose complement is computed.
 * @param {Map<T, number>} universe - Universe multiset defining maximum multiplicities.
 * @returns {Map<T, number>} New canonical multiset containing only elements with positive remaining counts.
 * @throws {TypeError} If `multiset` or `universe` is not a `Map`, or any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, or not a safe integer.
 */
export function notMultisetIterative(multiset, universe) {
	validateMultiset(multiset, 'multiset')
	validateMultiset(universe, 'universe')

	const result = new Map()
	for (const [key, universeCount] of universe) {
		const multisetCount = multiset.get(key) ?? 0
		const remaining = universeCount - multisetCount
		if (remaining > 0) {
			result.set(key, remaining)
		}
	}
	return result
}
