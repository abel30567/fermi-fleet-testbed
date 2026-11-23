/**
 * Checks whether a value is a Float64Array (including cross-realm instances).
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
	if (value === undefined) return 'undefined'
	if (typeof value === 'object') {
		return Object.prototype.toString.call(value)
	}
	return typeof value
}

/**
 * Internal generator yielding element-wise arccos values from a single Float64Array.
 *
 * @param {Float64Array} array
 * @returns {Generator<number, void, undefined>}
 */
function* iterateFloat64Array(array) {
	for (let i = 0; i < array.length; i += 1) {
		yield Math.acos(array[i])
	}
}

/**
 * Internal generator lazily consuming an iterable of Float64Array chunks and
 * yielding element-wise arccos values one number at a time.
 *
 * @param {Iterable<Float64Array>} chunks
 * @returns {Generator<number, void, undefined>}
 */
function* iterateFloat64Chunks(chunks) {
	let chunkIndex = 0
	for (const chunk of chunks) {
		if (!isFloat64Array(chunk)) {
			throw new TypeError(
				`arccosTypedLazy: expected chunk at index ${chunkIndex} to be a Float64Array, got ${describeType(chunk)}`,
			)
		}
		for (let i = 0; i < chunk.length; i += 1) {
			yield Math.acos(chunk[i])
		}
		chunkIndex += 1
	}
}

/**
 * Computes the element-wise inverse cosine (`Math.acos`, in radians within `[0, π]`)
 * lazily over a `Float64Array` or an iterable sequence of `Float64Array` chunks.
 *
 * Returns a generator that yields one `number` at a time without eagerly materializing
 * the full input or output. When given an iterable of `Float64Array` chunks, each chunk
 * is pulled from the upstream iterable only after all elements of the previous chunk
 * have been consumed.
 *
 * Out-of-domain elements (`x < -1`, `x > 1`, or `NaN`) yield `NaN`, following IEEE 754 /
 * `Math.acos` semantics.
 *
 * @param {Float64Array | Iterable<Float64Array>} input - A `Float64Array` or an iterable
 *   yielding `Float64Array` chunks.
 * @returns {Generator<number, void, undefined>} A lazy generator yielding `Math.acos(x)`
 *   for each element in order.
 * @throws {TypeError} Synchronously if `input` is neither a `Float64Array` nor a valid
 *   non-string, non-TypedArray iterable; or lazily during iteration if a yielded chunk
 *   is not a `Float64Array`.
 */
export function arccosTypedLazy(input) {
	if (isFloat64Array(input)) {
		return iterateFloat64Array(input)
	}

	if (
		input === null ||
		input === undefined ||
		typeof input === 'string' ||
		ArrayBuffer.isView(input) ||
		typeof input !== 'object' ||
		typeof input[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`arccosTypedLazy: expected a Float64Array or an iterable of Float64Array chunks, got ${describeType(input)}`,
		)
	}

	return iterateFloat64Chunks(input)
}
