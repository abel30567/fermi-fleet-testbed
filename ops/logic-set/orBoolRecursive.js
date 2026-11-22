/**
 * Recursively computes the logical OR of `values[low..high]` using
 * divide-and-conquer splitting, keeping call-stack depth at O(log n).
 *
 * @param {boolean[]} values - Validated non-empty array of plain booleans.
 * @param {number} low - Inclusive lower index.
 * @param {number} high - Inclusive upper index.
 * @returns {boolean} Logical disjunction of `values[low..high]`.
 */
function orDivideAndConquer(values, low, high) {
	if (low === high) {
		return values[low]
	}

	const mid = (low + high) >>> 1
	return (
		orDivideAndConquer(values, low, mid) ||
		orDivideAndConquer(values, mid + 1, high)
	)
}

/**
 * Computes the logical OR (disjunction) over one or more plain booleans using
 * a recursive divide-and-conquer algorithm.
 *
 * Accepts either variadic plain boolean arguments (`orBoolRecursive(a, b, ...)`)
 * or a single non-empty array of plain booleans (`orBoolRecursive([a, b, ...])`).
 * All inputs are strictly validated up front; any missing, empty, or non-boolean
 * input throws a `TypeError`.
 *
 * @param {...(boolean | boolean[])} args - One or more plain booleans, or a single non-empty array of plain booleans.
 * @returns {boolean} `true` if at least one input is `true`, otherwise `false`.
 * @throws {TypeError} If called with no arguments, an empty array, or any non-boolean value.
 */
export function orBoolRecursive(...args) {
	if (args.length === 0) {
		throw new TypeError(
			'orBoolRecursive requires at least one boolean argument or a non-empty array of booleans'
		)
	}

	const values = args.length === 1 && Array.isArray(args[0]) ? args[0] : args

	if (values.length === 0) {
		throw new TypeError(
			'orBoolRecursive requires at least one boolean argument or a non-empty array of booleans'
		)
	}

	for (let i = 0; i < values.length; i++) {
		if (typeof values[i] !== 'boolean') {
			const actual = values[i] === null ? 'null' : typeof values[i]
			throw new TypeError(
				`orBoolRecursive expects plain booleans; received ${actual} at index ${i}`
			)
		}
	}

	return orDivideAndConquer(values, 0, values.length - 1)
}
