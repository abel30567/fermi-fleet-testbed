/**
 * Computes the closed-form minimum of two non-negative safe integers using the
 * symmetric-difference / inclusion-exclusion identity:
 *
 *   min(a, b) = (a + b - |a - b|) / 2
 *
 * This identity is also the closed form of the level-set indicator series:
 *
 *   min(a, b) = sum_{k = 1}^{infinity} 1[a >= k] * 1[b >= k]
 *
 * Arithmetic is performed in exact BigInt to prevent intermediate overflow
 * when a + b exceeds Number.MAX_SAFE_INTEGER.
 *
 * @param {number} a - Non-negative safe integer multiplicity.
 * @param {number} b - Non-negative safe integer multiplicity.
 * @returns {number} Exact value of min(a, b).
 */
function closedFormMin(a, b) {
	const bigA = BigInt(a)
	const bigB = BigInt(b)
	const diff = bigA - bigB
	const absDiff = diff < 0n ? -diff : diff
	return Number((bigA + bigB - absDiff) / 2n)
}

/**
 * Validates that a candidate argument is a Map whose values are all
 * non-negative safe integers.
 *
 * @param {unknown} multiset - Value to validate as a multiset.
 * @param {number} index - Zero-based argument index for error reporting.
 * @throws {TypeError} If the argument is not a Map or contains a non-number count.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or unsafe.
 */
function validateMultiset(multiset, index) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(`Argument at index ${index} must be a Map<value, count>`)
	}
	for (const [key, count] of multiset.entries()) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`Multiset at index ${index} has non-number count for key ${String(key)}`
			)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`Multiset at index ${index} has invalid count ${count} for key ${String(key)}; expected a non-negative safe integer`
			)
		}
	}
}

/**
 * Computes the multiset intersection over two or more multisets represented as
 * `Map<value, count>`, using the closed-form identity:
 *
 *   m_{A ∩ B}(x) = (m_A(x) + m_B(x) - |m_A(x) - m_B(x)|) / 2
 *                = sum_{k = 1}^{infinity} 1[m_A(x) >= k] * 1[m_B(x) >= k]
 *
 * For n >= 2 multisets, associativity of the closed-form operator yields the
 * pointwise minimum multiplicity across all inputs. Entries whose resulting
 * multiplicity is 0 are omitted from the returned Map so the result is always
 * in canonical multiset form. Input Maps are never mutated.
 *
 * @template T
 * @param {Map<T, number>} first - First multiset mapping values to non-negative safe integer counts.
 * @param {Map<T, number>} second - Second multiset mapping values to non-negative safe integer counts.
 * @param {...Map<T, number>} rest - Additional multisets to intersect.
 * @returns {Map<T, number>} Canonical intersection multiset containing only keys with positive multiplicity.
 * @throws {TypeError} If fewer than two arguments are supplied, any argument is not a Map, or any count is not a number.
 * @throws {RangeError} If any count is negative, fractional, NaN, infinite, or exceeds Number.MAX_SAFE_INTEGER.
 */
export function intersectionMultisetSeries(first, second, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError('intersectionMultisetSeries requires at least two Map arguments')
	}

	const multisets = [first, second, ...rest]
	for (let i = 0; i < multisets.length; i++) {
		validateMultiset(multisets[i], i)
	}

	// Pick the smallest multiset to drive candidate key iteration.
	let smallestIndex = 0
	for (let i = 1; i < multisets.length; i++) {
		if (multisets[i].size < multisets[smallestIndex].size) {
			smallestIndex = i
		}
	}

	const result = new Map()
	const driver = multisets[smallestIndex]

	for (const [key, initialCount] of driver.entries()) {
		if (initialCount === 0) {
			continue
		}

		let count = initialCount
		for (let i = 0; i < multisets.length; i++) {
			if (i === smallestIndex) {
				continue
			}
			const otherCount = multisets[i].get(key) ?? 0
			count = closedFormMin(count, otherCount)
			if (count === 0) {
				break
			}
		}

		if (count > 0) {
			result.set(key, count)
		}
	}

	return result
}
