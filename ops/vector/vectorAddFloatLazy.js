/**
 * Validates that a value is a non-string iterable.
 *
 * @param {unknown} value - Candidate iterable to validate.
 * @param {string} name - Parameter name for error reporting.
 * @throws {TypeError} If value is nullish, a string, or lacks a callable Symbol.iterator.
 */
function assertIterable(value, name) {
	if (
		value == null ||
		typeof value === 'string' ||
		typeof value[Symbol.iterator] !== 'function'
	) {
		const actual = value === null ? 'null' : typeof value
		throw new TypeError(`Expected ${name} to be a non-string iterable, got ${actual}`)
	}
}

/**
 * Obtains and validates an iterator from an iterable.
 *
 * @param {Iterable<unknown>} iterable - Source iterable.
 * @param {string} name - Parameter name for error reporting.
 * @returns {Iterator<unknown>} The validated iterator.
 * @throws {TypeError} If Symbol.iterator does not return an iterator object with a next method.
 */
function getIterator(iterable, name) {
	const iterator = iterable[Symbol.iterator]()
	if (iterator == null || typeof iterator.next !== 'function') {
		throw new TypeError(`Expected ${name}[Symbol.iterator]() to return an iterator`)
	}
	return iterator
}

/**
 * Lazily computes the element-wise sum of two vectors over IEEE-754 float64 Numbers.
 *
 * Consumes both input iterables in lockstep one element pair at a time via a generator,
 * enabling constant-memory streaming over large or even infinite sequences. Input iterables
 * are validated eagerly; element types and equal lengths are validated lazily as elements
 * are consumed. Open source iterators are closed via `return()` on early termination or error.
 *
 * @param {Iterable<number>} a - First input vector (any non-string iterable of IEEE-754 float64 numbers).
 * @param {Iterable<number>} b - Second input vector (any non-string iterable of IEEE-754 float64 numbers).
 * @returns {Generator<number, void, undefined>} A lazy generator yielding `a[i] + b[i]` for each index `i`.
 * @throws {TypeError} If `a` or `b` is not a non-string iterable, or if any yielded element is not a `number`.
 * @throws {RangeError} If `a` and `b` have different lengths (thrown at the first index past the shorter vector).
 *
 * @example
 * const sums = [...vectorAddFloatLazy([1.5, -2.25, 3], [0.5, 2.25, 4])];
 * // sums => [2, 0, 7]
 */
export function vectorAddFloatLazy(a, b) {
	assertIterable(a, 'a')
	assertIterable(b, 'b')

	return (function* streamVectorAdd() {
		const iterA = getIterator(a, 'a')
		let iterB
		try {
			iterB = getIterator(b, 'b')
		} catch (err) {
			if (typeof iterA.return === 'function') {
				iterA.return()
			}
			throw err
		}

		let doneA = false
		let doneB = false

		try {
			let index = 0
			while (true) {
				doneA = true
				const stepA = iterA.next()
				doneA = Boolean(stepA.done)

				doneB = true
				const stepB = iterB.next()
				doneB = Boolean(stepB.done)

				if (doneA && doneB) {
					return
				}
				if (doneA !== doneB) {
					throw new RangeError(
						`Input vectors must have the same length (mismatch at index ${index})`
					)
				}

				const valA = stepA.value
				const valB = stepB.value

				if (typeof valA !== 'number') {
					const actual = valA === null ? 'null' : typeof valA
					throw new TypeError(`Expected a number in vector a at index ${index}, got ${actual}`)
				}
				if (typeof valB !== 'number') {
					const actual = valB === null ? 'null' : typeof valB
					throw new TypeError(`Expected a number in vector b at index ${index}, got ${actual}`)
				}

				yield valA + valB
				index += 1
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
	})()
}
