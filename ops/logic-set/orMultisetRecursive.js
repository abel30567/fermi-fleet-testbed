/**
 * Validates that a value is a multiset represented as a `Map<unknown, number>`
 * whose counts are non-negative safe integers.
 *
 * @param {unknown} multiset - Candidate multiset to validate.
 * @param {number} index - Positional argument index for error reporting.
 * @throws {TypeError} If `multiset` is not a `Map` or any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, or not a safe integer.
 */
function validateMultiset(multiset, index) {
	if (!(multiset instanceof Map)) {
		throw new TypeError(
			`Expected argument ${index} to be a Map, got ${multiset === null ? 'null' : typeof multiset}`
		)
	}
	for (const [key, count] of multiset.entries()) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`Expected numeric count for key ${String(key)} in argument ${index}, got ${typeof count}`
			)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`Expected non-negative safe integer count for key ${String(key)} in argument ${index}, got ${count}`
			)
		}
	}
}

/**
 * Recursively applies a slice of `[key, count]` entries into `target` using
 * divide-and-conquer, keeping the maximum positive multiplicity for each key
 * and omitting zero-count entries.
 *
 * @template T
 * @param {Array<[T, number]>} entries - Array of multiset entries.
 * @param {number} lo - Inclusive lower index.
 * @param {number} hi - Exclusive upper index.
 * @param {Map<T, number>} target - Accumulator map for maximum counts.
 */
function applyEntriesRecursive(entries, lo, hi, target) {
	if (lo >= hi) {
		return
	}
	if (hi - lo === 1) {
		const [key, count] = entries[lo]
		if (count > 0) {
			const prev = target.get(key) ?? 0
			if (count > prev) {
				target.set(key, count)
			}
		}
		return
	}
	const mid = (lo + hi) >>> 1
	applyEntriesRecursive(entries, lo, mid, target)
	applyEntriesRecursive(entries, mid, hi, target)
}

/**
 * Computes the multiset logical OR (pointwise maximum multiplicity) of two
 * multisets recursively via divide-and-conquer over their entries.
 *
 * @template T
 * @param {Map<T, number>} left - First multiset.
 * @param {Map<T, number>} right - Second multiset.
 * @returns {Map<T, number>} New multiset with maximum positive counts.
 */
function orPairRecursive(left, right) {
	const result = new Map()
	const leftEntries = Array.from(left.entries())
	const rightEntries = Array.from(right.entries())
	applyEntriesRecursive(leftEntries, 0, leftEntries.length, result)
	applyEntriesRecursive(rightEntries, 0, rightEntries.length, result)
	return result
}

/**
 * Divide-and-conquer reduction of a slice of multisets under multiset OR.
 *
 * @template T
 * @param {Array<Map<T, number>>} multisets - Validated list of multisets.
 * @param {number} lo - Inclusive lower index.
 * @param {number} hi - Exclusive upper index.
 * @returns {Map<T, number>} Combined multiset for `multisets[lo..hi)`.
 */
function orSliceRecursive(multisets, lo, hi) {
	if (lo >= hi) {
		return new Map()
	}
	if (hi - lo === 1) {
		const result = new Map()
		const entries = Array.from(multisets[lo].entries())
		applyEntriesRecursive(entries, 0, entries.length, result)
		return result
	}
	const mid = (lo + hi) >>> 1
	const left = orSliceRecursive(multisets, lo, mid)
	const right = orSliceRecursive(multisets, mid, hi)
	return orPairRecursive(left, right)
}

/**
 * Computes the logical OR (union / pointwise maximum multiplicity) over zero,
 * one, two, or more multisets represented as `Map<value, count>` using a
 * recursive divide-and-conquer implementation.
 *
 * For each element `x`, the resulting multiplicity is `max_i count_i(x)`.
 * Entries with a multiplicity of `0` are omitted from the returned `Map`.
 * Input maps are never mutated.
 *
 * @template T
 * @param {...Map<T, number>} multisets - Multisets mapping values to non-negative integer counts.
 * @returns {Map<T, number>} A new multiset containing each key with its maximum positive count.
 * @throws {TypeError} If any argument is not a `Map` or contains a non-numeric count.
 * @throws {RangeError} If any count is negative, non-integer, or not a safe integer.
 */
export function orMultisetRecursive(...multisets) {
	for (let i = 0; i < multisets.length; i++) {
		validateMultiset(multisets[i], i)
	}
	return orSliceRecursive(multisets, 0, multisets.length)
}
