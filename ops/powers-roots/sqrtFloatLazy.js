/**
 * Lazily computes the IEEE-754 float64 square root of each number in an iterable.
 *
 * Returns a generator that pulls elements one at a time from `values` without
 * materializing the input sequence, enabling streaming over large or infinite
 * iterables. Follows IEEE-754 `squareRoot` semantics:
 * - `+0` -> `+0`, `-0` -> `-0` (sign of zero preserved)
 * - `+Infinity` -> `+Infinity`
 * - negative numbers, `-Infinity`, and `NaN` -> `NaN`
 *
 * Input validation is performed eagerly on `values` (throwing immediately if
 * `values` is not a non-string iterable) and lazily on each yielded element
 * (throwing a `TypeError` when a non-number element is encountered).
 *
 * @param {Iterable<number>} values - A non-string iterable yielding IEEE-754 float64 `number` values.
 * @returns {Generator<number, void, undefined>} A lazy generator yielding the square root of each input number.
 * @throws {TypeError} Eagerly if `values` is not a non-string iterable.
 * @throws {TypeError} Lazily while iterating if any element is not of type `'number'`.
 *
 * @example
 * const roots = sqrtFloatLazy([0, 4, 9])
 * [...roots] // [0, 2, 3]
 */
export function sqrtFloatLazy(values) {
	if (
		values === null ||
		(typeof values !== 'object' && typeof values !== 'function') ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`sqrtFloatLazy expects a non-string iterable of numbers, got ${describeType(values)}`
		)
	}

	return sqrtFloatGenerator(values)
}

/**
 * Internal generator performing lazy element validation and IEEE-754 square root.
 *
 * @param {Iterable<number>} values
 * @returns {Generator<number, void, undefined>}
 */
function* sqrtFloatGenerator(values) {
	let index = 0
	for (const value of values) {
		if (typeof value !== 'number') {
			throw new TypeError(
				`sqrtFloatLazy expected a number at index ${index}, got ${describeType(value)}`
			)
		}
		index += 1
		yield Math.sqrt(value)
	}
}

/**
 * Formats a concise type description for validation error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
	if (value === null) return 'null'
	if (Array.isArray(value)) return 'Array'
	if (typeof value === 'object') {
		const tag = value.constructor?.name
		return tag ? `object (${tag})` : 'object'
	}
	return typeof value
}
