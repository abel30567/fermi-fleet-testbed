/**
 * Validate that a value is a supported vector input: a `Float64Array` or a
 * synchronous iterable sequence (excluding strings, `Map`, and other typed
 * array / `DataView` views).
 *
 * @param {unknown} value - Candidate vector input.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not a `Float64Array` or valid iterable.
 */
function validateVectorInput(value, name) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(
			`Expected "${name}" to be a Float64Array or iterable sequence of numbers`
		)
	}

	if (value instanceof String || value instanceof Map) {
		throw new TypeError(
			`Expected "${name}" to be a Float64Array or iterable sequence of numbers`
		)
	}

	if (ArrayBuffer.isView(value) && !(value instanceof Float64Array)) {
		throw new TypeError(
			`Expected "${name}" to be a Float64Array, got ${value.constructor.name}`
		)
	}

	if (typeof value[Symbol.iterator] !== 'function') {
		throw new TypeError(
			`Expected "${name}" to be a Float64Array or iterable sequence of numbers`
		)
	}
}

/**
 * Validate a single numeric vector element.
 *
 * @param {unknown} value - Element value to validate.
 * @param {string} name - Input parameter name for error messages.
 * @param {number} index - Zero-based element index.
 * @returns {number} The validated finite float64 number.
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is NaN or infinite.
 */
function validateElement(value, name, index) {
	if (typeof value !== 'number') {
		throw new TypeError(
			`Invalid element in "${name}" at index ${index}: expected a number, got ${typeof value}`
		)
	}

	if (!Number.isFinite(value)) {
		throw new RangeError(
			`Invalid element in "${name}" at index ${index}: expected a finite number, got ${value}`
		)
	}

	return value
}

/**
 * Fast-path lazy generator for two `Float64Array` vectors of equal length.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Generator<number, void, undefined>}
 */
function* addFloat64Arrays(a, b) {
	for (let i = 0; i < a.length; i += 1) {
		const valA = validateElement(a[i], 'a', i)
		const valB = validateElement(b[i], 'b', i)
		yield valA + valB
	}
}

/**
 * Streaming lazy generator that pulls one element at a time from two
 * synchronous iterables and yields their element-wise float64 sum.
 *
 * @param {Float64Array | Iterable<number>} a
 * @param {Float64Array | Iterable<number>} b
 * @returns {Generator<number, void, undefined>}
 */
function* addIterables(a, b) {
	const iterA = a[Symbol.iterator]()
	const iterB = b[Symbol.iterator]()
	let doneA = false
	let doneB = false
	let index = 0

	try {
		while (true) {
			const nextA = iterA.next()
			const nextB = iterB.next()
			doneA = Boolean(nextA.done)
			doneB = Boolean(nextB.done)

			if (doneA && doneB) {
				return
			}

			if (doneA !== doneB) {
				throw new RangeError(
					`Vector dimension mismatch at index ${index}: inputs have different lengths`
				)
			}

			const valA = validateElement(nextA.value, 'a', index)
			const valB = validateElement(nextB.value, 'b', index)

			yield valA + valB
			index += 1
		}
	} finally {
		if (!doneA && typeof iterA.return === 'function') {
			try {
				iterA.return()
			} finally {
				if (!doneB && typeof iterB.return === 'function') {
					iterB.return()
				}
			}
		} else if (!doneB && typeof iterB.return === 'function') {
			iterB.return()
		}
	}
}

/**
 * Lazily computes the element-wise vector sum `a + b` over `Float64Array`
 * inputs or synchronous numeric iterables, streaming results via a generator.
 *
 * Input containers are validated eagerly when `vectorAddTypedLazy` is called.
 * When both inputs are `Float64Array` instances, length equality is also
 * checked eagerly in O(1) time. Element values are validated and summed lazily
 * as the returned generator is consumed; for general iterables, mismatched
 * lengths raise a `RangeError` as soon as one sequence ends before the other.
 *
 * @param {Float64Array | Iterable<number>} a - First input vector (`Float64Array` or numeric iterable).
 * @param {Float64Array | Iterable<number>} b - Second input vector (`Float64Array` or numeric iterable).
 * @returns {Generator<number, void, undefined>} A generator yielding each element-wise float64 sum.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array` or valid iterable, or yields a non-number.
 * @throws {RangeError} If vector lengths do not match or an element is non-finite (`NaN`, `±Infinity`).
 */
export function vectorAddTypedLazy(a, b) {
	validateVectorInput(a, 'a')
	validateVectorInput(b, 'b')

	if (a instanceof Float64Array && b instanceof Float64Array) {
		if (a.length !== b.length) {
			throw new RangeError(
				`Vector dimension mismatch: expected equal lengths, got ${a.length} and ${b.length}`
			)
		}
		return addFloat64Arrays(a, b)
	}

	return addIterables(a, b)
}
