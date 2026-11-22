/**
 * Validates that a value is a multiset represented as a `Map<unknown, number>`
 * whose counts are all non-negative safe integers.
 *
 * @param {unknown} multiset - Candidate multiset to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `multiset` is not a `Map` or any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or unsafe.
 */
function validateMultiset(multiset, name) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(`${name} must be a Map`)
	}

	for (const [key, count] of multiset) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`${name} count for key ${String(key)} must be a number`
			)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`${name} count for key ${String(key)} must be a non-negative safe integer`
			)
		}
	}
}

/**
 * Computes the multiset logical NOT (complement) of `multiset` relative to a
 * `universe` multiset using the closed-form truncated-difference (monus) identity:
 *
 *   count(x) = max(0, U(x) - A(x)) = ((U(x) - A(x)) + |U(x) - A(x)|) / 2
 *
 * To preserve exact precision across the entire safe integer range
 * `[0, Number.MAX_SAFE_INTEGER]` without intermediate overflow, the identity is
 * evaluated in scaled form `((U(x) - A(x)) / 2) + |(U(x) - A(x)) / 2|`.
 *
 * Multisets are represented as `Map<value, count>` with non-negative safe
 * integer counts. Keys with a resulting count of `0` are omitted from the
 * returned `Map`, and input maps are never mutated.
 *
 * Whenever `multiset ⊆ universe` (i.e. `A(x) <= U(x)` for all `x`), the
 * operation is an involution: `notMultisetSeries(notMultisetSeries(A, U), U)`
 * equals `A` (modulo omitted zero-count keys).
 *
 * @template T
 * @param {Map<T, number>} multiset - Input multiset `A`.
 * @param {Map<T, number>} universe - Universe multiset `U` to complement against.
 * @returns {Map<T, number>} Complement multiset `U ⊖ A` with zero counts omitted.
 * @throws {TypeError} If `multiset` or `universe` is not a `Map` or contains non-numeric counts.
 * @throws {RangeError} If any count in `multiset` or `universe` is negative, non-integer, or unsafe.
 */
export function notMultisetSeries(multiset, universe) {
	validateMultiset(multiset, 'multiset')
	validateMultiset(universe, 'universe')

	const result = new Map()

	for (const [key, uCount] of universe) {
		const aCount = multiset.get(key) ?? 0
		const halfDiff = (uCount - aCount) / 2
		const count = halfDiff + Math.abs(halfDiff)

		if (count > 0) {
			result.set(key, count)
		}
	}

	return result
}
