/**
 * Validates that the given value is a Map representing a valid multiset
 * whose counts are all non-negative safe integers.
 *
 * @param {unknown} value - Candidate multiset to validate.
 * @param {string} paramName - Parameter name for descriptive error messages.
 * @throws {TypeError} If value is not a Map or contains a non-integer count.
 * @throws {RangeError} If any count is negative or exceeds Number.MAX_SAFE_INTEGER.
 */
function validateMultiset(value, paramName) {
	if (!(value instanceof Map)) {
		throw new TypeError(`Expected "${paramName}" to be a Map instance`);
	}

	for (const [key, count] of value.entries()) {
		if (typeof count !== 'number' || !Number.isInteger(count)) {
			throw new TypeError(
				`Invalid count for key ${String(key)} in "${paramName}": expected a non-negative safe integer`,
			);
		}
		if (count < 0 || !Number.isSafeInteger(count)) {
			throw new RangeError(
				`Count out of range for key ${String(key)} in "${paramName}": expected a non-negative safe integer`,
			);
		}
	}
}

/**
 * Merges two Maps with disjoint key sets into a new Map.
 *
 * @template K
 * @param {Map<K, number>} left - Left sub-result map.
 * @param {Map<K, number>} right - Right sub-result map.
 * @returns {Map<K, number>} Combined map containing all entries from left and right.
 */
function mergeDisjointMaps(left, right) {
	const merged = new Map(left);
	for (const [key, count] of right) {
		merged.set(key, count);
	}
	return merged;
}

/**
 * Recursively computes multiset XOR over a slice `[start, end)` of deduplicated keys
 * using divide-and-conquer, merging resulting sub-maps on the way back up.
 *
 * @template K
 * @param {K[]} keys - Deduplicated array of keys from both input multisets.
 * @param {number} start - Inclusive start index into `keys`.
 * @param {number} end - Exclusive end index into `keys`.
 * @param {Map<K, number>} a - First multiset.
 * @param {Map<K, number>} b - Second multiset.
 * @returns {Map<K, number>} Multiset XOR for keys in `[start, end)`.
 */
function xorDivideAndConquer(keys, start, end, a, b) {
	if (start >= end) {
		return new Map();
	}

	if (end - start === 1) {
		const key = keys[start];
		const countA = a.get(key) ?? 0;
		const countB = b.get(key) ?? 0;
		const diff = Math.abs(countA - countB);
		const leaf = new Map();
		if (diff > 0) {
			leaf.set(key, diff);
		}
		return leaf;
	}

	const mid = start + Math.floor((end - start) / 2);
	const left = xorDivideAndConquer(keys, start, mid, a, b);
	const right = xorDivideAndConquer(keys, mid, end, a, b);
	return mergeDisjointMaps(left, right);
}

/**
 * Computes the logical XOR (symmetric difference) of two multisets represented as
 * `Map<value, count>`, using a recursive divide-and-conquer algorithm over the
 * deduplicated keys.
 *
 * For every element `x`, the resulting multiplicity is:
 * `count(x) = Math.abs(countA(x) - countB(x))`
 * Entries whose resulting count is `0` are omitted.
 *
 * Input maps are validated and never mutated.
 *
 * @template K
 * @param {Map<K, number>} a - First multiset mapping values to non-negative safe integer counts.
 * @param {Map<K, number>} b - Second multiset mapping values to non-negative safe integer counts.
 * @returns {Map<K, number>} New multiset representing the symmetric difference of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a `Map`, or if any count is not an integer number.
 * @throws {RangeError} If any count is negative or not a safe integer.
 *
 * @example
 * const a = new Map([['x', 3], ['y', 1]]);
 * const b = new Map([['x', 1], ['y', 1], ['z', 2]]);
 * xorMultisetRecursive(a, b);
 * // => Map(2) { 'x' => 2, 'z' => 2 }
 */
export function xorMultisetRecursive(a, b) {
	validateMultiset(a, 'a');
	validateMultiset(b, 'b');

	const uniqueKeys = Array.from(new Set([...a.keys(), ...b.keys()]));
	return xorDivideAndConquer(uniqueKeys, 0, uniqueKeys.length, a, b);
}
