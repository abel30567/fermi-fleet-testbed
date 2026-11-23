/**
 * Lazily computes the trigonometric cosine (`Math.cos`) over an iterable
 * sequence of IEEE-754 float64 `Number` values using a streaming generator.
 *
 * Input iterability is validated eagerly when `cosFloatLazy` is called;
 * individual elements are pulled and validated lazily one at a time as the
 * returned generator is consumed. Because consumption is lazy, infinite
 * sequences are supported and upstream iterators are properly closed on early
 * termination.
 *
 * IEEE-754 float64 semantics apply to numeric edge values:
 * - `cos(0)` and `cos(-0)` yield `1`
 * - `cos(NaN)`, `cos(Infinity)`, and `cos(-Infinity)` yield `NaN`
 *
 * @param {Iterable<number>} values - An iterable sequence of IEEE-754 float64 numbers (in radians).
 * @returns {Generator<number, void, undefined>} A lazy generator yielding `Math.cos(x)` for each `x` in `values`.
 * @throws {TypeError} If `values` is not an iterable (or is a string), or if a yielded element is not of type `number`.
 */
export function cosFloatLazy(values) {
	if (
		values == null ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'cosFloatLazy expected an iterable of IEEE-754 float64 numbers'
		)
	}

	return cosFloatLazyGenerator(values)
}

/**
 * Internal generator that consumes `values` lazily and yields `Math.cos(x)`.
 *
 * @param {Iterable<number>} values
 * @returns {Generator<number, void, undefined>}
 */
function* cosFloatLazyGenerator(values) {
	let index = 0
	for (const x of values) {
		if (typeof x !== 'number') {
			throw new TypeError(
				`cosFloatLazy expected a number at index ${index}, got ${x === null ? 'null' : typeof x}`
			)
		}
		yield Math.cos(x)
		index++
	}
}
