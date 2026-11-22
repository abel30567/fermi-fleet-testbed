/**
 * Computes the logical negation (NOT) of a plain boolean or iteratively
 * negates every element in an array of plain booleans without mutating the
 * input array.
 *
 * Strictly validates inputs so that truthy/falsy non-boolean values (such as
 * `0`, `1`, `''`, `null`, `undefined`, or boxed `Boolean` objects) are
 * rejected with a {@link TypeError}.
 *
 * @param {boolean | boolean[]} value - A plain boolean or an array of plain booleans.
 * @returns {boolean | boolean[]} The negated boolean, or a new array containing the negated booleans.
 * @throws {TypeError} If `value` is neither a plain boolean nor an array composed exclusively of plain booleans.
 */
export function notBoolIterative(value) {
	if (typeof value === 'boolean') {
		return !value
	}

	if (Array.isArray(value)) {
		const result = new Array(value.length)
		for (let i = 0; i < value.length; i += 1) {
			const item = value[i]
			if (typeof item !== 'boolean') {
				throw new TypeError(
					`notBoolIterative expected boolean at index ${i}, received ${item === null ? 'null' : typeof item}`
				)
			}
			result[i] = !item
		}
		return result
	}

	throw new TypeError(
		`notBoolIterative expected a boolean or an array of booleans, received ${value === null ? 'null' : typeof value}`
	)
}
