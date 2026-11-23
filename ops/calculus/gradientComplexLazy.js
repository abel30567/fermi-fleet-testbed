/**
 * Lazily computes the numerical gradient (first derivative) of a sequence of
 * complex numbers `{ re, im }` using a streaming generator with O(1) memory.
 *
 * Uses second-order accurate central differences at interior points (including
 * Lagrange-weighted differences for non-uniform real or complex coordinates)
 * and first- or second-order one-sided differences at the boundaries.
 *
 * Input iterables (`values` and optional coordinate iterable) are consumed
 * lazily on demand, supporting infinite generators and clean iterator teardown
 * on early termination.
 *
 * @typedef {{ re: number, im: number }} Complex
 *
 * @typedef {object} GradientOptions
 * @property {number | Complex | Iterable<number | Complex>} [spacing=1]
 *   Uniform real/complex step size or an iterable of real/complex coordinates.
 * @property {1 | 2} [edgeOrder=1]
 *   Accuracy order at the first and last boundary points (`1` or `2`).
 *
 * @param {Iterable<Complex>} values
 *   Iterable of complex values `{ re, im }` with finite real and imaginary parts.
 *   An empty iterable yields nothing; a non-empty iterable must yield at least
 *   `edgeOrder + 1` elements or a `RangeError` is thrown during iteration.
 * @param {number | Complex | Iterable<number | Complex> | GradientOptions} [spacing=1]
 *   Uniform non-zero real or complex step size, an iterable of coordinates
 *   matching `values` in length, or an options object when `options` is omitted.
 * @param {GradientOptions} [options]
 *   Optional configuration object (`{ edgeOrder }`).
 * @returns {Generator<Complex, void, undefined>}
 *   Lazy generator yielding the complex gradient `{ re, im }` at each sample.
 */
export function gradientComplexLazy(values, spacing = 1, options = undefined) {
	if (!isIterableObject(values)) {
		throw new TypeError('values must be an iterable (and not a string)')
	}

	let rawSpacing = spacing
	let rawOptions = options
	let allowSpacingOption = false

	if (
		rawOptions === undefined &&
		isPlainOptionsCandidate(rawSpacing)
	) {
		rawOptions = rawSpacing
		rawSpacing = rawOptions.spacing === undefined ? 1 : rawOptions.spacing
		allowSpacingOption = true
	}

	const edgeOrder = parseEdgeOrder(rawOptions, allowSpacingOption)
	const parsedSpacing = parseSpacing(rawSpacing)

	if (parsedSpacing.kind === 'uniform') {
		return streamUniform(values, parsedSpacing.step, edgeOrder)
	}
	return streamNonUniform(values, parsedSpacing.coords, edgeOrder)
}

/**
 * Checks whether a value is a non-string iterable.
 * @param {unknown} value
 * @returns {boolean}
 */
function isIterableObject(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value !== 'string' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Checks whether a value passed as the second argument is an options object
 * rather than a complex scalar or coordinate iterable.
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainOptionsCandidate(value) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false
	}
	if (typeof value[Symbol.iterator] === 'function') {
		return false
	}
	if ('re' in value || 'im' in value) {
		return false
	}
	return true
}

/**
 * Validates and extracts `edgeOrder` from an options object.
 * @param {unknown} options
 * @param {boolean} allowSpacingOption
 * @returns {1 | 2}
 */
function parseEdgeOrder(options, allowSpacingOption) {
	if (options === undefined) {
		return 1
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}
	for (const key of Object.keys(options)) {
		if (key !== 'edgeOrder' && !(allowSpacingOption && key === 'spacing')) {
			throw new TypeError(`Unknown option: ${key}`)
		}
	}
	const { edgeOrder = 1 } = options
	if (typeof edgeOrder !== 'number' || Number.isNaN(edgeOrder)) {
		throw new TypeError('edgeOrder must be 1 or 2')
	}
	if (edgeOrder !== 1 && edgeOrder !== 2) {
		throw new RangeError('edgeOrder must be 1 or 2')
	}
	return edgeOrder
}

/**
 * Validates spacing as either a uniform real/complex step or a coordinate iterable.
 * @param {unknown} spacing
 * @returns {{ kind: 'uniform', step: Complex } | { kind: 'coords', coords: Iterable<number | Complex> }}
 */
function parseSpacing(spacing) {
	if (typeof spacing === 'number') {
		if (!Number.isFinite(spacing)) {
			throw new RangeError('spacing must be a finite non-zero number')
		}
		if (spacing === 0) {
			throw new RangeError('spacing must be non-zero')
		}
		return { kind: 'uniform', step: makeComplex(spacing, 0) }
	}
	if (isIterableObject(spacing)) {
		return { kind: 'coords', coords: spacing }
	}
	if (typeof spacing === 'object' && spacing !== null && !Array.isArray(spacing)) {
		const step = validateComplex(spacing, 'spacing')
		if (step.re === 0 && step.im === 0) {
			throw new RangeError('spacing must be non-zero')
		}
		return { kind: 'uniform', step }
	}
	throw new TypeError('spacing must be a non-zero number, complex { re, im }, or iterable of coordinates')
}

/**
 * Validates a complex object `{ re, im }` with finite numeric components.
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function validateComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex object { re, im }`)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label} must have numeric re and im properties`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label} must have finite re and im values`)
	}
	return makeComplex(re, im)
}

/**
 * Validates a coordinate value (either a finite real number or finite complex `{ re, im }`).
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function validateCoord(value, label) {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new RangeError(`${label} must be finite`)
		}
		return makeComplex(value, 0)
	}
	return validateComplex(value, label)
}

/**
 * Constructs a Complex object with `-0` normalized to `0`.
 * @param {number} re
 * @param {number} im
 * @returns {Complex}
 */
function makeComplex(re, im) {
	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}

/** @param {Complex} a @param {Complex} b @returns {Complex} */
function cAdd(a, b) {
	return makeComplex(a.re + b.re, a.im + b.im)
}

/** @param {Complex} a @param {Complex} b @returns {Complex} */
function cSub(a, b) {
	return makeComplex(a.re - b.re, a.im - b.im)
}

/** @param {Complex} a @param {number} s @returns {Complex} */
function cScale(a, s) {
	return makeComplex(a.re * s, a.im * s)
}

/** @param {Complex} a @param {Complex} b @returns {Complex} */
function cMul(a, b) {
	return makeComplex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re)
}

/**
 * Overflow-resistant complex division using Smith's formula.
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function cDiv(a, b) {
	const { re: ar, im: ai } = a
	const { re: br, im: bi } = b
	if (Math.abs(br) >= Math.abs(bi)) {
		const r = bi / br
		const denom = br + bi * r
		return makeComplex((ar + ai * r) / denom, (ai - ar * r) / denom)
	}
	const r = br / bi
	const denom = bi + br * r
	return makeComplex((ar * r + ai) / denom, (ai * r - ar) / denom)
}

/** @param {Complex} z @returns {boolean} */
function isZero(z) {
	return z.re === 0 && z.im === 0
}

/**
 * Computes central difference `(next - prev) / (2 * step)` without spurious overflow.
 * @param {Complex} prev
 * @param {Complex} next
 * @param {Complex} step
 * @param {Complex | null} twoStep
 * @returns {Complex}
 */
function centralUniform(prev, next, step, twoStep) {
	const diff = cSub(next, prev)
	if (twoStep !== null) {
		return cDiv(diff, twoStep)
	}
	return cDiv(cScale(diff, 0.5), step)
}

/**
 * Streaming generator for uniform spacing.
 * @param {Iterable<Complex>} values
 * @param {Complex} step
 * @param {1 | 2} edgeOrder
 * @returns {Generator<Complex, void, undefined>}
 */
function* streamUniform(values, step, edgeOrder) {
	const iter = values[Symbol.iterator]()
	let done = false
	const twoRe = 2 * step.re
	const twoIm = 2 * step.im
	const twoStep =
		Number.isFinite(twoRe) && Number.isFinite(twoIm)
			? makeComplex(twoRe, twoIm)
			: null

	try {
		const r0 = iter.next()
		if (r0.done) {
			done = true
			return
		}
		const y0 = validateComplex(r0.value, 'values[0]')

		const r1 = iter.next()
		if (r1.done) {
			done = true
			throw new RangeError(`gradientComplexLazy requires at least ${edgeOrder + 1} values`)
		}
		const y1 = validateComplex(r1.value, 'values[1]')

		if (edgeOrder === 1) {
			yield cDiv(cSub(y1, y0), step)

			let prev = y0
			let curr = y1
			let index = 2

			while (true) {
				const r = iter.next()
				if (r.done) {
					done = true
					yield cDiv(cSub(curr, prev), step)
					return
				}
				const next = validateComplex(r.value, `values[${index}]`)
				yield centralUniform(prev, next, step, twoStep)
				prev = curr
				curr = next
				index++
			}
		}

		// edgeOrder === 2
		const r2 = iter.next()
		if (r2.done) {
			done = true
			throw new RangeError('gradientComplexLazy with edgeOrder 2 requires at least 3 values')
		}
		const y2 = validateComplex(r2.value, 'values[2]')

		const s1Init = cDiv(cSub(y1, y0), step)
		const s2Init = cDiv(cSub(y2, y1), step)
		yield cAdd(s1Init, cScale(cSub(s1Init, s2Init), 0.5))
		yield centralUniform(y0, y2, step, twoStep)

		let prevPrev = y0
		let prev = y1
		let curr = y2
		let index = 3

		while (true) {
			const r = iter.next()
			if (r.done) {
				done = true
				const s1End = cDiv(cSub(prev, prevPrev), step)
				const s2End = cDiv(cSub(curr, prev), step)
				yield cAdd(s2End, cScale(cSub(s2End, s1End), 0.5))
				return
			}
			const next = validateComplex(r.value, `values[${index}]`)
			yield centralUniform(prev, next, step, twoStep)
			prevPrev = prev
			prev = curr
			curr = next
			index++
		}
	} finally {
		if (!done && typeof iter.return === 'function') {
			iter.return()
		}
	}
}

/**
 * Streaming generator for non-uniform coordinate iterables.
 * @param {Iterable<Complex>} values
 * @param {Iterable<number | Complex>} coords
 * @param {1 | 2} edgeOrder
 * @returns {Generator<Complex, void, undefined>}
 */
function* streamNonUniform(values, coords, edgeOrder) {
	const valIter = values[Symbol.iterator]()
	let valDone = false
	let coordIter
	let coordDone = false

	try {
		coordIter = coords[Symbol.iterator]()

		const nextPair = (index) => {
			const rv = valIter.next()
			if (rv.done) valDone = true
			const rc = coordIter.next()
			if (rc.done) coordDone = true

			if (rv.done !== rc.done) {
				throw new RangeError('values and coords iterables must have the same length')
			}
			if (rv.done) {
				return null
			}
			return {
				y: validateComplex(rv.value, `values[${index}]`),
				x: validateCoord(rc.value, `coords[${index}]`),
			}
		}

		const p0 = nextPair(0)
		if (p0 === null) {
			return
		}

		const p1 = nextPair(1)
		if (p1 === null) {
			throw new RangeError(`gradientComplexLazy requires at least ${edgeOrder + 1} values`)
		}

		const h1 = cSub(p1.x, p0.x)
		if (isZero(h1)) {
			throw new RangeError('Adjacent coordinates must be distinct (coords[0] equals coords[1])')
		}
		const s1 = cDiv(cSub(p1.y, p0.y), h1)

		if (edgeOrder === 1) {
			yield s1

			let curr = p1
			let hPrev = h1
			let sPrev = s1
			let index = 2

			while (true) {
				const pNext = nextPair(index)
				if (pNext === null) {
					yield sPrev
					return
				}
				const hNext = cSub(pNext.x, curr.x)
				if (isZero(hNext)) {
					throw new RangeError(
						`Adjacent coordinates must be distinct (coords[${index - 1}] equals coords[${index}])`,
					)
				}
				const hSum = cAdd(hPrev, hNext)
				if (isZero(hSum)) {
					throw new RangeError(
						`Degenerate coordinate stencil (coords[${index - 2}] equals coords[${index}])`,
					)
				}
				const sNext = cDiv(cSub(pNext.y, curr.y), hNext)
				yield cAdd(cMul(cDiv(hPrev, hSum), sNext), cMul(cDiv(hNext, hSum), sPrev))

				curr = pNext
				hPrev = hNext
				sPrev = sNext
				index++
			}
		}

		// edgeOrder === 2
		const p2 = nextPair(2)
		if (p2 === null) {
			throw new RangeError('gradientComplexLazy with edgeOrder 2 requires at least 3 values')
		}

		const h2 = cSub(p2.x, p1.x)
		if (isZero(h2)) {
			throw new RangeError('Adjacent coordinates must be distinct (coords[1] equals coords[2])')
		}
		const h12 = cAdd(h1, h2)
		if (isZero(h12)) {
			throw new RangeError('Degenerate coordinate stencil (coords[0] equals coords[2])')
		}
		const s2 = cDiv(cSub(p2.y, p1.y), h2)

		yield cAdd(s1, cMul(cDiv(h1, h12), cSub(s1, s2)))
		yield cAdd(cMul(cDiv(h1, h12), s2), cMul(cDiv(h2, h12), s1))

		let curr = p2
		let hPrevPrev = h1
		let hPrev = h2
		let sPrevPrev = s1
		let sPrev = s2
		let index = 3

		while (true) {
			const pNext = nextPair(index)
			if (pNext === null) {
				const hEndSum = cAdd(hPrevPrev, hPrev)
				yield cAdd(sPrev, cMul(cDiv(hPrev, hEndSum), cSub(sPrev, sPrevPrev)))
				return
			}
			const hNext = cSub(pNext.x, curr.x)
			if (isZero(hNext)) {
				throw new RangeError(
					`Adjacent coordinates must be distinct (coords[${index - 1}] equals coords[${index}])`,
				)
			}
			const hSum = cAdd(hPrev, hNext)
			if (isZero(hSum)) {
				throw new RangeError(
					`Degenerate coordinate stencil (coords[${index - 2}] equals coords[${index}])`,
				)
			}
			const sNext = cDiv(cSub(pNext.y, curr.y), hNext)
			yield cAdd(cMul(cDiv(hPrev, hSum), sNext), cMul(cDiv(hNext, hSum), sPrev))

			curr = pNext
			hPrevPrev = hPrev
			hPrev = hNext
			sPrevPrev = sPrev
			sPrev = sNext
			index++
		}
	} finally {
		try {
			if (!valDone && typeof valIter.return === 'function') {
				valIter.return()
			}
		} finally {
			if (coordIter && !coordDone && typeof coordIter.return === 'function') {
				coordIter.return()
			}
		}
	}
}
