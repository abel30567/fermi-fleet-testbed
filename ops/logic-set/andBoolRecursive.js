/**
 * Computes the logical conjunction (AND) of plain boolean values using a
 * recursive divide-and-conquer strategy.
 *
 * Accepts either variadic plain boolean arguments (`andBoolRecursive(a, b, ...)`)
 * or a single non-empty array of plain booleans (`andBoolRecursive([a, b, ...])`).
 * All elements are strictly validated to be primitive booleans (`typeof v === 'boolean'`)
 * before evaluation so invalid inputs are always rejected regardless of short-circuiting.
 *
 * @param {...(boolean|boolean[])} values - One or more plain booleans, or a single
 *   non-empty array of plain booleans.
 * @returns {boolean} `true` if every provided boolean is `true`; otherwise `false`.
 * @throws {TypeError} If no values are provided, an empty array is provided, or any
 *   element is not a plain boolean (`typeof value !== 'boolean'`).
 */
export function andBoolRecursive(...values) {
	if (values.length === 0) {
		throw new TypeError('andBoolRecursive requires at least one boolean argument')
	}

	const items = values.length === 1 && Array.isArray(values[0]) ? values[0] : values

	if (items.length === 0) {
		throw new TypeError('andBoolRecursive requires a non-empty array of booleans')
	}

	for (let i = 0; i < items.length; i++) {
		if (typeof items[i] !== 'boolean') {
			throw new TypeError(
				`Expected plain boolean at index ${i}, received ${items[i] === null ? 'null' : typeof items[i]}`
			)
		}
	}

	return reduceAndDivideAndConquer(items, 0, items.length - 1)
}

/**
 * Recursively evaluates the logical AND over `items[start..end]` via divide-and-conquer.
 *
 * @param {boolean[]} items - Validated array of plain booleans.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Inclusive end index.
 * @returns {boolean} Conjunction of `items[start..end]`.
 */
function reduceAndDivideAndConquer(items, start, end) {
	if (start === end) {
		return items[start]
	}

	const mid = (start + end) >>> 1
	return (
		reduceAndDivideAndConquer(items, start, mid) &&
		reduceAndDivideAndConquer(items, mid + 1, end)
	)
}
