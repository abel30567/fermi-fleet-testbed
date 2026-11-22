/**
 * Validates that a value is a multiset represented as a `Map<unknown, number>`
 * whose counts are all non-negative safe integers.
 *
 * @param {unknown} multiset - Candidate multiset to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `multiset` is not a `Map` or contains a non-number count.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or unsafe.
 */
function validateMultiset(multiset, name) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(`${name} must be a Map<value, count>`)
	}

	for (const [key, count] of multiset) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`${name} count for key ${String(key)} must be a number, received ${typeof count}`,
			)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`${name} count for key ${String(key)} must be a non-negative safe integer, received ${count}`,
			)
		}
	}
}

/**
 * Computes truncated subtraction (monus) `max(0, a - b)` via the closed-form
 * algebraic identity:
 *
 *     a ∸ b = ((a - b) + |a - b|) / 2
 *
 * Evaluated in `BigInt` arithmetic so intermediate sums never overflow
 * `Number.MAX_SAFE_INTEGER`.
 *
 * @param {number} a - Non-negative safe integer minuend.
 * @param {number} b - Non-negative safe integer subtrahend.
 * @returns {number} Non-negative safe integer `max(0, a - b)`.
 */
function monusClosedForm(a, b) {
	const diff = BigInt(a) - BigInt(b)
	const absDiff = diff < 0n ? -diff : diff
	return Number((diff + absDiff) / 2n)
}

/**
 * Computes the multiset difference `A \ B` over counting-logic multisets
 * represented as `Map<value, count>`.
 *
 * For each element `x`, the output multiplicity is defined by the closed-form
 * truncated-subtraction (monus) identity:
 *
 *     m_{A \ B}(x) = max(0, m_A(x) - m_B(x))
 *                  = ((m_A(x) - m_B(x)) + |m_A(x) - m_B(x)|) / 2
 *
 * Entries with a resulting multiplicity of `0` are omitted from the returned
 * `Map`. Input maps are validated and never mutated.
 *
 * @template T
 * @param {Map<T, number>} a - Minuend multiset (`Map<value, count>` with non-negative safe integer counts).
 * @param {Map<T, number>} b - Subtrahend multiset (`Map<value, count>` with non-negative safe integer counts).
 * @returns {Map<T, number>} New multiset `A \ B` containing only entries with strictly positive counts.
 * @throws {TypeError} If `a` or `b` is not a `Map`, or if any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function setDifferenceMultisetSeries(a, b) {
	validateMultiset(a, 'a')
	validateMultiset(b, 'b')

	const result = new Map()

	for (const [key, countA] of a) {
		const countB = b.get(key) ?? 0
		const remaining = monusClosedForm(countA, countB)
		if (remaining > 0) {
			result.set(key, remaining)
		}
	}

	return result
}
