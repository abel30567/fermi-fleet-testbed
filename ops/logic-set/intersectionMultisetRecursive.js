/**
 * Computes the multiset intersection of one or more multisets represented as
 * `Map<value, count>`, using a recursive divide-and-conquer implementation.
 *
 * For multisets $A_1, A_2, \dots, A_k$, the multiplicity of each element $x$ in
 * the intersection is $\min_i A_i(x)$. Elements whose resulting multiplicity is
 * `0` are omitted from the returned `Map`.
 *
 * Input maps are never mutated. All inputs and their counts are validated
 * upfront: every argument must be a `Map` whose values are non-negative finite
 * integers.
 *
 * @template T
 * @param {...Map<T, number>} multisets One or more multisets (`Map<value, count>`).
 * @returns {Map<T, number>} A new `Map` containing the multiset intersection with positive integer counts.
 * @throws {RangeError} If no multisets are provided, or if any count is negative, non-finite, or non-integer.
 * @throws {TypeError} If any argument is not a `Map`, or if any count is not a `number`.
 */
export function intersectionMultisetRecursive(...multisets) {
	if (multisets.length === 0) {
		throw new RangeError('intersectionMultisetRecursive requires at least one multiset Map')
	}

	for (let i = 0; i < multisets.length; i++) {
		validateMultiset(multisets[i], i)
	}

	return intersectRange(multisets, 0, multisets.length)
}

/**
 * Validates that a candidate argument is a `Map` with non-negative integer counts.
 *
 * @param {unknown} candidate
 * @param {number} index
 */
function validateMultiset(candidate, index) {
	if (!(candidate instanceof Map)) {
		throw new TypeError(`Argument at index ${index} must be a Map`)
	}

	for (const [key, count] of candidate.entries()) {
		if (typeof count !== 'number') {
			throw new TypeError(
				`Count for key ${String(key)} in multiset at index ${index} must be a number`,
			)
		}
		if (!Number.isInteger(count) || count < 0) {
			throw new RangeError(
				`Count for key ${String(key)} in multiset at index ${index} must be a non-negative integer, got ${count}`,
			)
		}
	}
}

/**
 * Divide-and-conquer recursion across the slice `multisets[start..end)`.
 *
 * @template T
 * @param {Array<Map<T, number>>} multisets
 * @param {number} start
 * @param {number} end
 * @returns {Map<T, number>}
 */
function intersectRange(multisets, start, end) {
	const len = end - start
	if (len === 1) {
		return normalizeMultisetRecursive(multisets[start])
	}
	if (len === 2) {
		return intersectPairRecursive(multisets[start], multisets[start + 1])
	}

	const mid = (start + end) >>> 1
	const left = intersectRange(multisets, start, mid)
	if (left.size === 0) {
		return left
	}
	const right = intersectRange(multisets, mid, end)
	return intersectPairRecursive(left, right)
}

/**
 * Returns a fresh copy of `multiset` with zero-count entries omitted,
 * populated via divide-and-conquer recursion over its entries.
 *
 * @template T
 * @param {Map<T, number>} multiset
 * @returns {Map<T, number>}
 */
function normalizeMultisetRecursive(multiset) {
	const entries = Array.from(multiset.entries())
	const result = new Map()
	normalizeEntriesSlice(entries, 0, entries.length, result)
	return result
}

/**
 * Recursively filters positive-count entries from `entries[lo..hi)` into `result`.
 *
 * @template T
 * @param {Array<[T, number]>} entries
 * @param {number} lo
 * @param {number} hi
 * @param {Map<T, number>} result
 */
function normalizeEntriesSlice(entries, lo, hi, result) {
	if (lo >= hi) {
		return
	}
	if (hi - lo === 1) {
		const [key, count] = entries[lo]
		if (count > 0) {
			result.set(key, count)
		}
		return
	}

	const mid = (lo + hi) >>> 1
	normalizeEntriesSlice(entries, lo, mid, result)
	normalizeEntriesSlice(entries, mid, hi, result)
}

/**
 * Intersects two validated multisets using divide-and-conquer recursion over
 * the entries of the smaller map.
 *
 * @template T
 * @param {Map<T, number>} a
 * @param {Map<T, number>} b
 * @returns {Map<T, number>}
 */
function intersectPairRecursive(a, b) {
	const result = new Map()
	if (a.size === 0 || b.size === 0) {
		return result
	}

	const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a]
	const entries = Array.from(smaller.entries())
	intersectEntriesSlice(entries, 0, entries.length, larger, result)
	return result
}

/**
 * Divide-and-conquer helper over `entries[lo..hi)` checking against `other`.
 *
 * @template T
 * @param {Array<[T, number]>} entries
 * @param {number} lo
 * @param {number} hi
 * @param {Map<T, number>} other
 * @param {Map<T, number>} result
 */
function intersectEntriesSlice(entries, lo, hi, other, result) {
	if (lo >= hi) {
		return
	}
	if (hi - lo === 1) {
		const [key, countA] = entries[lo]
		if (countA > 0 && other.has(key)) {
			const countB = other.get(key)
			if (countB > 0) {
				result.set(key, countA < countB ? countA : countB)
			}
		}
		return
	}

	const mid = (lo + hi) >>> 1
	intersectEntriesSlice(entries, lo, mid, other, result)
	intersectEntriesSlice(entries, mid, hi, other, result)
}
