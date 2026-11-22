/**
 * Safely formats an arbitrary Map key for diagnostic error messages.
 *
 * @param {unknown} key
 * @returns {string}
 */
function formatKey(key) {
	if (typeof key === 'symbol') {
		return key.toString()
	}
	try {
		return String(key)
	} catch {
		return '[unprintable key]'
	}
}

/**
 * Validates that a value is a Map whose entries all have finite,
 * non-negative safe integer counts.
 *
 * @param {unknown} multiset
 * @param {string} name
 * @throws {TypeError} If `multiset` is not a `Map` or contains a non-number count.
 * @throws {RangeError} If any count is non-finite, negative, non-integer, or not a safe integer.
 */
function validateMultiset(multiset, name) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(`${name} must be a Map`)
	}

	for (const [key, count] of multiset) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`${name} count for key ${formatKey(key)} must be a number, got ${typeof count}`
			)
		}
		if (!Number.isFinite(count)) {
			throw new RangeError(
				`${name} count for key ${formatKey(key)} must be finite, got ${count}`
			)
		}
		if (!Number.isInteger(count) || count < 0 || !Number.isSafeInteger(count)) {
			throw new RangeError(
				`${name} count for key ${formatKey(key)} must be a non-negative safe integer, got ${count}`
			)
		}
	}
}

/**
 * Computes the multiset complement (logical NOT) of `multiset` relative to a
 * bounding `universe` multiset using a straightforward iterative pass.
 *
 * Mathematical semantics:
 * For every element `x`, treating absent keys as multiplicity `0`:
 *   `(not(A, U))(x) = max(0, U(x) - A(x))`
 *
 * Behavior for elements exceeding or outside `universe`:
 * - If an element has `A(x) >= U(x)`, its complement multiplicity clamps to `0`
 *   and the key is omitted from the returned canonical `Map`.
 * - If an element appears in `multiset` but not in `universe`, `U(x) = 0`, so
 *   `max(0, 0 - A(x)) = 0` and the key does not appear in the result; its count
 *   in `multiset` is still validated.
 * - Consequently, involution `not(not(A, U), U) = A` holds whenever `A <= U`
 *   (i.e. `A(x) <= U(x)` for all `x`), and in general `not(not(A, U), U) = A ∩ U`.
 *
 * Neither input `Map` is mutated. The returned `Map` is canonical (no entries
 * with count `0`).
 *
 * @template T
 * @param {Map<T, number>} multiset - Input multiset mapping values to non-negative safe integer counts.
 * @param {Map<T, number>} universe - Bounding universe multiset mapping values to non-negative safe integer counts.
 * @returns {Map<T, number>} New canonical multiset representing `max(0, universe(x) - multiset(x))` for each key.
 * @throws {TypeError} If `multiset` or `universe` is not a `Map`, or if any count is not a `number`.
 * @throws {RangeError} If any count in `multiset` or `universe` is `NaN`, non-finite, negative, non-integer, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function notMultisetIterative(multiset, universe) {
	validateMultiset(multiset, 'multiset')
	validateMultiset(universe, 'universe')

	const result = new Map()

	for (const [key, universeCount] of universe) {
		if (universeCount === 0) {
			continue
		}
		const multisetCount = multiset.get(key) ?? 0
		const remaining = universeCount - multisetCount
		if (remaining > 0) {
			result.set(key, remaining)
		}
	}

	return result
}
