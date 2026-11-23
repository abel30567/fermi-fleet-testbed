/**
 * Computes the logical NOT of a plain boolean or the set complement of a JS
 * `Set` relative to a universal `Set`, using a straightforward iterative
 * implementation.
 *
 * - When `value` is a plain `boolean`, returns its logical negation (`!value`).
 *   A second `universe` argument must not be supplied in this mode.
 * - When `value` is a `Set`, requires `universe` to be a `Set` and iteratively
 *   collects every element of `universe` not present in `value` (`universe \ value`)
 *   into a new `Set` without mutating either input.
 *
 * @template T
 * @param {boolean | Set<T>} value - Plain boolean to negate, or Set to complement.
 * @param {Set<T>} [universe] - Universal Set required when `value` is a Set.
 * @returns {boolean | Set<T>} Negated boolean or new complement Set.
 * @throws {TypeError} If `value` is neither a plain boolean nor a Set, if
 *   `universe` is provided for a boolean `value`, or if `universe` is missing
 *   or not a Set when `value` is a Set.
 */
export function notBoolIterative(value, universe) {
	if (typeof value === 'boolean') {
		if (universe !== undefined) {
			throw new TypeError(
				'notBoolIterative: universe argument is not allowed when value is a boolean',
			)
		}
		return !value
	}

	if (value instanceof Set) {
		if (!(universe instanceof Set)) {
			throw new TypeError(
				'notBoolIterative: universe must be a Set when value is a Set',
			)
		}

		const complement = new Set()
		for (const item of universe) {
			if (!value.has(item)) {
				complement.add(item)
			}
		}
		return complement
	}

	throw new TypeError(
		'notBoolIterative: value must be a plain boolean or a Set',
	)
}
