/**
 * Inserts elements from `items[lo..hi)` into `target` using divide-and-conquer
 * recursion (in-order traversal, O(log n) stack depth).
 *
 * @template T
 * @param {readonly T[]} items
 * @param {number} lo
 * @param {number} hi
 * @param {Set<T>} target
 */
function addSliceDivideAndConquer(items, lo, hi, target) {
	if (lo >= hi) {
		return
	}
	if (hi - lo === 1) {
		target.add(items[lo])
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	addSliceDivideAndConquer(items, lo, mid, target)
	addSliceDivideAndConquer(items, mid, hi, target)
}

/**
 * Creates a fresh copy of a Set by divide-and-conquer over its elements.
 *
 * @template T
 * @param {Set<T>} source
 * @returns {Set<T>}
 */
function cloneSetDivideAndConquer(source) {
	const copy = new Set()
	const items = Array.from(source)
	addSliceDivideAndConquer(items, 0, items.length, copy)
	return copy
}

/**
 * Merges two Sets into a new Set without mutating either input, using
 * divide-and-conquer over each Set's elements.
 *
 * @template T
 * @param {Set<T>} left
 * @param {Set<T>} right
 * @returns {Set<T>}
 */
function mergePairDivideAndConquer(left, right) {
	const merged = new Set()
	const leftItems = Array.from(left)
	const rightItems = Array.from(right)
	addSliceDivideAndConquer(leftItems, 0, leftItems.length, merged)
	addSliceDivideAndConquer(rightItems, 0, rightItems.length, merged)
	return merged
}

/**
 * Recursively computes the union of `sets[lo..hi]` by splitting the range in
 * half and merging the resulting sub-unions.
 *
 * @template T
 * @param {readonly Set<T>[]} sets
 * @param {number} lo
 * @param {number} hi
 * @returns {Set<T>}
 */
function unionRange(sets, lo, hi) {
	if (lo === hi) {
		return cloneSetDivideAndConquer(sets[lo])
	}
	const mid = lo + ((hi - lo) >>> 1)
	const left = unionRange(sets, lo, mid)
	const right = unionRange(sets, mid + 1, hi)
	return mergePairDivideAndConquer(left, right)
}

/**
 * Computes the union of zero or more JS `Set` objects using a recursive
 * divide-and-conquer merge.
 *
 * Multiple sets are recursively split in half until single-set base cases are
 * reached, and pairs of sets are merged into fresh `Set` instances via
 * divide-and-conquer over their elements. None of the input sets are mutated.
 *
 * @template T
 * @param {...Set<T>} sets - One or more JS `Set` instances (zero arguments returns an empty `Set`).
 * @returns {Set<T>} A new `Set` containing every distinct element present in any input `Set`.
 * @throws {TypeError} If any argument is not an instance of `Set`.
 *
 * @example
 * unionBoolRecursive(new Set([1, 2]), new Set([2, 3])) // Set(3) { 1, 2, 3 }
 * unionBoolRecursive(new Set([true]), new Set([false])) // Set(2) { true, false }
 */
export function unionBoolRecursive(...sets) {
	for (let i = 0; i < sets.length; i++) {
		if (!(sets[i] instanceof Set)) {
			const actual = sets[i] === null ? 'null' : typeof sets[i]
			throw new TypeError(
				`unionBoolRecursive: argument at index ${i} must be a Set, received ${actual}`
			)
		}
	}

	if (sets.length === 0) {
		return new Set()
	}

	return unionRange(sets, 0, sets.length - 1)
}
