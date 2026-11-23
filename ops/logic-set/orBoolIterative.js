/**
 * Computes the logical OR (disjunction) over plain boolean values, an array of
 * booleans, or a JS `Set` of booleans using a straightforward iterative loop.
 *
 * Accepts:
 * - Zero arguments: returns `false` (the identity element for logical OR).
 * - A single `boolean`: returns that boolean.
 * - A single `Array<boolean>` or `Set<boolean>`: iterates through all elements,
 *   validates that every element is a boolean, and returns `true` if at least
 *   one element is `true` (or `false` if empty or all elements are `false`).
 * - Two or more `boolean` arguments: iterates through all arguments, validates
 *   each is a boolean, and returns `true` if at least one is `true`.
 *
 * All elements are validated even if `true` has already been encountered, so
 * invalid trailing inputs always throw a `TypeError`.
 *
 * @param {...(boolean | boolean[] | Set<boolean>)} inputs - Boolean values, or
 *   a single Array or Set of booleans.
 * @returns {boolean} `true` if any input boolean is `true`, otherwise `false`.
 * @throws {TypeError} If any input is not a boolean (or when passing a single
 *   collection, if any element of the Array or Set is not a boolean).
 */
export function orBoolIterative(...inputs) {
	if (inputs.length === 0) {
		return false
	}

	if (inputs.length === 1) {
		const single = inputs[0]

		if (typeof single === 'boolean') {
			return single
		}

		if (Array.isArray(single)) {
			let result = false
			for (let i = 0; i < single.length; i += 1) {
				if (!(i in single) || typeof single[i] !== 'boolean') {
					throw new TypeError(
						`Expected boolean at index ${i}, received ${
							!(i in single) ? 'empty slot' : typeof single[i]
						}`,
					)
				}
				if (single[i]) {
					result = true
				}
			}
			return result
		}

		if (single instanceof Set) {
			let result = false
			for (const value of single) {
				if (typeof value !== 'boolean') {
					throw new TypeError(
						`Expected boolean element in Set, received ${typeof value}`,
					)
				}
				if (value) {
					result = true
				}
			}
			return result
		}

		throw new TypeError(
			`Expected a boolean, Array of booleans, or Set of booleans, received ${
				single === null ? 'null' : typeof single
			}`,
		)
	}

	let result = false
	for (let i = 0; i < inputs.length; i += 1) {
		const value = inputs[i]
		if (typeof value !== 'boolean') {
			throw new TypeError(
				`Expected boolean at argument ${i}, received ${
					value === null ? 'null' : typeof value
				}`,
			)
		}
		if (value) {
			result = true
		}
	}
	return result
}
