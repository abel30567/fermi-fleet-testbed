/**
 * Computes the n-ary exclusive OR (parity XOR) over plain booleans or the n-ary
 * symmetric difference over JavaScript `Set` objects using a recursive
 * divide-and-conquer algorithm.
 *
 * Supported signatures:
 * - `xorBoolRecursive(...booleans)`: variadic plain booleans (`boolean[]`, at least 1).
 *   Returns `true` if and only if an odd number of inputs are `true`.
 * - `xorBoolRecursive(booleansArray)`: a single non-empty array of plain booleans.
 *   Returns `true` if and only if an odd number of elements are `true`.
 * - `xorBoolRecursive(...sets)`: variadic `Set` instances (`Set[]`, at least 1).
 *   Returns a new `Set` containing elements present in an odd number of input sets.
 * - `xorBoolRecursive(setsArray)`: a single non-empty array of `Set` instances.
 *   Returns a new `Set` containing elements present in an odd number of input sets.
 *
 * Input sets are never mutated. Mixing booleans and `Set` instances, passing no
 * arguments, passing an empty array, or passing any value that is neither a
 * primitive `boolean` nor a `Set` instance throws a `TypeError`.
 *
 * @param {...(boolean|Set|Array<boolean>|Array<Set>)} args - One or more plain
 *   booleans, one or more `Set` instances, or a single non-empty array of either.
 * @returns {boolean|Set<*>} Parity XOR boolean for boolean inputs, or a new
 *   symmetric-difference `Set` for `Set` inputs.
 * @throws {TypeError} If inputs are missing, empty, mixed, or contain invalid types.
 */
export function xorBoolRecursive(...args) {
	if (args.length === 0) {
		throw new TypeError('xorBoolRecursive requires at least one boolean or Set argument')
	}

	const items = args.length === 1 && Array.isArray(args[0]) ? args[0] : args

	if (items.length === 0) {
		throw new TypeError('xorBoolRecursive input array must not be empty')
	}

	const first = items[0]

	if (typeof first === 'boolean') {
		for (let i = 1; i < items.length; i += 1) {
			if (typeof items[i] !== 'boolean') {
				throw new TypeError(
					`xorBoolRecursive expected all boolean inputs, received ${describeType(items[i])} at index ${i}`
				)
			}
		}
		return xorBoolRange(items, 0, items.length)
	}

	if (first instanceof Set) {
		for (let i = 1; i < items.length; i += 1) {
			if (!(items[i] instanceof Set)) {
				throw new TypeError(
					`xorBoolRecursive expected all Set inputs, received ${describeType(items[i])} at index ${i}`
				)
			}
		}
		return xorSetRange(items, 0, items.length)
	}

	throw new TypeError(
		`xorBoolRecursive expected plain boolean or Set inputs, received ${describeType(first)} at index 0`
	)
}

/**
 * Recursively computes parity XOR over `items[start..end)` using divide-and-conquer.
 *
 * @param {readonly boolean[]} items
 * @param {number} start
 * @param {number} end
 * @returns {boolean}
 */
function xorBoolRange(items, start, end) {
	const length = end - start
	if (length === 1) {
		return items[start]
	}
	if (length === 2) {
		return items[start] !== items[start + 1]
	}
	const mid = start + Math.floor(length / 2)
	const left = xorBoolRange(items, start, mid)
	const right = xorBoolRange(items, mid, end)
	return left !== right
}

/**
 * Recursively computes n-ary symmetric difference over `sets[start..end)` using
 * divide-and-conquer.
 *
 * @param {readonly Set<*>[]} sets
 * @param {number} start
 * @param {number} end
 * @returns {Set<*>}
 */
function xorSetRange(sets, start, end) {
	const length = end - start
	if (length === 1) {
		return new Set(sets[start])
	}
	if (length === 2) {
		return symmetricDiffPair(sets[start], sets[start + 1])
	}
	const mid = start + Math.floor(length / 2)
	const left = xorSetRange(sets, start, mid)
	const right = xorSetRange(sets, mid, end)
	return symmetricDiffPair(left, right)
}

/**
 * Computes the symmetric difference of two `Set` instances without mutating either.
 *
 * @param {Set<*>} left
 * @param {Set<*>} right
 * @returns {Set<*>}
 */
function symmetricDiffPair(left, right) {
	const result = new Set()
	for (const value of left) {
		if (!right.has(value)) {
			result.add(value)
		}
	}
	for (const value of right) {
		if (!left.has(value)) {
			result.add(value)
		}
	}
	return result
}

/**
 * Returns a human-readable type label for validation error messages.
 *
 * @param {*} value
 * @returns {string}
 */
function describeType(value) {
	if (value === null) {
		return 'null'
	}
	if (Array.isArray(value)) {
		return 'Array'
	}
	if (value instanceof Boolean) {
		return 'Boolean object'
	}
	if (value instanceof Set) {
		return 'Set'
	}
	return typeof value
}
