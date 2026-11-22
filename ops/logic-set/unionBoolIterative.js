/**
 * Computes the set union of one or more JavaScript `Set` instances using a
 * straightforward iterative approach.
 *
 * Iterates over each input `Set` in order and inserts every element into a
 * newly allocated `Set` without mutating any of the input sets. Preserves
 * standard JavaScript `Set` (SameValueZero) equality semantics, supporting
 * plain booleans, primitives, `NaN`, and object references.
 *
 * @template T
 * @param {...Set<T>} sets - One or more `Set` instances to union (typically two or more).
 * @returns {Set<T>} A new `Set` containing all distinct elements present in any input `Set`.
 * @throws {TypeError} If fewer than one argument is provided or any argument is not an instance of `Set`.
 *
 * @example
 * const a = new Set([true])
 * const b = new Set([false])
 * unionBoolIterative(a, b) // Set(2) { true, false }
 */
export function unionBoolIterative(...sets) {
	if (sets.length < 1) {
		throw new TypeError('unionBoolIterative requires at least one Set argument')
	}

	for (let i = 0; i < sets.length; i++) {
		if (!(sets[i] instanceof Set)) {
			throw new TypeError(`Argument at index ${i} must be an instance of Set`)
		}
	}

	const result = new Set()
	for (let i = 0; i < sets.length; i++) {
		for (const item of sets[i]) {
			result.add(item)
		}
	}
	return result
}
