/**
 * Validates that a value is a multiset represented as a Map<value, count>
 * whose counts are non-negative safe integers.
 *
 * @param {unknown} multiset - Candidate multiset to validate.
 * @param {string} paramName - Parameter label used in error messages.
 * @throws {TypeError} If `multiset` is not a Map or any count is not a number.
 * @throws {RangeError} If any count is not a non-negative safe integer.
 */
function validateMultiset(multiset, paramName) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(`${paramName} must be a Map<value, count>`)
	}
	for (const [key, count] of multiset.entries()) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`${paramName} count for key ${String(key)} must be a number, got ${typeof count}`
			)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`${paramName} count for key ${String(key)} must be a non-negative safe integer, got ${count}`
			)
		}
	}
}

/**
 * Computes the multiset difference `A \ B` over multisets represented as
 * `Map<value, count>` using a closed-form algebraic identity.
 *
 * In counting logic, the multiplicity of each element `x` in the multiset
 * difference `A \ B` is given by the truncated subtraction (monus) identity:
 *
 * ```
 * m_{A \ B}(x) = m_A(x) - m_{A ∩ B}(x)
 *              = m_A(x) - (m_A(x) + m_B(x) - |m_A(x) - m_B(x)|) / 2
 *              = (m_A(x) - m_B(x)) / 2 + |m_A(x) - m_B(x)| / 2
 * ```
 *
 * Evaluating the closed form as `diff / 2 + Math.abs(diff) / 2` avoids
 * intermediate overflow for all safe integers up to `Number.MAX_SAFE_INTEGER`
 * while remaining exact in IEEE-754 double precision.
 *
 * The returned map is canonical: only elements with strictly positive
 * resulting multiplicity (`count > 0`) are included, and neither input map
 * is mutated.
 *
 * @template T
 * @param {Map<T, number>} a - Minuend multiset (`A`), mapping elements to non-negative safe integer counts.
 * @param {Map<T, number>} b - Subtrahend multiset (`B`), mapping elements to non-negative safe integer counts.
 * @returns {Map<T, number>} A new canonical multiset representing `A \ B`.
 * @throws {TypeError} If `a` or `b` is not a `Map`, or if any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, NaN, infinite, or outside safe integer bounds.
 */
export function setDifferenceMultisetSeries(a, b) {
	validateMultiset(a, 'a')
	validateMultiset(b, 'b')

	const result = new Map()

	for (const [value, countA] of a.entries()) {
		const countB = b.get(value) ?? 0
		const diff = countA - countB
		// Closed-form monus identity: ((countA - countB) + |countA - countB|) / 2
		// Split by / 2 first so values up to Number.MAX_SAFE_INTEGER remain exact without overflow.
		const remaining = diff / 2 + Math.abs(diff) / 2
		if (remaining > 0) {
			result.set(value, remaining)
		}
	}

	return result
}
