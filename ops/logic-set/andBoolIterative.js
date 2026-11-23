/**
 * Computes the logical AND (conjunction) over plain booleans using a
 * straightforward iterative loop.
 *
 * Accepts either:
 * - A single `Array` or `Set` of plain `boolean` values (an empty collection
 *   returns the identity element `true`), or
 * - One or more plain `boolean` arguments.
 *
 * Every element is strictly validated to be a primitive `boolean`; non-boolean
 * values (including truthy/falsy primitives and `Boolean` wrapper objects)
 * throw a `TypeError`.
 *
 * @param {boolean | boolean[] | Set<boolean>} first - First boolean, or an Array/Set of booleans.
 * @param {...boolean} rest - Additional plain boolean arguments when `first` is a boolean.
 * @returns {boolean} `true` if every input boolean is `true`, otherwise `false`.
 * @throws {TypeError} If no arguments are provided, if the container is invalid,
 *   or if any element is not a plain boolean.
 */
export function andBoolIterative(first, ...rest) {
	if (arguments.length === 0) {
		throw new TypeError(
			'andBoolIterative requires at least one boolean argument or an Array/Set of booleans',
		)
	}

	if (Array.isArray(first) || first instanceof Set) {
		if (rest.length > 0) {
			throw new TypeError(
				'andBoolIterative accepts either a single Array/Set of booleans or variadic boolean arguments, not both',
			)
		}

		let result = true
		if (Array.isArray(first)) {
			for (let i = 0; i < first.length; i += 1) {
				const value = first[i]
				if (typeof value !== 'boolean') {
					throw new TypeError(
						`Expected plain boolean at index ${i}, received ${value === null ? 'null' : typeof value}`,
					)
				}
				if (!value) {
					result = false
				}
			}
		} else {
			let index = 0
			for (const value of first) {
				if (typeof value !== 'boolean') {
					throw new TypeError(
						`Expected plain boolean in Set at position ${index}, received ${value === null ? 'null' : typeof value}`,
					)
				}
				if (!value) {
					result = false
				}
				index += 1
			}
		}
		return result
	}

	if (typeof first !== 'boolean') {
		throw new TypeError(
			`Expected plain boolean or Array/Set of booleans, received ${first === null ? 'null' : typeof first}`,
		)
	}

	let result = first
	for (let i = 0; i < rest.length; i += 1) {
		const value = rest[i]
		if (typeof value !== 'boolean') {
			throw new TypeError(
				`Expected plain boolean at argument ${i + 1}, received ${value === null ? 'null' : typeof value}`,
			)
		}
		if (!value) {
			result = false
		}
	}
	return result
}
