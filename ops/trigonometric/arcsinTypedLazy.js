/**
 * Checks whether a value is a `Float64Array` (including cross-realm instances).
 *
 * @param {unknown} value
 * @returns {value is Float64Array}
 */
function isFloat64Array(value) {
	return (
		value instanceof Float64Array ||
		(ArrayBuffer.isView(value) &&
			Object.prototype.toString.call(value) === '[object Float64Array]')
	)
}

/**
 * Formats a human-readable type label for validation error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
	if (value === null) return 'null'
	if (ArrayBuffer.isView(value)) {
		return value.constructor?.name ?? 'ArrayBufferView'
	}
	if (value instanceof String) return 'String'
	return typeof value
}

/**
 * Lazily computes the element-wise trigonometric arcsine (in radians) over a
 * `Float64Array` or a streaming iterable of `Float64Array` chunks / IEEE-754
 * float64 numbers.
 *
 * Returns a generator that consumes its input sequence on demand without
 * eagerly materializing intermediate arrays. For each input value `x`:
 * - If `x` is in `[-1, 1]`, yields `arcsin(x)` in `[-Math.PI / 2, Math.PI / 2]`
 *   (preserving signed zero: `-0` maps to `-0`).
 * - If `x` is outside `[-1, 1]` (including `±Infinity`) or `NaN`, yields `NaN`
 *   per IEEE-754 / `Math.asin` semantics.
 *
 * Top-level input validation runs eagerly when `arcsinTypedLazy(input)` is
 * invoked. Element-level validation for lazy iterables runs as each element is
 * pulled from the returned generator.
 *
 * @param {Float64Array | Iterable<number | Float64Array>} input
 *   A `Float64Array` or an iterable (such as a generator) yielding `Float64Array`
 *   chunks or IEEE-754 `number` values. Strings and non-`Float64Array`
 *   `ArrayBufferView`s (e.g. `Int32Array`, `Float32Array`, `DataView`) are rejected.
 * @returns {Generator<number, void, undefined>}
 *   A generator yielding element-wise `Math.asin(x)` values lazily.
 * @throws {TypeError}
 *   If `input` is not a `Float64Array` or a valid iterable, or if an element
 *   yielded by an iterable is neither a `number` nor a `Float64Array`.
 */
export function arcsinTypedLazy(input) {
	if (isFloat64Array(input)) {
		return streamFloat64Array(input)
	}

	if (
		input === null ||
		input === undefined ||
		typeof input === 'string' ||
		input instanceof String ||
		ArrayBuffer.isView(input) ||
		typeof input[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`arcsinTypedLazy: expected a Float64Array or an iterable of numbers/Float64Array chunks, received ${describeType(input)}`
		)
	}

	return streamIterable(input)
}

/**
 * @param {Float64Array} arr
 * @returns {Generator<number, void, undefined>}
 */
function* streamFloat64Array(arr) {
	for (let i = 0; i < arr.length; i++) {
		yield Math.asin(arr[i])
	}
}

/**
 * @param {Iterable<number | Float64Array>} iterable
 * @returns {Generator<number, void, undefined>}
 */
function* streamIterable(iterable) {
	let index = 0
	for (const item of iterable) {
		if (typeof item === 'number') {
			yield Math.asin(item)
		} else if (isFloat64Array(item)) {
			for (let i = 0; i < item.length; i++) {
				yield Math.asin(item[i])
			}
		} else {
			throw new TypeError(
				`arcsinTypedLazy: expected iterable element at position ${index} to be a number or Float64Array, received ${describeType(item)}`
			)
		}
		index++
	}
}
