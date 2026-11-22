/**
 * Computes the set intersection of one or more JavaScript `Set` objects using
 * a recursive divide-and-conquer strategy.
 *
 * Divide-and-conquer is applied at two levels without mutating any input sets:
 * 1. Across multiple sets: the input list is recursively split into left and
 *    right halves (`O(log k)` stack depth) and their intersections are combined,
 *    short-circuiting when a half yields an empty set.
 * 2. Across elements of two sets: elements of the smaller set are partitioned
 *    recursively into halves (`O(log min(|A|, |B|))` stack depth) and checked
 *    against the larger set via `Set.prototype.has` (SameValueZero equality).
 *
 * @template T
 * @param {...Set<T>} sets - One or more `Set` instances to intersect.
 * @returns {Set<T>} A new `Set` containing only elements present in every input `Set`.
 * @throws {TypeError} If no arguments are provided or any argument is not a `Set`.
 */
export function intersectionBoolRecursive(...sets) {
	if (sets.length === 0) {
		throw new TypeError('intersectionBoolRecursive requires at least one Set argument')
	}

	for (let i = 0; i < sets.length; i += 1) {
		if (!(sets[i] instanceof Set)) {
			throw new TypeError(`Expected argument at index ${i} to be a Set`)
		}
	}

	if (sets.length === 1) {
		return intersectTwoSets(sets[0], sets[0])
	}

	return intersectSetRange(sets, 0, sets.length)
}

/**
 * Recursively intersects a contiguous slice `sets[start..end)` using
 * divide-and-conquer.
 *
 * @template T
 * @param {Array<Set<T>>} sets
 * @param {number} start
 * @param {number} end
 * @returns {Set<T>}
 */
function intersectSetRange(sets, start, end) {
	const count = end - start
	if (count === 1) {
		return sets[start]
	}
	if (count === 2) {
		return intersectTwoSets(sets[start], sets[start + 1])
	}

	const mid = start + (count >> 1)
	const left = intersectSetRange(sets, start, mid)
	if (left.size === 0) {
		return new Set()
	}

	const right = intersectSetRange(sets, mid, end)
	if (right.size === 0) {
		return new Set()
	}

	return intersectTwoSets(left, right)
}

/**
 * Computes the intersection of two `Set` objects by recursively partitioning
 * the elements of the smaller set and testing membership in the larger set.
 *
 * @template T
 * @param {Set<T>} setA
 * @param {Set<T>} setB
 * @returns {Set<T>}
 */
function intersectTwoSets(setA, setB) {
	const smaller = setA.size <= setB.size ? setA : setB
	const larger = setA.size <= setB.size ? setB : setA

	const result = new Set()
	if (smaller.size === 0) {
		return result
	}

	const items = Array.from(smaller)
	collectMatchesRecursive(items, 0, items.length, larger, result)
	return result
}

/**
 * Recursively partitions `items[start..end)` and adds elements present in
 * `lookup` into `target`.
 *
 * @template T
 * @param {T[]} items
 * @param {number} start
 * @param {number} end
 * @param {Set<T>} lookup
 * @param {Set<T>} target
 */
function collectMatchesRecursive(items, start, end, lookup, target) {
	const count = end - start
	if (count <= 0) {
		return
	}
	if (count === 1) {
		const value = items[start]
		if (lookup.has(value)) {
			target.add(value)
		}
		return
	}

	const mid = start + (count >> 1)
	collectMatchesRecursive(items, start, mid, lookup, target)
	collectMatchesRecursive(items, mid, end, lookup, target)
}
