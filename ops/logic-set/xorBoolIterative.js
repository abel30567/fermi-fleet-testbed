/**
 * Computes the logical XOR (for plain booleans) or symmetric difference
 * (for JS `Set` instances) across one or more inputs using an iterative
 * algorithm.
 *
 * - When given plain booleans (`typeof v === 'boolean'`), returns `true` iff
 *   an odd number of arguments are `true`.
 * - When given `Set` instances, returns a new `Set` containing elements that
 *   appear in an odd number of the input sets, without mutating any input set.
 *
 * All arguments must be of the same kind (either all plain booleans or all
 * `Set` instances).
 *
 * @overload
 * @param {...boolean} inputs - One or more plain boolean values.
 * @returns {boolean} Logical XOR across all input booleans.
 *
 * @overload
 * @template T
 * @param {...Set<T>} inputs - One or more `Set` instances.
 * @returns {Set<T>} Symmetric difference across all input sets.
 *
 * @throws {TypeError} If no arguments are provided, if any argument is neither
 *   a plain boolean nor a `Set`, or if boolean and `Set` arguments are mixed.
 */
export function xorBoolIterative(...inputs) {
	if (inputs.length === 0) {
		throw new TypeError('xorBoolIterative requires at least one argument')
	}

	const first = inputs[0]

	if (typeof first === 'boolean') {
		let result = false
		for (let i = 0; i < inputs.length; i++) {
			const value = inputs[i]
			if (typeof value !== 'boolean') {
				throw new TypeError(
					`Expected all arguments to be plain booleans; argument at index ${i} has type ${typeof value}`,
				)
			}
			result = result !== value
		}
		return result
	}

	if (first instanceof Set) {
		for (let i = 1; i < inputs.length; i++) {
			if (!(inputs[i] instanceof Set)) {
				throw new TypeError(
					`Expected all arguments to be Set instances; argument at index ${i} is not a Set`,
				)
			}
		}

		const result = new Set()
		for (let i = 0; i < inputs.length; i++) {
			for (const item of inputs[i]) {
				if (result.has(item)) {
					result.delete(item)
				} else {
					result.add(item)
				}
			}
		}
		return result
	}

	throw new TypeError(
		`Arguments must be either plain booleans or Set instances; received ${first === null ? 'null' : typeof first}`,
	)
}
