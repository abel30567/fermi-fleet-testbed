function formatKey(key) {
	try {
		return String(key)
	} catch {
		return '[unprintable key]'
	}
}

/**
 * Validates that a value is a multiset represented as a Map<any, number>
 * whose counts are finite non-negative safe integers.
 *
 * @param {unknown} multiset - Candidate multiset to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `multiset` is not a Map or any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or not a safe integer.
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
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`${name} count for key ${formatKey(key)} must be a non-negative safe integer, got ${count}`,
			)
		}
	}
}

/**
 * Computes the multiset symmetric difference (counting-logic XOR) of two multisets
 * using a straightforward iterative pass over the input maps.
 *
 * For every element `x` across `a` and `b`, the multiplicity in the result is:
 *   `m_{a ⊕ b}(x) = |m_a(x) - m_b(x)|`
 * where missing keys have multiplicity `0`. Entries whose resulting multiplicity
 * is `0` are omitted so the returned Map is in canonical form.
 *
 * Neither input Map is mutated.
 *
 * @template T
 * @param {Map<T, number>} a - First multiset mapping values to non-negative safe integer counts.
 * @param {Map<T, number>} b - Second multiset mapping values to non-negative safe integer counts.
 * @returns {Map<T, number>} New canonical multiset containing all keys with non-zero `|countA - countB|`.
 * @throws {TypeError} If `a` or `b` is not a `Map`, or if any multiplicity is not a `number`.
 * @throws {RangeError} If any multiplicity is negative, NaN, infinite, non-integer, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function xorMultisetIterative(a, b) {
	validateMultiset(a, 'a')
	validateMultiset(b, 'b')

	const result = new Map()

	for (const [key, countA] of a) {
		const countB = b.has(key) ? b.get(key) : 0
		const diff = countA >= countB ? countA - countB : countB - countA
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
