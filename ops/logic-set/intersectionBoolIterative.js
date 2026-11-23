/**
 * Computes the set intersection of two JavaScript `Set` objects using a
 * straightforward iterative algorithm.
 *
 * Returns a new `Set` containing all elements present in both `a` and `b`
 * (using standard `Set` SameValueZero equality). Neither input set is mutated.
 *
 * @template T
 * @param {Set<T>} a - The first input set.
 * @param {Set<T>} b - The second input set.
 * @returns {Set<T>} A new `Set` containing elements common to both `a` and `b`.
 * @throws {TypeError} If either `a` or `b` is not a `Set` instance.
 */
export function intersectionBoolIterative(a, b) {
	if (!(a instanceof Set)) {
		throw new TypeError('First argument must be a Set')
	}
	if (!(b instanceof Set)) {
		throw new TypeError('Second argument must be a Set')
	}

	const smaller = a.size <= b.size ? a : b
	const larger = a.size <= b.size ? b : a
	const result = new Set()

	for (const value of smaller) {
		if (larger.has(value)) {
			result.add(value)
		}
	}

	return result
}
