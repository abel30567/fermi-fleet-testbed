/**
 * Returns true if `value` is a `Float64Array` (safe across realms).
 *
 * @param {unknown} value
 * @returns {value is Float64Array}
 */
function isFloat64Array(value) {
	return (
		ArrayBuffer.isView(value) &&
		Object.prototype.toString.call(value) === '[object Float64Array]'
	)
}

/**
 * Formats a value's runtime type for validation error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
	if (value === null) return 'null'
	if (typeof value !== 'object') return typeof value
	return value.constructor?.name || Object.prototype.toString.call(value)
}

/**
 * Lazily yields element-wise cube roots from a single `Float64Array`.
 *
 * @param {Float64Array} array
 * @returns {Generator<number, void, undefined>}
 */
function* streamFloat64Array(array) {
	for (let i = 0; i < array.length; i++) {
		yield Math.cbrt(array[i])
	}
}

/**
 * Lazily consumes an iterable sequence of `Float64Array` chunks and yields
 * element-wise cube roots one value at a time.
 *
 * @param {Iterable<Float64Array>} iterable
 * @returns {Generator<number, void, undefined>}
 */
function* streamFloat64ArraySequence(iterable) {
	let chunkIndex = 0
	for (const chunk of iterable) {
		if (!isFloat64Array(chunk)) {
			throw new TypeError(
				`cbrtTypedLazy: expected chunk at index ${chunkIndex} to be a Float64Array, got ${describeType(chunk)}`,
			)
		}
		for (let i = 0; i < chunk.length; i++) {
			yield Math.cbrt(chunk[i])
		}
		chunkIndex++
	}
}

/**
 * Lazily computes the element-wise cube root (`cbrt`) over a `Float64Array`
 * or an iterable sequence of `Float64Array` chunks.
 *
 * Operates as a streaming generator: values are computed on demand as the
 * returned generator is consumed, and sequence inputs are pulled chunk by chunk
 * only as needed. Top-level input shape is validated eagerly; for iterable
 * sequences, each chunk is validated to be a `Float64Array` as it is consumed.
 *
 * @param {Float64Array | Iterable<Float64Array>} input - A `Float64Array` or an
 *   iterable yielding `Float64Array` chunks.
 * @returns {Generator<number, void, undefined>} A generator yielding the cube
 *   root of each element in order.
 * @throws {TypeError} If `input` is not a `Float64Array` or an iterable object,
 *   or if a consumed chunk in an iterable sequence is not a `Float64Array`.
 */
export function cbrtTypedLazy(input) {
	if (input === null || input === undefined) {
		throw new TypeError(
			`cbrtTypedLazy: expected a Float64Array or an iterable of Float64Array chunks, got ${describeType(input)}`,
		)
	}

	if (isFloat64Array(input)) {
		return streamFloat64Array(input)
	}

	if (
		ArrayBuffer.isView(input) ||
		input instanceof ArrayBuffer ||
		(typeof SharedArrayBuffer !== 'undefined' &&
			input instanceof SharedArrayBuffer)
	) {
		throw new TypeError(
			`cbrtTypedLazy: expected a Float64Array or an iterable of Float64Array chunks, got ${describeType(input)}`,
		)
	}

	if (typeof input !== 'object' || typeof input[Symbol.iterator] !== 'function') {
		throw new TypeError(
			`cbrtTypedLazy: expected a Float64Array or an iterable of Float64Array chunks, got ${describeType(input)}`,
		)
	}

	return streamFloat64ArraySequence(input)
}
