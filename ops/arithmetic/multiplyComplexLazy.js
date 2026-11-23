/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Checks whether a value is a non-string iterable.
 *
 * @param {unknown} value
 * @returns {value is Iterable<unknown>}
 */
function isIterable(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value !== 'string' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function assertComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}
	return { re, im }
}

/**
 * Multiplies two validated complex numbers, normalizing `-0` to `0`.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function multiplyPair(a, b) {
	const re = a.re * b.re - a.im * b.im
	const im = a.re * b.im + a.im * b.re
	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}

/**
 * Generator that lazily zips and multiplies two iterables of complex numbers.
 * Stops as soon as the shorter iterable ends and closes any open iterators.
 *
 * @param {Iterable<Complex>} iterA
 * @param {Iterable<Complex>} iterB
 * @returns {Generator<Complex, void, undefined>}
 */
function* multiplyIterables(iterA, iterB) {
	const itA = iterA[Symbol.iterator]()
	const itB = iterB[Symbol.iterator]()
	let doneA = false
	let doneB = false
	let index = 0

	try {
		while (true) {
			const stepA = itA.next()
			if (stepA.done) {
				doneA = true
				return
			}
			const stepB = itB.next()
			if (stepB.done) {
				doneB = true
				return
			}
			const a = assertComplex(stepA.value, `a[${index}]`)
			const b = assertComplex(stepB.value, `b[${index}]`)
			index += 1
			yield multiplyPair(a, b)
		}
	} finally {
		if (!doneA && typeof itA.return === 'function') {
			itA.return()
		}
		if (!doneB && typeof itB.return === 'function') {
			itB.return()
		}
	}
}

/**
 * Generator that lazily multiplies an iterable of complex numbers with a scalar complex number.
 *
 * @param {Iterable<Complex>} iterable
 * @param {Complex} scalar
 * @param {boolean} scalarFirst
 * @returns {Generator<Complex, void, undefined>}
 */
function* multiplyIterableAndScalar(iterable, scalar, scalarFirst) {
	const label = scalarFirst ? 'b' : 'a'
	const it = iterable[Symbol.iterator]()
	let done = false
	let index = 0

	try {
		while (true) {
			const step = it.next()
			if (step.done) {
				done = true
				return
			}
			const item = assertComplex(step.value, `${label}[${index}]`)
			index += 1
			yield scalarFirst ? multiplyPair(scalar, item) : multiplyPair(item, scalar)
		}
	} finally {
		if (!done && typeof it.return === 'function') {
			it.return()
		}
	}
}

/**
 * Generator yielding a single complex product.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Generator<Complex, void, undefined>}
 */
function* multiplyScalars(a, b) {
	yield multiplyPair(a, b)
}

/**
 * Lazily multiplies complex numbers represented as `{ re, im }` objects using a
 * streaming generator.
 *
 * Each operand may be either a single complex number `{ re, im }` or an iterable
 * sequence (array, generator, Set, custom iterable) of complex numbers:
 * - Two iterables: lazily zips them element-by-element, yielding `a[i] * b[i]`
 *   until the shorter iterable is exhausted.
 * - One iterable and one scalar complex number: lazily broadcasts the scalar
 *   across the iterable.
 * - Two scalar complex numbers: yields their single product `{ re, im }`.
 *
 * Top-level operand types and scalar values are validated eagerly; iterable
 * elements are pulled and validated strictly on demand as the returned generator
 * is iterated.
 *
 * @param {Complex | Iterable<Complex>} a - First complex operand or iterable of complex numbers.
 * @param {Complex | Iterable<Complex>} b - Second complex operand or iterable of complex numbers.
 * @returns {Generator<Complex, void, undefined>} A lazy generator yielding `{ re, im }` products.
 * @throws {TypeError} If an operand is neither a valid `{ re, im }` object nor a non-string iterable,
 *   or if a yielded element has missing/non-numeric `re`/`im`.
 * @throws {RangeError} If any complex component is `NaN`, `Infinity`, or `-Infinity`.
 */
export function multiplyComplexLazy(a, b) {
	const aIsIterable = isIterable(a)
	const bIsIterable = isIterable(b)

	if (aIsIterable && bIsIterable) {
		return multiplyIterables(a, b)
	}
	if (aIsIterable) {
		const scalarB = assertComplex(b, 'b')
		return multiplyIterableAndScalar(a, scalarB, false)
	}
	if (bIsIterable) {
		const scalarA = assertComplex(a, 'a')
		return multiplyIterableAndScalar(b, scalarA, true)
	}

	const scalarA = assertComplex(a, 'a')
	const scalarB = assertComplex(b, 'b')
	return multiplyScalars(scalarA, scalarB)
}
