/**
 * Computes the closed-form minimum of two non-negative safe integers using
 * the algebraic identity `min(a, b) = (a + b - |a - b|) / 2`.
 *
 * Uses BigInt intermediates so `a + b` cannot overflow `Number.MAX_SAFE_INTEGER`.
 *
 * @param {number} a - Non-negative safe integer count.
 * @param {number} b - Non-negative safe integer count.
 * @returns {number} The exact minimum `min(a, b)`.
 */
function closedFormMin(a, b) {
	const ba = BigInt(a)
	const bb = BigInt(b)
	const diff = ba >= bb ? ba - bb : bb - ba
	return Number((ba + bb - diff) / 2n)
}

/**
 * Validates that an argument is a `Map` whose values are all non-negative safe integers.
 *
 * @param {unknown} multiset - Candidate multiset to validate.
 * @param {number} argIndex - Zero-based argument position for error reporting.
 * @throws {TypeError} If `multiset` is not a `Map` or contains a non-number count.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or unsafe.
 */
function validateMultiset(multiset, argIndex) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(
			`Argument at index ${argIndex} must be a Map<value, count>`
		)
	}

	for (const [key, count] of multiset.entries()) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`Count for key ${String(key)} in multiset ${argIndex} must be a number`
			)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`Count for key ${String(key)} in multiset ${argIndex} must be a non-negative safe integer, received ${count}`
			)
		}
	}
}

/**
 * Computes the logical AND (conjunction / counting-logic meet) across one or more
 * multisets represented as `Map<value, count>`.
 *
 * For each element `x`, the resulting multiplicity is:
 * `count(x) = min(m_1(x), m_2(x), ..., m_k(x))`
 * evaluated via an associative fold of the closed-form identity:
 * `min(a, b) = (a + b - |a - b|) / 2`.
 *
 * Entries with a resulting count of `0` are omitted from the returned `Map`.
 * Input maps are never mutated.
 *
 * @template K
 * @param {...Map<K, number>} multisets - One or more multisets mapping keys to non-negative safe integer counts.
 * @returns {Map<K, number>} A new canonical multiset containing keys with strictly positive minimum counts.
 * @throws {TypeError} If no multisets are provided, any argument is not a `Map`, or any count is not a number.
 * @throws {RangeError} If any count is negative, fractional, non-finite, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function andMultisetSeries(...multisets) {
	if (multisets.length === 0) {
		throw new TypeError(
			'andMultisetSeries requires at least one Map<value, count> argument'
		)
	}

	for (let i = 0; i < multisets.length; i++) {
		validateMultiset(multisets[i], i)
	}

	// Normalize the first multiset into a fresh accumulator (omitting zero counts).
	let acc = new Map()
	for (const [key, count] of multisets[0].entries()) {
		if (count > 0) {
			acc.set(key, count)
		}
	}

	// Associatively fold the remaining multisets via the closed-form meet identity.
	for (let i = 1; i < multisets.length; i++) {
		if (acc.size === 0) {
			break
		}
		const current = multisets[i]
		const next = new Map()
		for (const [key, accCount] of acc.entries()) {
			const curCount = current.get(key) ?? 0
			const meetCount = closedFormMin(accCount, curCount)
			if (meetCount > 0) {
				next.set(key, meetCount)
			}
		}
		acc = next
	}

	return acc
}
