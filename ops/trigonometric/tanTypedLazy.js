/**
 * Lazily computes the trigonometric tangent (`Math.tan`) element-wise over a
 * `Float64Array` or an iterable sequence of `Float64Array` chunks.
 *
 * Top-level input shape is validated synchronously when `tanTypedLazy` is
 * invoked, while element computation and chunk consumption occur lazily on
 * demand via a generator iterator. Each chunk pulled from an iterable sequence
 * is validated to be a `Float64Array` before its elements are yielded.
 *
 * @param {Float64Array | Iterable<Float64Array>} input - A `Float64Array` or an
 *   iterable yielding `Float64Array` instances containing angles in radians.
 * @returns {Generator<number, void, undefined>} A lazy generator yielding the
 *   tangent of each angle in radians.
 * @throws {TypeError} If `input` is not a `Float64Array` or a non-string,
 *   non-view iterable, or if a yielded chunk in an iterable sequence is not a
 *   `Float64Array`.
 */
export function tanTypedLazy(input) {
	if (input instanceof Float64Array) {
		return tanFloat64Array(input)
	}

	if (
		input === null ||
		input === undefined ||
		typeof input !== 'object' ||
		ArrayBuffer.isView(input) ||
		typeof input[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'tanTypedLazy expects a Float64Array or an iterable of Float64Array instances'
		)
	}

	return tanFloat64Sequence(input)
}

/**
 * Lazily yields `Math.tan(x)` for each element of a single `Float64Array`.
 *
 * @param {Float64Array} arr - Typed array of angles in radians.
 * @returns {Generator<number, void, undefined>}
 */
function* tanFloat64Array(arr) {
	for (let i = 0; i < arr.length; i++) {
		yield Math.tan(arr[i])
	}
}

/**
 * Lazily consumes an iterable of `Float64Array` chunks and yields `Math.tan(x)`
 * for each element.
 *
 * @param {Iterable<Float64Array>} chunks - Iterable sequence of `Float64Array` chunks.
 * @returns {Generator<number, void, undefined>}
 * @throws {TypeError} If any yielded chunk is not a `Float64Array`.
 */
function* tanFloat64Sequence(chunks) {
	let chunkIndex = 0
	for (const chunk of chunks) {
		if (!(chunk instanceof Float64Array)) {
			throw new TypeError(
				`tanTypedLazy expected chunk at index ${chunkIndex} to be a Float64Array`
			)
		}
		for (let i = 0; i < chunk.length; i++) {
			yield Math.tan(chunk[i])
		}
		chunkIndex++
	}
}
