/**
 * Computes the set difference A \ B (elements in `a` that are not in `b`)
 * over JS `Set` objects using a straightforward iterative implementation.
 *
 * Neither input `Set` is mutated; a new `Set` is always returned.
 *
 * @template T
 * @param {Set<T>} a - The minuend set (A).
 * @param {Set<T>} b - The subtrahend set (B).
 * @returns {Set<T>} A new `Set` containing all elements of `a` not in `b`.
 * @throws {TypeError} If `a` or `b` is not an instance of `Set`.
 */
export function setDifferenceBoolIterative(a, b) {
	if (!(a instanceof Set)) {
		throw new TypeError('Expected first argument "a" to be a Set')
	}
	if (!(b instanceof Set)) {
		throw new TypeError('Expected second argument "b" to be a Set')
	}

	const result = new Set()
	if (a === b || a.size === 0) {
		return result
	}

	for (const value of a) {
		if (!b.has(value)) {
			result.add(value)
		}
	}

	return result
}
