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
 * Validates that an input is a Float64Array or a lazy iterable sequence.
 *
 * @param {unknown} input
 * @param {string} name
 */
function validateInput(input, name) {
	if (isFloat64Array(input)) {
		return
	}
	if (input === null || input === undefined || typeof input !== 'object') {
		throw new TypeError(`${name} must be a Float64Array or a lazy iterable sequence`)
	}
	if (Array.isArray(input)) {
		throw new TypeError(
			`${name} must be a Float64Array or a lazy iterable sequence, not a plain Array`
		)
	}
	if (ArrayBuffer.isView(input)) {
		throw new TypeError(
			`${name} must be a Float64Array, not ${input.constructor?.name ?? 'ArrayBufferView'}`
		)
	}
	if (input instanceof Map || input instanceof Set) {
		throw new TypeError(
			`${name} must be a Float64Array or a lazy iterable sequence, not a ${input.constructor.name}`
		)
	}
	if (typeof input[Symbol.iterator] !== 'function') {
		throw new TypeError(`${name} must be a Float64Array or a lazy iterable sequence`)
	}
}

/**
 * Lazily streams finite float64 scalar elements from a Float64Array or a lazy
 * iterable yielding finite numbers or Float64Array chunks.
 *
 * @param {Float64Array | Iterable<number | Float64Array>} source
 * @param {string} name
 * @returns {Generator<number, void, void>}
 */
function* streamFloat64(source, name) {
	if (isFloat64Array(source)) {
		for (let i = 0; i < source.length; i++) {
			const value = source[i]
			if (!Number.isFinite(value)) {
				throw new RangeError(`${name}[${i}] must be a finite number, received ${value}`)
			}
			yield value
		}
		return
	}

	let index = 0
	for (const item of source) {
		if (isFloat64Array(item)) {
			for (let i = 0; i < item.length; i++) {
				const value = item[i]
				if (!Number.isFinite(value)) {
					throw new RangeError(`${name}[${index}] must be a finite number, received ${value}`)
				}
				yield value
				index++
			}
		} else if (typeof item === 'number') {
			if (!Number.isFinite(item)) {
				throw new RangeError(`${name}[${index}] must be a finite number, received ${item}`)
			}
			yield item
			index++
		} else {
			throw new TypeError(
				`${name}[${index}] must be a finite number or Float64Array chunk`
			)
		}
	}
}

/**
 * Lazily zips two float64 element streams in lockstep, yielding element-wise
 * products and ensuring both underlying iterators are closed on early exit.
 *
 * @param {Iterable<number>} streamA
 * @param {Iterable<number>} streamB
 * @returns {Generator<number, void, void>}
 */
function* zipProducts(streamA, streamB) {
	const iterA = streamA[Symbol.iterator]()
	const iterB = streamB[Symbol.iterator]()
	let doneA = false
	let doneB = false
	let index = 0

	try {
		while (true) {
			const nextA = iterA.next()
			doneA = Boolean(nextA.done)

			const nextB = iterB.next()
			doneB = Boolean(nextB.done)

			if (doneA && doneB) {
				return
			}
			if (doneA !== doneB) {
				throw new RangeError(
					`Vector length mismatch at index ${index}: inputs must have equal length`
				)
			}

			const product = nextA.value * nextB.value
			if (!Number.isFinite(product)) {
				throw new RangeError(
					`Product overflow at index ${index}: ${nextA.value} * ${nextB.value} is not finite`
				)
			}

			yield product
			index++
		}
	} finally {
		try {
			if (!doneA && typeof iterA.return === 'function') {
				iterA.return()
			}
		} finally {
			if (!doneB && typeof iterB.return === 'function') {
				iterB.return()
			}
		}
	}
}

/**
 * Computes the vector dot product element-wise over Float64Array inputs or lazy
 * iterable sequences of finite numbers / Float64Array chunks.
 *
 * Uses a streaming generator pipeline that consumes inputs lazily in lockstep
 * without materializing sequences in memory, accumulating the sum with Neumaier
 * compensated summation for improved floating-point accuracy.
 *
 * @param {Float64Array | Iterable<number | Float64Array>} a First vector or lazy sequence.
 * @param {Float64Array | Iterable<number | Float64Array>} b Second vector or lazy sequence.
 * @returns {number} The scalar dot product (0 for empty vectors).
 * @throws {TypeError} If either input is not a Float64Array or valid lazy iterable, or yields invalid items.
 * @throws {RangeError} If lengths differ, any element is non-finite (NaN/Infinity), or arithmetic overflows.
 */
export function dotProductTypedLazy(a, b) {
	validateInput(a, 'a')
	validateInput(b, 'b')

	if (isFloat64Array(a) && isFloat64Array(b) && a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: a has length ${a.length}, b has length ${b.length}`
		)
	}

	const streamA = streamFloat64(a, 'a')
	const streamB = streamFloat64(b, 'b')

	let sum = 0
	let compensation = 0

	for (const product of zipProducts(streamA, streamB)) {
		const nextSum = sum + product
		if (!Number.isFinite(nextSum)) {
			throw new RangeError('Dot product overflow: accumulated sum is not finite')
		}
		if (Math.abs(sum) >= Math.abs(product)) {
			compensation += (sum - nextSum) + product
		} else {
			compensation += (product - nextSum) + sum
		}
		sum = nextSum
	}

	const result = sum + compensation
	if (!Number.isFinite(result)) {
		throw new RangeError('Dot product overflow: final sum is not finite')
	}

	return Object.is(result, -0) ? 0 : result
}
