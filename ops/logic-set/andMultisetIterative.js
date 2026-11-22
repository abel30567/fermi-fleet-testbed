/**
 * Formats an arbitrary Map key for inclusion in error messages without throwing
 * on Symbols or null-prototype objects.
 *
 * @param {unknown} key
 * @returns {string}
 */
function formatKey(key) {
	try {
		return String(key)
	} catch {
		return '[unprintable key]'
	}
}

/**
 * Validates that a value is a canonicalizable multiset `Map<T, number>` whose
 * multiplicities are non-negative safe integers.
 *
 * @template T
 * @param {unknown} multiset - Candidate multiset to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {asserts multiset is Map<T, number>}
 * @throws {TypeError} If `multiset` is not a `Map` or any count is not a `number`.
 * @throws {RangeError} If any count is negative, non-finite, or not a safe integer.
 */
function validateMultiset(multiset, name) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(`Expected "${name}" to be a Map, got ${typeof multiset}`)
	}

	for (const [key, count] of multiset) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`Expected count for key ${formatKey(key)} in "${name}" to be a number, got ${typeof count}`,
			)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`Expected count for key ${formatKey(key)} in "${name}" to be a non-negative safe integer, got ${count}`,
			)
		}
	}
}

/**
 * Computes the multiset conjunction (intersection / counting-logic AND) of two
 * multisets represented as `Map<T, number>` using a straightforward iterative
 * algorithm.
 *
 * Mathematical semantics:
 * For every element `x`, the multiplicity in `A ∧ B` is
 * `m_{A ∧ B}(x) = min(m_A(x), m_B(x))`, where missing keys have multiplicity `0`.
 * The returned `Map` is in canonical form: entries with multiplicity `0` are omitted.
 * Neither input `Map` is mutated.
 *
 * @template T
 * @param {Map<T, number>} a - First multiset mapping elements to non-negative safe integer counts.
 * @param {Map<T, number>} b - Second multiset mapping elements to non-negative safe integer counts.
 * @returns {Map<T, number>} A new canonical multiset containing the minimum multiplicity for each shared element with count > 0.
 * @throws {TypeError} If `a` or `b` is not a `Map`, or if any multiplicity value is not a `number`.
 * @throws {RangeError} If any multiplicity value in `a` or `b` is negative, non-finite, or not a safe integer.
 */
export function andMultisetIterative(a, b) {
	validateMultiset(a, 'a')
	validateMultiset(b, 'b')

	/** @type {Map<T, number>} */
	const result = new Map()

	for (const [key, countA] of a) {
		if (countA === 0 || !b.has(key)) {
			continue
		}
		const countB = /** @type {number} */ (b.get(key))
		const minCount = countA < countB ? countA : countB
		if (minCount > 0) {
			result.set(key, minCount)
		}
	}

	return result
}
