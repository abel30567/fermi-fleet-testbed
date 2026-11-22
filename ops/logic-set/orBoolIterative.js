/**
 * Computes the logical disjunction (OR) of one or more plain boolean values
 * using a straightforward iterative implementation.
 *
 * Every argument is strictly validated to be a primitive boolean
 * (`typeof value === 'boolean'`), ensuring non-boolean values are rejected
 * regardless of position.
 *
 * @param {...boolean} values - One or more plain boolean values to disjoin.
 * @returns {boolean} `true` if at least one argument is `true`; otherwise `false`.
 * @throws {RangeError} If called with no arguments.
 * @throws {TypeError} If any argument is not a plain primitive boolean.
 */
export function orBoolIterative(...values) {
	if (values.length === 0) {
		throw new RangeError('orBoolIterative requires at least one boolean argument')
	}

	let result = false
	for (let i = 0; i < values.length; i += 1) {
		const value = values[i]
		if (typeof value !== 'boolean') {
			const received = value === null ? 'null' : typeof value
			throw new TypeError(
				`orBoolIterative expected argument at index ${i} to be a boolean, received ${received}`,
			)
		}
		if (value) {
			result = true
		}
	}

	return result
}
