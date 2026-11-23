/**
 * Lazily computes the trigonometric sine (`Math.sin`) of each IEEE-754 float64
 * `number` in an iterable sequence using a streaming generator.
 *
 * The outer iterable argument is validated eagerly when `sinFloatLazy` is
 * called, while elements are pulled, validated, and transformed one at a time
 * on demand. Supports finite and infinite iterables (Arrays, TypedArrays, Sets,
 * Generators, custom iterables) and propagates early termination (`return()`)
 * back to the underlying iterator.
 *
 * IEEE-754 float64 semantics are preserved for numeric inputs:
 * - `sin(+0)` yields `+0` and `sin(-0)` yields `-0`.
 * - `sin(±Infinity)` and `sin(NaN)` yield `NaN`.
 *
 * @param {Iterable<number>} values - An iterable sequence of IEEE-754 float64
 *   numbers (radians). Strings and non-iterable values are rejected.
 * @returns {Generator<number, void, undefined>} A generator yielding the
 *   float64 sine of each input number lazily.
 * @throws {TypeError} Immediately if `values` is not a non-string iterable.
 * @throws {TypeError} Lazily during iteration if a yielded element is not of
 *   type `number`.
 */
export function sinFloatLazy(values) {
	if (
		values == null ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'sinFloatLazy expects an iterable sequence of IEEE-754 float64 numbers'
		)
	}

	return sinFloatStream(values)
}

/**
 * Internal generator performing lazy per-element validation and sine evaluation.
 *
 * @param {Iterable<number>} values
 * @returns {Generator<number, void, undefined>}
 */
function* sinFloatStream(values) {
	let index = 0
	for (const value of values) {
		if (typeof value !== 'number') {
			throw new TypeError(
				`Expected IEEE-754 float64 number at index ${index}, got ${value === null ? 'null' : typeof value}`
			)
		}
		yield Math.sin(value)
		index += 1
	}
}
