/**
 * Formats a Map key safely for error messages, including Symbols and
 * null-prototype objects that cannot be coerced with String().
 *
 * @param {unknown} key - Key to format.
 * @returns {string} Human-readable representation of the key.
 */
function describeKey(key) {
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
 * Validates that a value is a multiset represented as Map<unknown, number>
 * where every count is a non-negative safe integer.
 *
 * @param {unknown} multiset - Candidate multiset to validate.
 * @param {string} paramName - Parameter name used in error messages.
 * @throws {TypeError} If `multiset` is not a Map or any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or unsafe.
 */
function validateMultiset(multiset, paramName) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(`${paramName} must be a Map<value, count>`)
	}
	for (const [key, count] of multiset) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`${paramName} count for key ${describeKey(key)} must be a number, got ${typeof count}`,
			)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`${paramName} count for key ${describeKey(key)} must be a non-negative safe integer, got ${count}`,
			)
		}
	}
}

/**
 * Computes the multiset XOR (symmetric difference) of two multisets represented
 * as `Map<value, count>` using a straightforward iterative implementation.
 *
 * For each element `x` present in `a` or `b`, the resulting multiplicity is
 * `|countA(x) - countB(x)|`. Entries with a resulting count of `0` are omitted
 * from the returned Map. Neither input Map is mutated.
 *
 * @template T
 * @param {Map<T, number>} a - First multiset mapping values to non-negative safe integer counts.
 * @param {Map<T, number>} b - Second multiset mapping values to non-negative safe integer counts.
 * @returns {Map<T, number>} New multiset containing each key with non-zero `|a(k) - b(k)|`.
 * @throws {TypeError} If `a` or `b` is not a Map, or if any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, NaN, infinite, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function xorMultisetIterative(a, b) {
	validateMultiset(a, 'a')
	validateMultiset(b, 'b')

	const result = new Map()

	for (const [key, countA] of a) {
		const countB = b.has(key) ? b.get(key) : 0
		const diff = Math.abs(countA - countB)
		if (diff > 0) {
			result.set(key, diff)
		}
	}

	for (const [key, countB] of b) {
		if (!a.has(key) && countB > 0) {
			result.set(key, countB)
		}
	}

	return result
}
