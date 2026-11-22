/**
 * Safely format a Map key for inclusion in validation error messages.
 *
 * @param {unknown} key - Map key to format.
 * @returns {string} Human-readable string representation of the key.
 */
function formatKey(key) {
	try {
		return String(key)
	} catch {
		return '[unprintable key]'
	}
}

/**
 * Validate that a value is a canonicalizable multiset represented as
 * `Map<any, number>` whose counts are non-negative safe integers.
 *
 * @param {unknown} multiset - Candidate multiset map to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `multiset` is not a `Map` or any count is not a number.
 * @throws {RangeError} If any count is non-finite, negative, or not a safe integer.
 */
function validateMultiset(multiset, name) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(`${name} must be a Map`)
	}

	for (const [key, count] of multiset) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`${name} count for key ${formatKey(key)} must be a number, got ${typeof count}`,
			)
		}
		if (!Number.isFinite(count)) {
			throw new RangeError(
				`${name} count for key ${formatKey(key)} must be finite, got ${count}`,
			)
		}
		if (!Number.isSafeInteger(count)) {
			throw new RangeError(
				`${name} count for key ${formatKey(key)} must be a safe integer, got ${count}`,
			)
		}
		if (count < 0) {
			throw new RangeError(
				`${name} count for key ${formatKey(key)} must be non-negative, got ${count}`,
			)
		}
	}
}

/**
 * Compute the multiset intersection `A ∩ B` iteratively without mutating inputs.
 *
 * Mathematical semantics:
 * For multisets `A` and `B` represented as `Map<T, number>` mapping each element
 * `x` to its multiplicity (count), the intersection multiset `A ∩ B` has
 * multiplicity:
 *   `(A ∩ B)(x) = min(A(x), B(x))`
 * where absent keys have multiplicity `0`.
 *
 * The returned `Map` is canonical: entries with multiplicity `0` are omitted,
 * and neither input `Map` is mutated.
 *
 * @template T
 * @param {Map<T, number>} a - First multiset with non-negative safe integer counts.
 * @param {Map<T, number>} b - Second multiset with non-negative safe integer counts.
 * @returns {Map<T, number>} New canonical multiset representing `a ∩ b`.
 * @throws {TypeError} If `a` or `b` is not a `Map`, or any count is not a number.
 * @throws {RangeError} If any count in `a` or `b` is non-finite, negative, or not a safe integer.
 */
export function intersectionMultisetIterative(a, b) {
	validateMultiset(a, 'a')
	validateMultiset(b, 'b')

	const result = new Map()

	for (const [key, countA] of a) {
		if (countA === 0 || !b.has(key)) {
			continue
		}
		const countB = b.get(key)
		if (countB === 0) {
			continue
		}
		const minCount = countA < countB ? countA : countB
		result.set(key, minCount)
	}

	return result
}
