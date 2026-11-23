/**
 * Check whether a value is a Float64Array (including cross-realm instances).
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
 * Describe a value's runtime type for error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
	if (value === null) return 'null'
	if (value === undefined) return 'undefined'
	if (typeof value === 'object' && value.constructor?.name) {
		return value.constructor.name
	}
	return typeof value
}

/**
 * Compute the square root of a single float64 value.
 *
 * @param {number} value
 * @param {boolean} strict
 * @returns {number}
 */
function computeSqrt(value, strict) {
	if (strict && value < 0) {
		throw new RangeError(
			`Cannot compute real square root of negative value: ${value}`,
		)
	}
	return Math.sqrt(value)
}

/**
 * Lazily yield element-wise square roots from a single Float64Array.
 *
 * @param {Float64Array} array
 * @param {boolean} strict
 * @returns {Generator<number, void, undefined>}
 */
function* sqrtFromTypedArray(array, strict) {
	for (let i = 0; i < array.length; i++) {
		yield computeSqrt(array[i], strict)
	}
}

/**
 * Lazily consume an iterable of Float64Array chunks and yield element-wise square roots.
 *
 * @param {Iterable<Float64Array>} iterable
 * @param {boolean} strict
 * @returns {Generator<number, void, undefined>}
 */
function* sqrtFromIterable(iterable, strict) {
	let chunkIndex = 0
	for (const chunk of iterable) {
		if (!isFloat64Array(chunk)) {
			throw new TypeError(
				`Expected Float64Array at chunk index ${chunkIndex}, received ${describeType(chunk)}`,
			)
		}
		for (let i = 0; i < chunk.length; i++) {
			yield computeSqrt(chunk[i], strict)
		}
		chunkIndex++
	}
}

/**
 * Compute element-wise square roots lazily over a `Float64Array` or a lazy
 * iterable sequence of `Float64Array` chunks.
 *
 * Validates top-level arguments eagerly on invocation and returns a generator
 * that pulls chunks and computes `Math.sqrt` element-by-element on demand with
 * O(1) auxiliary memory.
 *
 * By default, IEEE 754 semantics apply (`sqrt(-x) === NaN`, `sqrt(-0) === -0`,
 * `sqrt(Infinity) === Infinity`, `sqrt(NaN) === NaN`). Pass `{ strict: true }`
 * to throw a `RangeError` when a negative value (`x < 0`) is encountered.
 *
 * @param {Float64Array | Iterable<Float64Array>} input
 *   A single `Float64Array` or an iterable (such as a generator or array)
 *   yielding `Float64Array` chunks.
 * @param {{ strict?: boolean }} [options]
 *   Optional configuration object.
 * @param {boolean} [options.strict=false]
 *   When `true`, throw a `RangeError` upon encountering any negative element (`x < 0`).
 * @returns {Generator<number, void, undefined>}
 *   A generator yielding the element-wise square root of each float64 element.
 * @throws {TypeError}
 *   If `input` is not a `Float64Array` or an iterable object of `Float64Array`s,
 *   if `options` is invalid, or (during iteration) if a yielded chunk is not a `Float64Array`.
 * @throws {RangeError}
 *   During iteration when `options.strict` is `true` and a negative value (`x < 0`) is encountered.
 */
export function sqrtTypedLazy(input, options) {
	let strict = false
	if (options !== undefined) {
		if (
			typeof options !== 'object' ||
			options === null ||
			Array.isArray(options)
		) {
			throw new TypeError(
				`Expected options to be a plain object, received ${describeType(options)}`,
			)
		}
		if (options.strict !== undefined) {
			if (typeof options.strict !== 'boolean') {
				throw new TypeError(
					`Expected options.strict to be a boolean, received ${describeType(options.strict)}`,
				)
			}
			strict = options.strict
		}
	}

	if (isFloat64Array(input)) {
		return sqrtFromTypedArray(input, strict)
	}

	if (
		input === null ||
		input === undefined ||
		typeof input === 'string' ||
		ArrayBuffer.isView(input) ||
		input instanceof ArrayBuffer ||
		(typeof SharedArrayBuffer !== 'undefined' &&
			input instanceof SharedArrayBuffer) ||
		typeof input !== 'object' ||
		typeof input[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			`Expected a Float64Array or an iterable of Float64Array instances, received ${describeType(input)}`,
		)
	}

	return sqrtFromIterable(input, strict)
}
