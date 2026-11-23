/**
 * Lazily validates elements yielded by an iterable as finite IEEE-754 float64 numbers.
 *
 * @param {Iterable<unknown>} iterable - Source sequence to consume lazily.
 * @returns {Generator<number, void, void>} Stream of validated finite float64 numbers.
 * @throws {TypeError} If any yielded element is not a primitive `number`.
 * @throws {RangeError} If any yielded number is `NaN`, `Infinity`, or `-Infinity`.
 */
function* validatedFloat64Stream(iterable) {
	let index = 0
	for (const value of iterable) {
		if (typeof value !== 'number') {
			const actual = value === null ? 'null' : typeof value
			throw new TypeError(
				`Expected a finite number at index ${index}, received ${actual}`
			)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`Expected a finite IEEE-754 float64 number at index ${index}, received ${value}`
			)
		}
		yield value
		index += 1
	}
}

/**
 * Lazily streams running discrete products over a validated float64 stream.
 *
 * @param {Iterable<number>} stream - Validated stream of finite float64 numbers.
 * @returns {Generator<number, number, void>} Running product after each element.
 */
function* runningProductStream(stream) {
	let acc = 1
	for (const value of stream) {
		acc *= value
		yield acc
	}
	return acc
}

/**
 * Computes the discrete product over an iterable of finite IEEE-754 float64 numbers
 * using a streaming, generator-based pipeline that consumes the input lazily in O(1) space.
 *
 * By convention, the empty product returns the multiplicative identity `1`.
 * Intermediate and final arithmetic follows standard left-to-right IEEE-754 binary64
 * multiplication semantics (including signed zero `-0`, subnormals, underflow to `±0`,
 * and overflow to `±Infinity`).
 *
 * @param {Iterable<number>} values - Non-string iterable yielding finite IEEE-754 float64 numbers
 *   (e.g., Array, TypedArray, Set, Generator, or custom iterable).
 * @returns {number} The discrete IEEE-754 float64 product of all elements in `values`.
 * @throws {TypeError} If `values` is not a non-string iterable or yields a non-number element.
 * @throws {RangeError} If `values` yields `NaN`, `Infinity`, or `-Infinity`.
 */
export function productFloatLazy(values) {
	if (
		values === null ||
		values === undefined ||
		typeof values === 'string' ||
		values instanceof String ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('Expected a non-string iterable of finite numbers')
	}

	let result = 1
	for (const partial of runningProductStream(validatedFloat64Stream(values))) {
		result = partial
	}
	return result
}
