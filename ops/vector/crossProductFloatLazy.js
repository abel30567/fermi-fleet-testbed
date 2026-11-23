/**
 * Validates that a value is a non-string iterable.
 *
 * @param {unknown} value - Candidate iterable.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is null, undefined, a string, or not iterable.
 */
function assertIterable(value, name) {
	if (
		value == null ||
		typeof value === 'string' ||
		typeof value[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(`Vector '${name}' must be an iterable of 3 numbers`)
	}
}

/**
 * Lazily consumes two 3D vector iterables and yields the 3 IEEE-754 float64
 * components of their cross product `a × b`.
 *
 * @param {Iterable<number>} a - First 3D vector iterable.
 * @param {Iterable<number>} b - Second 3D vector iterable.
 * @returns {Generator<number, void, void>} Generator yielding `[cx, cy, cz]`.
 */
function* streamCrossProduct(a, b) {
	let aIter
	let bIter
	let aDone = false
	let bDone = false

	const aVals = new Float64Array(3)
	const bVals = new Float64Array(3)

	try {
		aIter = a[Symbol.iterator]()
		bIter = b[Symbol.iterator]()

		for (let i = 0; i < 3; i++) {
			const aStep = aIter.next()
			if (aStep.done) {
				aDone = true
				throw new RangeError(
					`Vector 'a' must have exactly 3 elements, received ${i}`
				)
			}
			if (typeof aStep.value !== 'number') {
				throw new TypeError(
					`Vector 'a' element at index ${i} must be a number`
				)
			}
			aVals[i] = aStep.value

			const bStep = bIter.next()
			if (bStep.done) {
				bDone = true
				throw new RangeError(
					`Vector 'b' must have exactly 3 elements, received ${i}`
				)
			}
			if (typeof bStep.value !== 'number') {
				throw new TypeError(
					`Vector 'b' element at index ${i} must be a number`
				)
			}
			bVals[i] = bStep.value
		}

		const aExtra = aIter.next()
		if (aExtra.done) {
			aDone = true
		} else {
			throw new RangeError(
				"Vector 'a' must have exactly 3 elements, received more than 3"
			)
		}

		const bExtra = bIter.next()
		if (bExtra.done) {
			bDone = true
		} else {
			throw new RangeError(
				"Vector 'b' must have exactly 3 elements, received more than 3"
			)
		}
	} finally {
		try {
			if (!aDone && aIter && typeof aIter.return === 'function') {
				aIter.return()
			}
		} finally {
			if (!bDone && bIter && typeof bIter.return === 'function') {
				bIter.return()
			}
		}
	}

	const a0 = aVals[0]
	const a1 = aVals[1]
	const a2 = aVals[2]
	const b0 = bVals[0]
	const b1 = bVals[1]
	const b2 = bVals[2]

	yield (a1 * b2 - a2 * b1) + 0
	yield (a2 * b0 - a0 * b2) + 0
	yield (a0 * b1 - a1 * b0) + 0
}

/**
 * Computes the 3D vector cross product `a × b` over IEEE-754 float64 numbers
 * using a lazy streaming generator.
 *
 * Input iterables are not consumed until the returned generator is iterated,
 * are traversed at most once, and are properly closed via `.return()` if
 * validation fails mid-stream.
 *
 * @param {Iterable<number>} a - First 3D vector as an iterable of 3 IEEE-754 float64 numbers.
 * @param {Iterable<number>} b - Second 3D vector as an iterable of 3 IEEE-754 float64 numbers.
 * @returns {Generator<number, void, void>} A generator lazily yielding the 3 components `(x, y, z)` of `a × b`.
 * @throws {TypeError} If `a` or `b` is not a non-string iterable, or yields any non-number element.
 * @throws {RangeError} If `a` or `b` does not yield exactly 3 elements.
 */
export function crossProductFloatLazy(a, b) {
	assertIterable(a, 'a')
	assertIterable(b, 'b')
	return streamCrossProduct(a, b)
}
