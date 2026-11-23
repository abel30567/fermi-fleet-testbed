/**
 * Lazily computes the IEEE-754 float64 cube root (`cbrt`) of each number in an
 * iterable sequence, yielding results one by one via a generator.
 *
 * Validation of the iterable argument occurs eagerly when `cbrtFloatLazy` is
 * called, while individual elements are pulled and validated on demand so
 * infinite or large streaming sequences can be consumed without buffering.
 *
 * Special IEEE-754 values are preserved per ECMAScript `Math.cbrt`:
 * - `+0` -> `+0`, `-0` -> `-0`
 * - `+Infinity` -> `+Infinity`, `-Infinity` -> `-Infinity`
 * - `NaN` -> `NaN`
 * - Negative finite numbers return their real negative cube root.
 *
 * @param {Iterable<number>} values - An iterable sequence of IEEE-754 float64
 *   primitive `number` values (strings and non-iterables are rejected).
 * @returns {Generator<number, void, undefined>} A lazy generator yielding the
 *   float64 cube root of each input number.
 * @throws {TypeError} If `values` is not a valid non-string iterable, or when
 *   iteration encounters a non-`number` element.
 */
export function cbrtFloatLazy(values) {
	if (
		values === null ||
		values === undefined ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`cbrtFloatLazy expected a non-string Iterable<number>, received ${describeValue(values)}`
		)
	}

	return (function* cbrtStream() {
		let index = 0
		for (const value of values) {
			if (typeof value !== 'number') {
				throw new TypeError(
					`cbrtFloatLazy expected an IEEE-754 float64 number at index ${index}, received ${describeValue(value)}`
				)
			}
			yield Math.cbrt(value)
			index += 1
		}
	})()
}

/**
 * Formats a value's type for diagnostic error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeValue(value) {
	if (value === null) return 'null'
	if (value === undefined) return 'undefined'
	if (typeof value === 'object') {
		const tag = value.constructor?.name
		return tag ? `object (${tag})` : 'object'
	}
	return typeof value
}
