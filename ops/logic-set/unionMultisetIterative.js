/**
 * Computes the multiset (bag / counting-logic) union of two or more multisets
 * represented as `Map<value, count>`, using a straightforward iterative algorithm.
 *
 * In multiset theory, the union `A ∪ B` assigns to each element the maximum of
 * its multiplicities across the input multisets:
 *
 *   m_{A ∪ B}(x) = max(m_A(x), m_B(x))
 *
 * Input maps are never mutated. Entries with a count of `0` are accepted as
 * representing absence and are omitted from the returned canonical multiset so
 * that every entry in the output has a strictly positive safe-integer count.
 *
 * @template T
 * @param {Map<T, number>} first - First multiset mapping values to non-negative safe integer counts.
 * @param {Map<T, number>} second - Second multiset mapping values to non-negative safe integer counts.
 * @param {...Map<T, number>} rest - Optional additional multisets to include in the union.
 * @returns {Map<T, number>} A new canonical multiset containing the union of all inputs.
 * @throws {TypeError} If any argument is not a `Map`, or if any count is not a `number`.
 * @throws {RangeError} If any count is `NaN`, non-finite, negative, non-integer, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function unionMultisetIterative(first, second, ...rest) {
	const inputs = [first, second, ...rest];
	const result = new Map();

	for (let i = 0; i < inputs.length; i++) {
		const multiset = inputs[i];
		if (!(multiset instanceof Map)) {
			throw new TypeError(
				`Expected argument at index ${i} to be a Map, got ${multiset === null ? 'null' : typeof multiset}`
			);
		}

		for (const [value, count] of multiset) {
			if (typeof count !== 'number') {
				throw new TypeError(
					`Expected count in multiset at index ${i} to be a number, got ${count === null ? 'null' : typeof count}`
				);
			}
			if (!Number.isSafeInteger(count) || count < 0) {
				throw new RangeError(
					`Expected count in multiset at index ${i} to be a non-negative safe integer, got ${count}`
				);
			}
			if (count === 0) {
				continue;
			}

			const existing = result.get(value);
			if (existing === undefined || count > existing) {
				result.set(value, count);
			}
		}
	}

	return result;
}
