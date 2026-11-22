/**
 * Computes the logical conjunction (AND) of one or more plain boolean values
 * using a straightforward iterative implementation.
 *
 * Every argument is strictly validated to be a primitive boolean
 * (`typeof value === 'boolean'`), ensuring non-boolean values (such as `0`, `1`,
 * `null`, `undefined`, strings, objects, or boxed `Boolean` instances) are rejected
 * even when an earlier operand is `false`.
 *
 * @param {...boolean} values - One or more primitive boolean operands.
 * @returns {boolean} `true` if every operand is `true`; otherwise `false`.
 * @throws {RangeError} If called with zero arguments.
 * @throws {TypeError} If any argument is not a primitive boolean.
 */
export function andBoolIterative(...values) {
	if (values.length === 0) {
		throw new RangeError('andBoolIterative requires at least one boolean argument')
	}

	let result = true
	for (let i = 0; i < values.length; i += 1) {
		const value = values[i]
		if (typeof value !== 'boolean') {
			const actualType = value === null ? 'null' : typeof value
			throw new TypeError(
				`andBoolIterative expects primitive boolean arguments, received ${actualType} at index ${i}`,
			)
		}
		if (!value) {
			result = false
		}
	}

	return result
}
