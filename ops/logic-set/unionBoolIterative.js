/**
 * Computes the union over plain booleans (logical OR) or JS `Set` objects
 * using a straightforward iterative implementation.
 *
 * When given `Set` instances, returns a new `Set` containing all elements
 * present in at least one input set, without mutating any input set.
 * When given plain booleans, returns `true` if at least one input is `true`,
 * and `false` otherwise.
 *
 * All arguments must share the same supported type (all `Set` instances or all
 * `boolean` primitives), and at least two arguments must be provided.
 *
 * @template T
 * @overload
 * @param {Set<T>} a - First input set.
 * @param {Set<T>} b - Second input set.
 * @param {...Set<T>} rest - Optional additional input sets.
 * @returns {Set<T>} A new `Set` representing the union of all input sets.
 *
 * @overload
 * @param {boolean} a - First boolean value.
 * @param {boolean} b - Second boolean value.
 * @param {...boolean} rest - Optional additional boolean values.
 * @returns {boolean} The logical union (disjunction) of all input booleans.
 *
 * @throws {TypeError} If fewer than two arguments are provided, if any argument
 *   is neither a `Set` nor a `boolean`, or if `Set` and `boolean` inputs are mixed.
 */
export function unionBoolIterative(a, b, ...rest) {
	const inputs = [a, b, ...rest];

	if (a instanceof Set) {
		for (let i = 1; i < inputs.length; i++) {
			if (!(inputs[i] instanceof Set)) {
				throw new TypeError(
					`Expected argument at index ${i} to be a Set when the first argument is a Set`,
				);
			}
		}

		const result = new Set();
		for (let i = 0; i < inputs.length; i++) {
			for (const value of inputs[i]) {
				result.add(value);
			}
		}
		return result;
	}

	if (typeof a === 'boolean') {
		for (let i = 1; i < inputs.length; i++) {
			if (typeof inputs[i] !== 'boolean') {
				throw new TypeError(
					`Expected argument at index ${i} to be a boolean when the first argument is a boolean`,
				);
			}
		}

		let result = false;
		for (let i = 0; i < inputs.length; i++) {
			if (inputs[i]) {
				result = true;
			}
		}
		return result;
	}

	throw new TypeError('Expected arguments to be either all Set instances or all booleans');
}
