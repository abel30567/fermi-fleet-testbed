/**
 * Multiset logical OR (disjunction / join) using a recursive divide-and-conquer algorithm.
 *
 * Multisets are represented as `Map<value, count>` where each `count` is a
 * non-negative safe integer. For every element `x`, the resulting multiplicity is
 * `Math.max(countA(x), countB(x))`, and entries with a resulting count of `0`
 * are omitted.
 */

/**
 * Safely formats an arbitrary map key for diagnostic error messages.
 *
 * @param {unknown} key
 * @returns {string}
 */
function formatKey(key) {
	if (typeof key === 'symbol') {
		return key.toString();
	}
	try {
		return String(key);
	} catch {
		return '[object null-prototype]';
	}
}

/**
 * Validates that a value is a `Map` whose values are all non-negative safe integers.
 *
 * @template T
 * @param {unknown} multiset
 * @param {string} paramName
 * @returns {asserts multiset is Map<T, number>}
 * @throws {TypeError} If `multiset` is not a `Map` or a count is not a number.
 * @throws {RangeError} If a count is negative or not a safe integer.
 */
function validateMultiset(multiset, paramName) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(`${paramName} must be a Map`);
	}
	for (const [key, count] of multiset) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`Invalid count for key ${formatKey(key)} in ${paramName}: expected a non-negative safe integer`,
			);
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`Invalid count for key ${formatKey(key)} in ${paramName}: expected a non-negative safe integer, got ${count}`,
			);
		}
	}
}

/**
 * Merges two disjoint sub-maps produced by the divide-and-conquer recursion.
 *
 * @template T
 * @param {Map<T, number>} left
 * @param {Map<T, number>} right
 * @returns {Map<T, number>}
 */
function mergeSubMaps(left, right) {
	const merged = new Map();
	for (const [key, count] of left) {
		merged.set(key, count);
	}
	for (const [key, count] of right) {
		merged.set(key, count);
	}
	return merged;
}

/**
 * Recursively computes the multiset OR over the slice `keys[lo..hi)` by splitting
 * the key range in half and merging the resulting sub-maps.
 *
 * @template T
 * @param {readonly T[]} keys
 * @param {number} lo Inclusive start index.
 * @param {number} hi Exclusive end index.
 * @param {Map<T, number>} a
 * @param {Map<T, number>} b
 * @returns {Map<T, number>}
 */
function orRangeRecursive(keys, lo, hi, a, b) {
	if (lo >= hi) {
		return new Map();
	}
	if (hi - lo === 1) {
		const key = keys[lo];
		const countA = a.get(key) ?? 0;
		const countB = b.get(key) ?? 0;
		const maxCount = Math.max(countA, countB);
		const leaf = new Map();
		if (maxCount > 0) {
			leaf.set(key, maxCount);
		}
		return leaf;
	}
	const mid = lo + Math.floor((hi - lo) / 2);
	const leftMap = orRangeRecursive(keys, lo, mid, a, b);
	const rightMap = orRangeRecursive(keys, mid, hi, a, b);
	return mergeSubMaps(leftMap, rightMap);
}

/**
 * Computes the logical OR (multiset disjunction / join) of two multisets
 * represented as `Map<value, count>`, using a recursive divide-and-conquer
 * strategy over the deduplicated keys.
 *
 * For each element `x`, the output count is `Math.max(a.get(x) ?? 0, b.get(x) ?? 0)`.
 * Entries with a resulting count of `0` are omitted. Neither input map is mutated.
 *
 * @template T
 * @param {Map<T, number>} a First multiset (`Map<value, count>`).
 * @param {Map<T, number>} b Second multiset (`Map<value, count>`).
 * @returns {Map<T, number>} New multiset containing the element-wise maximum positive counts.
 * @throws {TypeError} If either argument is not a `Map` or contains a non-number count.
 * @throws {RangeError} If any count is negative or not a safe integer.
 */
export function orMultisetRecursive(a, b) {
	validateMultiset(a, 'a');
	validateMultiset(b, 'b');

	const uniqueKeys = [...new Set([...a.keys(), ...b.keys()])];
	return orRangeRecursive(uniqueKeys, 0, uniqueKeys.length, a, b);
}
