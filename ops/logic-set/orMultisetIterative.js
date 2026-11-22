/**
 * Validates that a multiset multiplicity is a non-negative safe integer.
 *
 * @param {unknown} count - The multiplicity value to validate.
 * @param {string} label - Parameter label for error diagnostics.
 * @throws {TypeError} If `count` is not a number.
 * @throws {RangeError} If `count` is not a non-negative safe integer.
 */
function validateCount(count, label) {
	if (typeof count !== 'number') {
		throw new TypeError(
			`Multiset "${label}" contains a non-numeric count of type ${typeof count}`,
		)
	}
	if (!Number.isSafeInteger(count) || count < 0) {
		throw new RangeError(
			`Multiset "${label}" count must be a non-negative safe integer, got ${count}`,
		)
	}
}

/**
 * Computes the multiset disjunction (union / join) of two multisets iteratively.
 *
 * Given multisets `a` and `b` represented as `Map<value, count>`, the result is
 * a new canonical `Map` whose multiplicity for every element `k` is:
 *
 *   `(a ∨ b)(k) = max(a.get(k) ?? 0, b.get(k) ?? 0)`
 *
 * Entries with resulting multiplicity `0` are omitted from the returned `Map`.
 * Neither input `Map` is mutated.
 *
 * @template T
 * @param {Map<T, number>} a - First multiset mapping elements to non-negative safe integer counts.
 * @param {Map<T, number>} b - Second multiset mapping elements to non-negative safe integer counts.
 * @returns {Map<T, number>} New canonical multiset representing the disjunction of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a `Map`, or if any count is not a `number`.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function orMultisetIterative(a, b) {
	if (!(a instanceof Map)) {
		throw new TypeError('First argument "a" must be a Map')
	}
	if (!(b instanceof Map)) {
		throw new TypeError('Second argument "b" must be a Map')
	}

	const result = new Map()

	for (const [key, count] of a) {
		validateCount(count, 'a')
		if (count > 0) {
			result.set(key, count)
		}
	}

	for (const [key, count] of b) {
		validateCount(count, 'b')
		if (count > 0) {
			const existing = result.get(key) ?? 0
			if (count > existing) {
				result.set(key, count)
			}
		}
	}

	return result
}
