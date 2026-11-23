/**
 * Complex number represented in Cartesian form.
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalizes IEEE-754 negative zero to positive zero.
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Checks whether a value is a non-string iterable object.
 * @param {unknown} value
 * @returns {boolean}
 */
function isIterableSequence(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value !== 'string' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function validateComplex(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be a complex number object { re, im }`)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label} must have numeric re and im properties`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label} must have finite re and im values`)
	}
	return { re, im }
}

/**
 * Multiplies two complex numbers.
 * @param {Complex} x
 * @param {Complex} y
 * @returns {Complex}
 */
function complexMul(x, y) {
	return {
		re: x.re * y.re - x.im * y.im,
		im: x.re * y.im + x.im * y.re,
	}
}

/**
 * Subtracts two complex numbers (`x - y`), normalizing `-0` to `0`.
 * @param {Complex} x
 * @param {Complex} y
 * @returns {Complex}
 */
function complexSub(x, y) {
	return {
		re: normalizeZero(x.re - y.re),
		im: normalizeZero(x.im - y.im),
	}
}

/**
 * Internal generator that lazily consumes two 3D complex vector iterables
 * and yields the three components of their algebraic cross product.
 * @param {Iterable<Complex>} a
 * @param {Iterable<Complex>} b
 * @returns {Generator<Complex, void, undefined>}
 */
function* crossProductComplexGenerator(a, b) {
	const iterA = a[Symbol.iterator]()
	const iterB = b[Symbol.iterator]()

	if (!iterA || typeof iterA.next !== 'function') {
		throw new TypeError('First argument iterator must have a next() method')
	}
	if (!iterB || typeof iterB.next !== 'function') {
		throw new TypeError('Second argument iterator must have a next() method')
	}

	let aDone = false
	let bDone = false

	try {
		const aVec = []
		const bVec = []

		for (let i = 0; i < 3; i++) {
			const stepA = iterA.next()
			if (stepA.done) {
				aDone = true
				throw new RangeError(`First vector must have exactly 3 elements, received ${i}`)
			}
			aVec.push(validateComplex(stepA.value, `a[${i}]`))

			const stepB = iterB.next()
			if (stepB.done) {
				bDone = true
				throw new RangeError(`Second vector must have exactly 3 elements, received ${i}`)
			}
			bVec.push(validateComplex(stepB.value, `b[${i}]`))
		}

		const extraA = iterA.next()
		if (!extraA.done) {
			throw new RangeError('First vector must have exactly 3 elements, received more than 3')
		}
		aDone = true

		const extraB = iterB.next()
		if (!extraB.done) {
			throw new RangeError('Second vector must have exactly 3 elements, received more than 3')
		}
		bDone = true

		const [a0, a1, a2] = aVec
		const [b0, b1, b2] = bVec

		yield complexSub(complexMul(a1, b2), complexMul(a2, b1))
		yield complexSub(complexMul(a2, b0), complexMul(a0, b2))
		yield complexSub(complexMul(a0, b1), complexMul(a1, b0))
	} finally {
		if (!aDone && typeof iterA.return === 'function') {
			iterA.return()
		}
		if (!bDone && typeof iterB.return === 'function') {
			iterB.return()
		}
	}
}

/**
 * Lazily computes the 3D algebraic vector cross product `a × b` over complex numbers `{ re, im }`.
 *
 * Returns a generator that does not pull from either input iterable until iteration begins.
 * Input elements are consumed in lockstep, validated as finite `{ re, im }` complex numbers,
 * and source iterators are closed via `.return()` if validation fails early.
 *
 * The yielded components are:
 * - `c[0] = a[1] * b[2] - a[2] * b[1]`
 * - `c[1] = a[2] * b[0] - a[0] * b[2]`
 * - `c[2] = a[0] * b[1] - a[1] * b[0]`
 *
 * @param {Iterable<Complex>} a - First 3D complex vector sequence.
 * @param {Iterable<Complex>} b - Second 3D complex vector sequence.
 * @returns {Generator<Complex, void, undefined>} Generator yielding the 3 complex components of `a × b`.
 * @throws {TypeError} If either input is not an iterable sequence, or if any element is not a valid `{ re, im }` object.
 * @throws {RangeError} If either vector does not have length 3, or if any component contains non-finite numbers.
 */
export function crossProductComplexLazy(a, b) {
	if (!isIterableSequence(a)) {
		throw new TypeError('First argument must be an iterable sequence of 3 complex numbers { re, im }')
	}
	if (!isIterableSequence(b)) {
		throw new TypeError('Second argument must be an iterable sequence of 3 complex numbers { re, im }')
	}
	return crossProductComplexGenerator(a, b)
}
