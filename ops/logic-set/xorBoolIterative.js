/**
 * Computes the variadic logical exclusive-OR (XOR / odd parity) over one or
 * more plain boolean primitives using a straightforward iterative loop.
 *
 * Returns `true` if and only if an odd number of arguments are `true`.
 * Every argument is strictly validated to be a boolean primitive (`typeof v === 'boolean'`);
 * truthy/falsy non-booleans (such as `0`, `1`, `''`, `null`, `undefined`, or boxed `new Boolean(...)`)
 * are rejected with a `TypeError`.
 *
 * @param {...boolean} values - One or more plain boolean primitives to XOR together.
 * @returns {boolean} `true` if an odd number of inputs are `true`, otherwise `false`.
 * @throws {TypeError} If called with no arguments or if any argument is not a boolean primitive.
 * @example
 * xorBoolIterative(true, false) // => true
 * xorBoolIterative(true, true) // => false
 * xorBoolIterative(true, false, true, true) // => true
 */
export function xorBoolIterative(...values) {
	if (values.length === 0) {
		throw new TypeError('xorBoolIterative requires at least one boolean argument')
	}

	let parity = false
	for (let i = 0; i < values.length; i += 1) {
		const value = values[i]
		if (typeof value !== 'boolean') {
			const actualType = value === null ? 'null' : typeof value
			throw new TypeError(
				`xorBoolIterative expected boolean at argument index ${i}, received ${actualType}`,
			)
		}
		if (value) {
			parity = !parity
		}
	}

	return parity
}
