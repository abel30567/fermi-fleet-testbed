/**
 * Recursive divide-and-conquer logical NOT / set complement over plain booleans,
 * arrays of plain booleans, and JS `Set` objects.
 *
 * Supported signatures:
 * 1. `notBoolRecursive(value, times = 1)`
 *    - `value`: plain `boolean`
 *    - `times`: optional non-negative safe integer (default `1`). Computes the
 *      `times`-fold logical negation using O(log n) divide-and-conquer involution.
 *    - Returns: `boolean`
 *
 * 2. `notBoolRecursive(values, times = 1)`
 *    - `values`: `Array<boolean>` (every element must be a plain `boolean`; sparse
 *      arrays or non-boolean elements throw `TypeError`)
 *    - `times`: optional non-negative safe integer (default `1`)
 *    - Returns: a new `Array<boolean>` with each element negated `times` times via
 *      divide-and-conquer splitting.
 *
 * 3. `notBoolRecursive(set, universe)`
 *    - `set`: `Set<T>`
 *    - `universe`: `Set<T>` (required; defines the domain for the complement `universe \ set`)
 *    - Returns: a new `Set<T>` containing all elements of `universe` not present in `set`,
 *      computed via divide-and-conquer over the universe elements.
 *
 * @template T
 * @param {boolean | boolean[] | Set<T>} input - Plain boolean, array of plain booleans, or `Set`.
 * @param {number | Set<T>} [secondArg] - Repetition count (for boolean / boolean[]) or universe `Set` (for `Set`).
 * @returns {boolean | boolean[] | Set<T>} Negated boolean, negated boolean array, or set complement.
 * @throws {TypeError} If `input` or `secondArg` does not match one of the supported types,
 *   if an array contains any non-boolean element, or if `universe` is missing/not a `Set`.
 * @throws {RangeError} If `times` is negative or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function notBoolRecursive(input, secondArg) {
	if (typeof input === 'boolean') {
		const times = validateTimes(secondArg)
		return computeFlipParity(times) ? !input : input
	}

	if (Array.isArray(input)) {
		const times = validateTimes(secondArg)
		const shouldFlip = computeFlipParity(times)
		const result = new Array(input.length)
		negateArrayDivideAndConquer(input, result, 0, input.length, shouldFlip)
		return result
	}

	if (input instanceof Set) {
		if (!(secondArg instanceof Set)) {
			throw new TypeError('Set complement requires a Set as the second argument (universe)')
		}
		const universeItems = Array.from(secondArg)
		const result = new Set()
		complementSetDivideAndConquer(universeItems, input, 0, universeItems.length, result)
		return result
	}

	throw new TypeError('Input must be a plain boolean, an Array of plain booleans, or a Set')
}

/**
 * Validates the optional repetition count `times` for boolean / boolean-array negation.
 *
 * @param {unknown} times
 * @returns {number}
 */
function validateTimes(times) {
	if (times === undefined) {
		return 1
	}
	if (typeof times !== 'number' || !Number.isInteger(times)) {
		throw new TypeError('Negation count must be an integer')
	}
	if (times < 0 || !Number.isSafeInteger(times)) {
		throw new RangeError('Negation count must be a non-negative safe integer')
	}
	return times
}

/**
 * Computes whether applying logical NOT `n` times flips the boolean value,
 * using divide-and-conquer over the involution group Z/2Z in O(log n) steps.
 *
 * @param {number} n - Non-negative safe integer.
 * @returns {boolean} `true` if `n` negations flip the value, `false` if identity.
 */
function computeFlipParity(n) {
	if (n === 0) {
		return false
	}
	if (n === 1) {
		return true
	}
	const half = Math.floor(n / 2)
	const halfFlip = computeFlipParity(half)
	const evenFlip = halfFlip !== halfFlip
	return n % 2 === 1 ? !evenFlip : evenFlip
}

/**
 * Recursively negates `source[start..end)` into `target` using divide-and-conquer.
 *
 * @param {boolean[]} source
 * @param {boolean[]} target
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {boolean} shouldFlip
 */
function negateArrayDivideAndConquer(source, target, start, end, shouldFlip) {
	if (start >= end) {
		return
	}
	if (end - start === 1) {
		if (!(start in source) || typeof source[start] !== 'boolean') {
			throw new TypeError(`Expected plain boolean at index ${start}`)
		}
		target[start] = shouldFlip ? !source[start] : source[start]
		return
	}
	const mid = start + Math.floor((end - start) / 2)
	negateArrayDivideAndConquer(source, target, start, mid, shouldFlip)
	negateArrayDivideAndConquer(source, target, mid, end, shouldFlip)
}

/**
 * Recursively computes `universe \ excludeSet` over `universeItems[start..end)`
 * using divide-and-conquer, inserting matching items into `result` in order.
 *
 * @template T
 * @param {T[]} universeItems
 * @param {Set<T>} excludeSet
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {Set<T>} result
 */
function complementSetDivideAndConquer(universeItems, excludeSet, start, end, result) {
	if (start >= end) {
		return
	}
	if (end - start === 1) {
		const item = universeItems[start]
		if (!excludeSet.has(item)) {
			result.add(item)
		}
		return
	}
	const mid = start + Math.floor((end - start) / 2)
	complementSetDivideAndConquer(universeItems, excludeSet, start, mid, result)
	complementSetDivideAndConquer(universeItems, excludeSet, mid, end, result)
}
