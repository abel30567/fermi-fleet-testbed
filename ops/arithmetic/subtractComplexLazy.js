/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Checks whether a value is a non-string iterable object.
 *
 * @param {unknown} value
 * @returns {value is Iterable<unknown>}
 */
function isIterableObject(value) {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function validateComplex(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number { re, im }`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${label} must have numeric re and im properties`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${label} re and im must be finite numbers`)
	}
	return value
}

/**
 * Normalizes -0 to 0.
 *
 * @param {number} n
 * @returns {number}
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n
}

/**
 * Subtracts two validated complex numbers.
 *
 * @param {Complex} left
 * @param {Complex} right
 * @returns {Complex}
 */
function subtractPair(left, right) {
	return {
		re: normalizeZero(left.re - right.re),
		im: normalizeZero(left.im - right.im),
	}
}

/**
 * Internal generator performing lazy complex subtraction with iterator cleanup.
 *
 * @param {Complex | Iterable<Complex>} a
 * @param {boolean} aIsIterable
 * @param {Complex | Iterable<Complex>} b
 * @param {boolean} bIsIterable
 * @returns {Generator<Complex, void, undefined>}
 */
function* subtractStream(a, aIsIterable, b, bIsIterable) {
	if (!aIsIterable && !bIsIterable) {
		yield subtractPair(a, b)
		return
	}

	const iterA = aIsIterable ? a[Symbol.iterator]() : null
	const iterB = bIsIterable ? b[Symbol.iterator]() : null
	let doneA = false
	let doneB = false

	try {
		while (true) {
			let valA
			if (aIsIterable) {
				const nextA = iterA.next()
				if (nextA.done) {
					doneA = true
					return
				}
				valA = validateComplex(nextA.value, 'a element')
			} else {
				valA = a
			}

			let valB
			if (bIsIterable) {
				const nextB = iterB.next()
				if (nextB.done) {
					doneB = true
					return
				}
				valB = validateComplex(nextB.value, 'b element')
			} else {
				valB = b
			}

			yield subtractPair(valA, valB)
		}
	} finally {
		try {
			if (iterA && !doneA && typeof iterA.return === 'function') {
				iterA.return()
			}
		} finally {
			if (iterB && !doneB && typeof iterB.return === 'function') {
				iterB.return()
			}
		}
	}
}

/**
 * Lazily subtracts complex numbers `{ re, im }` using a streaming generator.
 *
 * Each argument may be either a single complex number `{ re, im }` or an iterable
 * sequence of complex numbers (arrays, generators, Sets, custom iterables).
 * When both arguments are iterables, elements are consumed lazily in lockstep and
 * iteration stops as soon as the shorter sequence ends. When one argument is a
 * single complex number and the other is an iterable, the scalar is broadcast
 * across the stream. When both arguments are single complex numbers, a single
 * difference is yielded.
 *
 * Top-level arguments are validated eagerly; iterable elements are validated
 * lazily as they are consumed. Underlying iterators are closed via `.return()`
 * on early termination or error.
 *
 * @param {Complex | Iterable<Complex>} a Minuend complex number or iterable of complex numbers.
 * @param {Complex | Iterable<Complex>} b Subtrahend complex number or iterable of complex numbers.
 * @returns {Generator<Complex, void, undefined>} Generator yielding complex differences `{ re, im }`.
 * @throws {TypeError} If an input is neither a valid complex number nor a non-string iterable, or an element is malformed.
 * @throws {RangeError} If any complex component (`re` or `im`) is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function subtractComplexLazy(a, b) {
	const aIsIterable = isIterableObject(a)
	const bIsIterable = isIterableObject(b)

	if (!aIsIterable) {
		validateComplex(a, 'a')
	}
	if (!bIsIterable) {
		validateComplex(b, 'b')
	}

	return subtractStream(a, aIsIterable, b, bIsIterable)
}
