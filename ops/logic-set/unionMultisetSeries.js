/**
 * Computes the closed-form maximum of two non-negative safe integers using
 * the algebraic identity `max(a, b) = (a + b + |a - b|) / 2`.
 *
 * Uses exact `BigInt` intermediate arithmetic so counts up to
 * `Number.MAX_SAFE_INTEGER` never suffer IEEE-754 precision loss during `a + b`.
 *
 * @param {number} a - Non-negative safe integer multiplicity from the first multiset.
 * @param {number} b - Non-negative safe integer multiplicity from the second multiset.
 * @returns {number} The exact maximum `max(a, b)` as a non-negative safe integer.
 */
function closedFormMax(a, b) {
	const ba = BigInt(a);
	const bb = BigInt(b);
	const delta = ba - bb;
	const absDelta = delta < 0n ? -delta : delta;
	return Number((ba + bb + absDelta) / 2n);
}

/**
 * Validates that a value is a `Map` representing a multiset whose values are
 * all non-negative safe integers.
 *
 * @template T
 * @param {unknown} candidate - Value to validate as a multiset.
 * @param {number} index - Zero-based argument index for diagnostic error messages.
 * @returns {Map<T, number>} The validated multiset `Map`.
 * @throws {TypeError} If `candidate` is not a `Map` or contains a non-number count.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or unsafe.
 */
function validateMultiset(candidate, index) {
	if (!(candidate instanceof Map)) {
		throw new TypeError(
			`Argument at index ${index} must be a Map<value, count> representing a multiset.`,
		);
	}

	for (const [key, count] of candidate.entries()) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`Multiset at index ${index} has a non-numeric count for key ${String(key)}: expected a non-negative safe integer.`,
			);
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`Multiset at index ${index} has an invalid count (${count}) for key ${String(key)}: expected a non-negative safe integer.`,
			);
		}
	}

	return candidate;
}

/**
 * Computes the pairwise union of two validated multisets using the closed-form
 * identity `m_{A ∪ B}(x) = (m_A(x) + m_B(x) + |m_A(x) - m_B(x)|) / 2`.
 *
 * @template T
 * @param {Map<T, number>} left - First validated multiset.
 * @param {Map<T, number>} right - Second validated multiset.
 * @returns {Map<T, number>} Normalized multiset union with zero counts omitted.
 */
function unionPair(left, right) {
	const result = new Map();
	const keys = new Set();

	for (const key of left.keys()) {
		keys.add(key);
	}
	for (const key of right.keys()) {
		keys.add(key);
	}

	for (const key of keys) {
		const countA = left.get(key) ?? 0;
		const countB = right.get(key) ?? 0;
		const unionCount = closedFormMax(countA, countB);
		if (unionCount > 0) {
			result.set(key, unionCount);
		}
	}

	return result;
}

/**
 * Computes the multiset union `A₁ ∪ A₂ ∪ … ∪ Aₙ` over zero or more multisets
 * represented as `Map<value, count>`.
 *
 * Each input `Map` encodes a multiset via its multiplicity function
 * `m_A(x) ∈ ℤ_{≥ 0}` (non-negative safe integer counts; absent keys have
 * multiplicity `0`). Zero-multiplicity entries are omitted from the returned
 * `Map`, and input maps are never mutated.
 *
 * ### Closed-Form Identity
 * Pairwise union is computed directly from the closed-form identity:
 * ```text
 * m_{A ∪ B}(x) = max(m_A(x), m_B(x)) = (m_A(x) + m_B(x) + |m_A(x) - m_B(x)|) / 2
 * ```
 * Variadic invocations fold associatively over this pairwise operation, giving
 * `m_{⋃_i A_i}(x) = max_i m_{A_i}(x)`. Calling with no arguments returns the
 * empty multiset `new Map()`, the identity element of multiset union.
 *
 * ### Multiset Union vs. Multiset Sum
 * - **Multiset union (`A ∪ B`)** takes the pointwise maximum of multiplicities:
 *   `m_{A ∪ B}(x) = max(m_A(x), m_B(x))`. It is idempotent (`A ∪ A = A`) and
 *   obeys inclusion-exclusion `|A ∪ B| + |A ∩ B| = |A| + |B|`.
 * - **Multiset sum (`A ⊎ B`)** adds multiplicities:
 *   `m_{A ⊎ B}(x) = m_A(x) + m_B(x)`. It is not idempotent (`A ⊎ A = 2A`) and
 *   satisfies `|A ⊎ B| = |A| + |B|`.
 *
 * @template T
 * @param {...Map<T, number>} multisets - Zero or more multisets as `Map<value, count>`.
 * @returns {Map<T, number>} A new `Map` representing the multiset union (zero counts omitted).
 * @throws {TypeError} If any argument is not a `Map` or contains a non-number count.
 * @throws {RangeError} If any count is negative, non-integer, non-finite, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function unionMultisetSeries(...multisets) {
	const validated = multisets.map((multiset, index) =>
		validateMultiset(multiset, index),
	);

	if (validated.length === 0) {
		return new Map();
	}

	let accumulator = unionPair(validated[0], new Map());
	for (let i = 1; i < validated.length; i += 1) {
		accumulator = unionPair(accumulator, validated[i]);
	}

	return accumulator;
}
