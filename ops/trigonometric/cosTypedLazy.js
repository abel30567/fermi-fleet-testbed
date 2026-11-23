/**
 * Computes the trigonometric cosine element-wise over a `Float64Array` or a
 * lazy iterable sequence of `Float64Array` chunks, yielding results lazily via
 * a generator without eagerly allocating an output buffer or materializing the
 * input stream.
 *
 * Input validation on the top-level argument is performed synchronously when
 * `cosTypedLazy` is called; per-chunk and per-element validation happens lazily
 * as each element is requested from the returned generator.
 *
 * @param {Float64Array | Iterable<Float64Array>} input
 *   A `Float64Array` of finite angles in radians, or an iterable yielding
 *   `Float64Array` chunks of finite angles in radians.
 * @returns {Generator<number, void, undefined>}
 *   A lazy generator yielding `Math.cos(x)` for each element `x` in order.
 * @throws {TypeError}
 *   If `input` is not a `Float64Array` or a non-string iterable (excluding
 *   other TypedArrays/DataViews), or if an iterable yields a non-`Float64Array`
 *   chunk.
 * @throws {RangeError}
 *   If any element encountered during iteration is not a finite number (`NaN`,
 *   `Infinity`, or `-Infinity`).
 */
export function cosTypedLazy(input) {
	if (input === null || input === undefined) {
		throw new TypeError(
			'cosTypedLazy: input must be a Float64Array or an iterable of Float64Array chunks',
		)
	}
	if (input instanceof Float64Array) {
		return streamFloat64Array(input)
	}
	if (typeof input === 'string' || ArrayBuffer.isView(input)) {
		throw new TypeError(
			'cosTypedLazy: input must be a Float64Array or an iterable of Float64Array chunks',
		)
	}
	if (typeof input[Symbol.iterator] !== 'function') {
		throw new TypeError(
			'cosTypedLazy: input must be a Float64Array or an iterable of Float64Array chunks',
		)
	}
	return streamFloat64ArrayIterable(input)
}

/**
 * Lazily yields `Math.cos(x)` for each element of a single `Float64Array`.
 *
 * @param {Float64Array} arr
 * @returns {Generator<number, void, undefined>}
 */
function* streamFloat64Array(arr) {
	for (let i = 0; i < arr.length; i++) {
		const x = arr[i]
		if (!Number.isFinite(x)) {
			throw new RangeError(
				`cosTypedLazy: element at index ${i} must be a finite number, got ${x}`,
			)
		}
		yield Math.cos(x)
	}
}

/**
 * Lazily consumes an iterable of `Float64Array` chunks and yields `Math.cos(x)`
 * for each element in order.
 *
 * @param {Iterable<Float64Array>} iterable
 * @returns {Generator<number, void, undefined>}
 */
function* streamFloat64ArrayIterable(iterable) {
	let chunkIndex = 0
	for (const chunk of iterable) {
		if (!(chunk instanceof Float64Array)) {
			throw new TypeError(
				`cosTypedLazy: chunk at index ${chunkIndex} must be a Float64Array`,
			)
		}
		for (let i = 0; i < chunk.length; i++) {
			const x = chunk[i]
			if (!Number.isFinite(x)) {
				throw new RangeError(
					`cosTypedLazy: element at chunk ${chunkIndex}, index ${i} must be a finite number, got ${x}`,
				)
			}
			yield Math.cos(x)
		}
		chunkIndex++
	}
}
