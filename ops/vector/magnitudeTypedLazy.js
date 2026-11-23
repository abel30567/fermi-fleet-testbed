/**
 * Lazily yields scalar `number` elements from a `Float64Array` or an iterable
 * sequence of `Float64Array` chunks without buffering intermediate arrays.
 *
 * @param {Float64Array | Iterable<Float64Array>} input
 * @returns {Generator<number, void, undefined>}
 * @throws {TypeError} If `input` is neither a `Float64Array` nor an iterable of `Float64Array` chunks.
 */
function* streamFloat64Elements(input) {
	if (input instanceof Float64Array) {
		for (let i = 0; i < input.length; i++) {
			yield input[i]
		}
		return
	}

	if (
		input !== null &&
		typeof input === 'object' &&
		typeof input[Symbol.iterator] === 'function'
	) {
		if (ArrayBuffer.isView(input)) {
			throw new TypeError(
				`Expected a Float64Array or an iterable of Float64Array chunks, got ${input.constructor?.name ?? 'ArrayBufferView'}`
			)
		}

		for (const chunk of input) {
			if (!(chunk instanceof Float64Array)) {
				const actualType =
					chunk === null
						? 'null'
						: typeof chunk === 'object'
							? (chunk.constructor?.name ?? 'object')
							: typeof chunk
				throw new TypeError(
					`Expected every chunk in iterable input to be a Float64Array, got ${actualType}`
				)
			}

			for (let i = 0; i < chunk.length; i++) {
				yield chunk[i]
			}
		}
		return
	}

	const actualType = input === null ? 'null' : typeof input
	throw new TypeError(
		`Expected a Float64Array or an iterable of Float64Array chunks, got ${actualType}`
	)
}

/**
 * Computes the Euclidean (L2) magnitude of a vector provided as a `Float64Array`
 * or as a lazy iterable/generator of `Float64Array` chunks.
 *
 * Uses a generator-based streaming pass over the input elements with single-pass
 * scaled sum-of-squares accumulation (BLAS `dnrm2` scaling), guaranteeing O(1)
 * auxiliary memory and preventing spurious overflow on very large values as well
 * as spurious underflow on very small/subnormal values.
 *
 * Special IEEE 754 values follow `Math.hypot` semantics: if any element is
 * `±Infinity`, returns `Infinity`; otherwise if any element is `NaN`, returns `NaN`.
 * An empty vector (or empty iterable) has magnitude `0`.
 *
 * @param {Float64Array | Iterable<Float64Array>} input - A `Float64Array` vector or
 *   an iterable sequence (e.g., generator) yielding `Float64Array` chunks of the vector.
 * @returns {number} The non-negative Euclidean norm (magnitude) of the vector.
 * @throws {TypeError} If `input` is not a `Float64Array` or an iterable of `Float64Array` chunks.
 *
 * @example
 * magnitudeTypedLazy(new Float64Array([3, 4])) // 5
 *
 * @example
 * function* chunks() {
 *   yield new Float64Array([3, 4])
 *   yield new Float64Array([12])
 * }
 * magnitudeTypedLazy(chunks()) // 13
 */
export function magnitudeTypedLazy(input) {
	let scale = 0
	let sumSq = 0
	let hasInfinity = false
	let hasNaN = false

	for (const value of streamFloat64Elements(input)) {
		if (Number.isNaN(value)) {
			hasNaN = true
			continue
		}

		const absVal = Math.abs(value)
		if (absVal === Infinity) {
			hasInfinity = true
			continue
		}

		if (hasInfinity || hasNaN || absVal === 0) {
			continue
		}

		if (absVal > scale) {
			const ratio = scale / absVal
			sumSq = 1 + sumSq * ratio * ratio
			scale = absVal
		} else {
			const ratio = absVal / scale
			sumSq += ratio * ratio
		}
	}

	if (hasInfinity) {
		return Infinity
	}
	if (hasNaN) {
		return NaN
	}
	if (scale === 0) {
		return 0
	}

	return scale * Math.sqrt(sumSq)
}
