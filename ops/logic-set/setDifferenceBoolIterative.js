/**
 * Computes the iterative relative complement (set difference) of JavaScript `Set`
 * objects: `A \ B`, or `A \ (B ∪ C ∪ ...)` when additional sets are provided.
 *
 * Iterates over the elements of `a` and collects every element that is not present
 * in `b` nor in any of the optional `rest` sets, using JavaScript `Set` membership
 * semantics (SameValueZero). None of the input sets are mutated, and a new `Set`
 * instance is always returned.
 *
 * @template T
 * @param {Set<T>} a - The minuend set whose elements are filtered.
 * @param {Set<T>} b - The subtrahend set whose elements are excluded from `a`.
 * @param {...Set<T>} rest - Optional additional subtrahend sets to exclude from `a`.
 * @returns {Set<T>} A new `Set` containing elements in `a` that are not in `b` or any set in `rest`.
 * @throws {TypeError} If `a`, `b`, or any argument in `rest` is not an instance of `Set`.
 */
export function setDifferenceBoolIterative(a, b, ...rest) {
	if (!(a instanceof Set)) {
		throw new TypeError('Expected argument "a" to be an instance of Set')
	}
	if (!(b instanceof Set)) {
		throw new TypeError('Expected argument "b" to be an instance of Set')
	}
	for (let i = 0; i < rest.length; i += 1) {
		if (!(rest[i] instanceof Set)) {
			throw new TypeError(`Expected argument at index ${i + 2} to be an instance of Set`)
		}
	}

	const result = new Set()

	for (const item of a) {
		if (b.has(item)) {
			continue
		}

		let excluded = false
		for (let i = 0; i < rest.length; i += 1) {
			if (rest[i].has(item)) {
				excluded = true
				break
			}
		}

		if (!excluded) {
			result.add(item)
		}
	}

	return result
}
