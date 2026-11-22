/**
 * Multiset intersection over counting logic (`Map<value, count>`) using the
 * closed-form min identity:
 *
 *   m_{A ∩ B}(x) = min(m_A(x), m_B(x)) = (m_A(x) + m_B(x) - |m_A(x) - m_B(x)|) / 2
 *
 * Zero-multiplicity elements are omitted from the returned Map.
 */

/**
 * Validates that a value is a valid multiset (`Map` with non-negative safe
 * integer counts).
 *
 * @param {unknown} multiset
 * @param {number} index
 * @throws {TypeError} If the value is not a Map or a count is not a number.
 * @throws {RangeError} If any count is not a non-negative safe integer.
 */
function validateMultiset(multiset, index) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(
			`Argument at index ${index} must be a Map<value, count>.`
		);
	}

	for (const [key, count] of multiset.entries()) {
		if (typeof count !== "number") {
			throw new TypeError(
				`Count for key ${String(key)} in multiset ${index} must be a number.`
			);
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`Count for key ${String(key)} in multiset ${index} must be a non-negative safe integer.`
			);
		}
	}
}

/**
 * Computes `min(a, b)` for two non-negative safe integers via the closed-form
 * identity `(a + b - |a - b|) / 2`, falling back to BigInt arithmetic when
 * `a + b` would exceed `Number.MAX_SAFE_INTEGER`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function closedFormMin(a, b) {
	if (a > Number.MAX_SAFE_INTEGER - b) {
		const ba = BigInt(a);
		const bb = BigInt(b);
		const diff = ba >= bb ? ba - bb : bb - ba;
		return Number((ba + bb - diff) / 2n);
	}
	return (a + b - Math.abs(a - b)) / 2;
}

/**
 * Computes the intersection of two or more multisets represented as
 * `Map<value, count>`, where each count is a non-negative safe integer.
 *
 * For each element `x`, the output multiplicity is the pairwise fold of
 * `m_{A ∩ B}(x) = (m_A(x) + m_B(x) - |m_A(x) - m_B(x)|) / 2`.
 * Elements with resulting multiplicity `0` are omitted from the output Map.
 * Input Maps are never mutated.
 *
 * @template T
 * @param {...Map<T, number>} multisets Two or more multisets to intersect.
 * @returns {Map<T, number>} A new Map representing the multiset intersection.
 * @throws {RangeError} If fewer than two multisets are provided or any count is
 *   not a non-negative safe integer.
 * @throws {TypeError} If any argument is not a Map or any count is not a number.
 */
export function intersectionMultisetSeries(...multisets) {
	if (multisets.length < 2) {
		throw new RangeError(
			"intersectionMultisetSeries requires at least 2 multiset arguments."
		);
	}

	for (let i = 0; i < multisets.length; i += 1) {
		validateMultiset(multisets[i], i);
	}

	/** @type {Map<any, number>} */
	const result = new Map();
	const first = multisets[0];
	const second = multisets[1];

	for (const [key, countA] of first.entries()) {
		if (countA === 0) {
			continue;
		}
		const countB = second.get(key) ?? 0;
		const minCount = closedFormMin(countA, countB);
		if (minCount > 0) {
			result.set(key, minCount);
		}
	}

	for (let i = 2; i < multisets.length && result.size > 0; i += 1) {
		const current = multisets[i];
		for (const [key, accCount] of result.entries()) {
			const nextCount = current.get(key) ?? 0;
			const minCount = closedFormMin(accCount, nextCount);
			if (minCount > 0) {
				result.set(key, minCount);
			} else {
				result.delete(key);
			}
		}
	}

	return result;
}
