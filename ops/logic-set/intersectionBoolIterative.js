/**
 * Computes the set intersection of one or more JavaScript `Set` instances using
 * a straightforward iterative approach.
 *
 * Elements are checked for membership using `Set.prototype.has` (SameValueZero
 * semantics, so `NaN` matches `NaN` and `-0` matches `+0`). None of the input
 * sets are mutated; a new `Set` instance is always returned.
 *
 * @template T
 * @param {...Set<T>} sets - One or more `Set` instances to intersect.
 * @returns {Set<T>} A new `Set` containing only the elements present in every
 *   provided input `Set`, preserving the iteration order of the first set.
 * @throws {TypeError} If no arguments are provided or if any argument is not
 *   an instance of `Set`.
 */
export function intersectionBoolIterative(...sets) {
	if (sets.length === 0) {
		throw new TypeError('intersectionBoolIterative requires at least one Set argument')
	}

	for (let i = 0; i < sets.length; i++) {
		if (!(sets[i] instanceof Set)) {
			throw new TypeError(`Argument at index ${i} must be an instance of Set`)
		}
	}

	const result = new Set()

	for (let i = 0; i < sets.length; i++) {
		if (sets[i].size === 0) {
			return result
		}
	}

	const first = sets[0]

	for (const value of first) {
		let inAll = true
		for (let i = 1; i < sets.length; i++) {
			if (!sets[i].has(value)) {
				inAll = false
				break
			}
		}
		if (inAll) {
			result.add(value)
		}
	}

	return result
}
