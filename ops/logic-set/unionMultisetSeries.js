/**
 * Safely converts an arbitrary Map key into a printable string for error messages.
 *
 * @param {unknown} key - Key to format.
 * @returns {string} Printable key description.
 */
function describeKey(key) {
	try {
		return String(key)
	} catch {
		return '[unprintable key]'
	}
}

/**
 * Validates that a value is a well-formed multiset represented as `Map<unknown, number>`
 * where every multiplicity is a non-negative safe integer.
 *
 * @param {unknown} multiset - Candidate multiset to validate.
 * @param {number} index - Zero-based argument index for diagnostic error messages.
 * @throws {TypeError} If `multiset` is not a `Map` or any multiplicity is not a number.
 * @throws {RangeError} If any multiplicity is negative, non-integer, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
function validateMultiset(multiset, index) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(`Argument at index ${index} must be a Map<value, count>`)
	}
	for (const [key, count] of multiset) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`Multiplicity for key ${describeKey(key)} in argument ${index} must be a number`
			)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`Multiplicity for key ${describeKey(key)} in argument ${index} must be a non-negative safe integer, got ${count}`
			)
		}
	}
}

/**
 * Computes the union multiplicity `max(a, b)` for two non-negative safe integers
 * using the closed-form algebraic identity:
 *
 *   max(a, b) = (a + b + |a - b|) / 2
 *
 * Derived from the counting-logic threshold series:
 *
 *   sum_{k=1..infinity} 1[a >= k OR b >= k]
 *     = sum_{k=1..infinity} (1[a >= k] + 1[b >= k] - 1[a >= k] * 1[b >= k])
 *     = a + b - min(a, b)
 *     = (a + b + |a - b|) / 2
 *
 * Decomposes `a = 2*qa + ra` and `b = 2*qb + rb` so intermediate sums never
 * exceed `2^53` and remain exact across the full safe integer range `[0, 2^53 - 1]`.
 *
 * @param {number} a - Non-negative safe integer multiplicity.
 * @param {number} b - Non-negative safe integer multiplicity.
 * @returns {number} Exact value of `(a + b + |a - b|) / 2`.
 */
function closedFormMax(a, b) {
	const qa = Math.floor(a / 2)
	const qb = Math.floor(b / 2)
	const ra = a - 2 * qa
	const rb = b - 2 * qb
	const diff = Math.abs(a - b)
	return qa + qb + (ra + rb + diff) / 2
}

/**
 * Computes the binary multiset union of two validated multisets via the
 * closed-form identity `m_{A U B}(x) = (m_A(x) + m_B(x) + |m_A(x) - m_B(x)|) / 2`.
 *
 * @template T
 * @param {Map<T, number>} left - Validated left multiset.
 * @param {Map<T, number>} right - Validated right multiset.
 * @returns {Map<T, number>} Canonical multiset containing only keys with positive multiplicity.
 */
function unionPair(left, right) {
	const result = new Map()

	for (const [key, countA] of left) {
		const countB = right.get(key) ?? 0
		const unionCount = closedFormMax(countA, countB)
		if (unionCount > 0) {
			result.set(key, unionCount)
		}
	}

	for (const [key, countB] of right) {
		if (!left.has(key)) {
			const unionCount = closedFormMax(0, countB)
			if (unionCount > 0) {
				result.set(key, unionCount)
			}
		}
	}

	return result
}

/**
 * Computes the multiset (bag / counting-logic) union of two or more multisets
 * represented as `Map<value, count>`, using the closed-form identity derived from
 * the indicator-threshold series:
 *
 *   m_{A U B}(x) = sum_{k=1..infinity} 1[m_A(x) >= k OR m_B(x) >= k]
 *                = (m_A(x) + m_B(x) + |m_A(x) - m_B(x)|) / 2
 *
 * Input maps are never mutated. Entries with multiplicity `0` are accepted as absent
 * elements and omitted from the returned canonical `Map`. For three or more multisets,
 * the associative binary closed-form identity is folded left-to-right.
 *
 * @template T
 * @param {Map<T, number>} a - First multiset (`Map<value, non-negative safe integer>`).
 * @param {Map<T, number>} b - Second multiset (`Map<value, non-negative safe integer>`).
 * @param {...Map<T, number>} rest - Optional additional multisets to include in the union.
 * @returns {Map<T, number>} New canonical `Map` representing the multiset union.
 * @throws {TypeError} If any argument is not a `Map` or any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, or not a safe integer.
 */
export function unionMultisetSeries(a, b, ...rest) {
	validateMultiset(a, 0)
	validateMultiset(b, 1)
	for (let i = 0; i < rest.length; i++) {
		validateMultiset(rest[i], i + 2)
	}

	let acc = unionPair(a, b)
	for (const next of rest) {
		acc = unionPair(acc, next)
	}
	return acc
}
