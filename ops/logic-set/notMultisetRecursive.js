/**
 * Recursive / divide-and-conquer multiset logical NOT (relative complement).
 *
 * Computes the relative complement `universe - multiset` over counting multisets
 * represented as `Map<value, count>`, where each element `x` in `universe` has
 * resulting multiplicity `max(0, universe(x) - multiset(x))`. Entries whose
 * resulting count is `0` are omitted from the returned `Map`.
 *
 * @module ops/logic-set/notMultisetRecursive
 */

/**
 * Validates that every entry in a slice of `[key, count]` pairs has a
 * non-negative integer count using divide-and-conquer recursion.
 *
 * @param {Array<[unknown, unknown]>} entries - Array of `[key, count]` entries.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {string} name - Parameter name used in error messages.
 * @throws {TypeError} If any count is not a number.
 * @throws {RangeError} If any count is not a non-negative integer.
 */
function validateCountsRecursive(entries, lo, hi, name) {
	if (lo >= hi) {
		return;
	}
	if (hi - lo === 1) {
		const [, count] = entries[lo];
		if (typeof count !== 'number') {
			throw new TypeError(`${name} counts must be non-negative integers`);
		}
		if (!Number.isInteger(count) || count < 0) {
			throw new RangeError(`${name} counts must be non-negative integers`);
		}
		return;
	}
	const mid = (lo + hi) >>> 1;
	validateCountsRecursive(entries, lo, mid, name);
	validateCountsRecursive(entries, mid, hi, name);
}

/**
 * Merges two disjoint partial result maps, preserving insertion order.
 *
 * @template T
 * @param {Map<T, number>} left - Left partial complement map.
 * @param {Map<T, number>} right - Right partial complement map.
 * @returns {Map<T, number>} Combined map containing all entries from `left` and `right`.
 */
function mergeMaps(left, right) {
	for (const [key, count] of right) {
		left.set(key, count);
	}
	return left;
}

/**
 * Recursively computes the relative complement over a slice `[lo, hi)` of
 * universe entries using divide-and-conquer.
 *
 * @template T
 * @param {Array<[T, number]>} universeEntries - Entries extracted from the universe multiset.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {Map<T, number>} multiset - Validated input multiset to negate.
 * @returns {Map<T, number>} Complement multiset for the slice `[lo, hi)`.
 */
function complementSlice(universeEntries, lo, hi, multiset) {
	if (lo >= hi) {
		return new Map();
	}
	if (hi - lo === 1) {
		const [key, universeCount] = universeEntries[lo];
		const multisetCount = multiset.get(key) ?? 0;
		const remaining = Math.max(0, universeCount - multisetCount);
		const result = new Map();
		if (remaining > 0) {
			result.set(key, remaining);
		}
		return result;
	}
	const mid = (lo + hi) >>> 1;
	const left = complementSlice(universeEntries, lo, mid, multiset);
	const right = complementSlice(universeEntries, mid, hi, multiset);
	return mergeMaps(left, right);
}

/**
 * Computes the logical NOT (relative complement `universe - multiset`) of a
 * multiset with respect to a universe multiset using a divide-and-conquer
 * recursive algorithm.
 *
 * For every element `x`, the output count is `max(0, U(x) - A(x))`, and any
 * element with a resulting count of `0` is omitted. Neither input map is mutated.
 *
 * @template T
 * @param {Map<T, number>} multiset - Input multiset `A` mapping values to non-negative integer counts.
 * @param {Map<T, number>} universe - Universe multiset `U` mapping values to non-negative integer counts.
 * @returns {Map<T, number>} New multiset representing `U - A` with zero-count entries omitted.
 * @throws {TypeError} If `multiset` or `universe` is not a `Map`, or any count is not a number.
 * @throws {RangeError} If any count in `multiset` or `universe` is negative, non-finite, or non-integer.
 */
export function notMultisetRecursive(multiset, universe) {
	if (!(multiset instanceof Map)) {
		throw new TypeError('multiset must be a Map');
	}
	if (!(universe instanceof Map)) {
		throw new TypeError('universe must be a Map');
	}

	const multisetEntries = Array.from(multiset.entries());
	const universeEntries = Array.from(universe.entries());

	validateCountsRecursive(multisetEntries, 0, multisetEntries.length, 'multiset');
	validateCountsRecursive(universeEntries, 0, universeEntries.length, 'universe');

	return complementSlice(universeEntries, 0, universeEntries.length, multiset);
}
