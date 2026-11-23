/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * @typedef {number | Complex} Coordinate
 */

/**
 * @typedef {'central' | 'forward' | 'backward' | 'fivePoint'} FiniteDifferenceMethod
 */

/**
 * @typedef {Object} DivergenceOptions
 * @property {number | Complex | Iterable<number | Complex>} [h=1e-6]
 *   Finite-difference step size. May be a single positive finite real number,
 *   a non-zero finite complex number `{ re, im }`, or an iterable of per-axis
 *   step sizes matching the spatial dimension.
 * @property {FiniteDifferenceMethod} [method='central']
 *   Finite-difference stencil used to approximate each partial derivative:
 *   - `'central'` (default): 2nd-order central difference `(f(x+h) - f(x-h)) / (2h)`
 *   - `'forward'`: 1st-order forward difference `(f(x+h) - f(x)) / h`
 *   - `'backward'`: 1st-order backward difference `(f(x) - f(x-h)) / h`
 *   - `'fivePoint'`: 4th-order five-point stencil `(-f(x+2h) + 8f(x+h) - 8f(x-h) + f(x-2h)) / (12h)`
 */

const VALID_METHODS = new Set(['central', 'forward', 'backward', 'fivePoint'])
const DEFAULT_STEP = 1e-6

/**
 * Check whether a value is a non-string iterable object.
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonStringIterable(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value !== 'string' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Normalize `-0` to `+0`.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validate and extract a complex number `{ re, im }` with finite components.
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function parseComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`)
	}
	const { re, im } = value
	if (typeof re !== 'number' || !Number.isFinite(re)) {
		throw new TypeError(`${label}.re must be a finite number`)
	}
	if (typeof im !== 'number' || !Number.isFinite(im)) {
		throw new TypeError(`${label}.im must be a finite number`)
	}
	return { re: normalizeZero(re), im: normalizeZero(im) }
}

/**
 * Validate a finite-difference step size (positive finite real or non-zero finite complex).
 * @param {unknown} value
 * @param {string} label
 * @returns {{ re: number, im: number, isComplex: boolean }}
 */
function parseStep(value, label) {
	if (typeof value === 'number') {
		if (!Number.isFinite(value) || value <= 0) {
			throw new RangeError(`${label} must be a positive finite number`)
		}
		return { re: value, im: 0, isComplex: false }
	}
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const c = parseComplex(value, label)
		if (c.re === 0 && c.im === 0) {
			throw new RangeError(`${label} must be a non-zero complex step`)
		}
		return { re: c.re, im: c.im, isComplex: c.im !== 0 }
	}
	throw new TypeError(`${label} must be a positive finite number or non-zero complex { re, im }`)
}

/**
 * Parse a coordinate (either a finite real number or a finite complex `{ re, im }`).
 * @param {unknown} value
 * @param {number} index
 * @returns {Coordinate}
 */
function parseCoordinate(value, index) {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new RangeError(`point[${index}] must be a finite number`)
		}
		return value
	}
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		return parseComplex(value, `point[${index}]`)
	}
	throw new TypeError(`point[${index}] must be a finite number or complex { re, im }`)
}

/**
 * Perturb a single coordinate by `scale * step`.
 * Preserves real number coordinates when the step has zero imaginary part.
 * @param {Coordinate} coord
 * @param {{ re: number, im: number, isComplex: boolean }} step
 * @param {number} scale
 * @returns {Coordinate}
 */
function perturbCoordinate(coord, step, scale) {
	const dRe = scale * step.re
	const dIm = scale * step.im
	if (typeof coord === 'number') {
		if (!step.isComplex) {
			const shifted = coord + dRe
			if (!Number.isFinite(shifted)) {
				throw new RangeError('Perturbed coordinate overflowed to non-finite value')
			}
			return shifted
		}
		const re = coord + dRe
		const im = dIm
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError('Perturbed coordinate overflowed to non-finite value')
		}
		return { re: normalizeZero(re), im: normalizeZero(im) }
	}
	const re = coord.re + dRe
	const im = coord.im + dIm
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Perturbed coordinate overflowed to non-finite value')
	}
	return { re: normalizeZero(re), im: normalizeZero(im) }
}

/**
 * Divide complex number `(numRe + i*numIm)` by `(denRe + i*denIm)` using Smith's algorithm
 * for numerical stability against intermediate overflow/underflow.
 * @param {number} numRe
 * @param {number} numIm
 * @param {number} denRe
 * @param {number} denIm
 * @returns {Complex}
 */
function complexDiv(numRe, numIm, denRe, denIm) {
	let re
	let im
	if (denIm === 0) {
		re = numRe / denRe
		im = numIm / denRe
	} else if (Math.abs(denRe) >= Math.abs(denIm)) {
		const r = denIm / denRe
		const denom = denRe + denIm * r
		re = (numRe + numIm * r) / denom
		im = (numIm - numRe * r) / denom
	} else {
		const r = denRe / denIm
		const denom = denIm + denRe * r
		re = (numRe * r + numIm) / denom
		im = (numIm * r - numRe) / denom
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex division produced a non-finite result')
	}
	return { re: normalizeZero(re), im: normalizeZero(im) }
}

/**
 * Evaluate a single vector-valued field function at `coords` and validate its output.
 * @param {(point: Coordinate[]) => Iterable<Complex>} vectorFieldFn
 * @param {Coordinate[]} coords
 * @param {number} dim
 * @returns {Complex[]}
 */
function evalVectorField(vectorFieldFn, coords, dim) {
	const raw = vectorFieldFn(coords)
	if (!isNonStringIterable(raw)) {
		throw new TypeError('Vector field function must return an iterable of complex { re, im } components')
	}
	const result = []
	let idx = 0
	for (const item of raw) {
		result.push(parseComplex(item, `field(point)[${idx}]`))
		idx++
	}
	if (result.length !== dim) {
		throw new RangeError(
			`Vector field function returned ${result.length} component(s), expected ${dim} to match point dimension`
		)
	}
	return result
}

/**
 * Materialize and validate an iterable of component functions.
 * @param {Iterable<(point: Coordinate[]) => Complex>} fieldIterable
 * @returns {Array<(point: Coordinate[]) => Complex>}
 */
function materializeFieldFunctions(fieldIterable) {
	const fns = []
	let idx = 0
	for (const fn of fieldIterable) {
		if (typeof fn !== 'function') {
			throw new TypeError(`field[${idx}] must be a function`)
		}
		fns.push(fn)
		idx++
	}
	if (fns.length === 0) {
		throw new RangeError('field must contain at least one component function')
	}
	return fns
}

/**
 * Materialize and validate per-axis step sizes.
 * @param {Iterable<number | Complex>} stepIterable
 * @returns {Array<{ re: number, im: number, isComplex: boolean }>}
 */
function materializeStepArray(stepIterable) {
	const steps = []
	let idx = 0
	for (const s of stepIterable) {
		steps.push(parseStep(s, `options.h[${idx}]`))
		idx++
	}
	if (steps.length === 0) {
		throw new RangeError('options.h iterable must not be empty')
	}
	return steps
}

/**
 * Compute the numerical divergence `∇ · F(x) = Σ_i ∂F_i / ∂x_i` of a complex-valued
 * vector field `F` lazily across a sequence (iterable/generator) of points.
 *
 * Consumes `points` one point at a time via a generator, yielding one `{ re, im }`
 * complex divergence value per input point. Works with finite or infinite point
 * streams, real or complex `{ re, im }` coordinates, and supports both an iterable
 * of component functions `[F_0, ..., F_{d-1}]` and a single vector-valued function
 * `F(point) => Iterable<Complex>`.
 *
 * @param {((point: Coordinate[]) => Iterable<Complex>) | Iterable<(point: Coordinate[]) => Complex>} field
 *   Complex vector field, either as a single function returning `d` complex `{ re, im }`
 *   components or as an iterable of `d` component functions each returning `{ re, im }`.
 * @param {Iterable<Iterable<Coordinate>>} points
 *   Iterable (array, generator, or infinite stream) of `d`-dimensional coordinate points.
 *   Consumed lazily one point per `.next()` call.
 * @param {DivergenceOptions} [options={}]
 *   Optional finite-difference configuration (`h` step size and `method` stencil).
 * @returns {Generator<Complex, void, undefined>}
 *   Lazy generator yielding the complex divergence `{ re, im }` at each point.
 * @throws {TypeError} If `field`, `points`, `options`, coordinates, or field outputs have invalid types.
 * @throws {RangeError} If dimensions mismatch, step sizes are invalid, or non-finite values occur.
 */
export function divergenceComplexLazy(field, points, options = {}) {
	const isSingleVectorFn = typeof field === 'function'
	if (!isSingleVectorFn && !isNonStringIterable(field)) {
		throw new TypeError('field must be a function or an iterable of component functions')
	}
	if (!isNonStringIterable(points)) {
		throw new TypeError('points must be an iterable of coordinate points')
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be an object')
	}

	const { h = DEFAULT_STEP, method = 'central' } = options

	if (typeof method !== 'string' || !VALID_METHODS.has(method)) {
		throw new RangeError(
			`options.method must be one of ${Array.from(VALID_METHODS).join(', ')}`
		)
	}

	// Validate eagerly for concrete arrays/scalars while keeping non-array iterables lazy
	let eagerFieldFns = null
	if (!isSingleVectorFn && Array.isArray(field)) {
		eagerFieldFns = materializeFieldFunctions(field)
	}

	let scalarStep = null
	let eagerSteps = null
	let lazyStepIterable = null
	if (isNonStringIterable(h)) {
		if (Array.isArray(h)) {
			eagerSteps = materializeStepArray(h)
		} else {
			lazyStepIterable = h
		}
	} else {
		scalarStep = parseStep(h, 'options.h')
	}

	if (eagerFieldFns !== null && eagerSteps !== null && eagerFieldFns.length !== eagerSteps.length) {
		throw new RangeError(
			`options.h length (${eagerSteps.length}) must match field dimension (${eagerFieldFns.length})`
		)
	}

	return (function* divergenceGenerator() {
		let fieldFns = eagerFieldFns
		let steps = eagerSteps

		for (const rawPoint of points) {
			if (!isNonStringIterable(rawPoint)) {
				throw new TypeError('Each point in points must be an iterable of coordinates')
			}

			const coords = []
			let coordIdx = 0
			for (const c of rawPoint) {
				coords.push(parseCoordinate(c, coordIdx))
				coordIdx++
			}
			const dim = coords.length
			if (dim === 0) {
				throw new RangeError('Each point must have at least one coordinate')
			}

			if (!isSingleVectorFn && fieldFns === null) {
				fieldFns = materializeFieldFunctions(field)
			}
			if (lazyStepIterable !== null && steps === null) {
				steps = materializeStepArray(lazyStepIterable)
			}

			if (!isSingleVectorFn && fieldFns.length !== dim) {
				throw new RangeError(
					`Point dimension (${dim}) does not match field dimension (${fieldFns.length})`
				)
			}
			if (steps !== null && steps.length !== dim) {
				throw new RangeError(
					`options.h length (${steps.length}) does not match point dimension (${dim})`
				)
			}

			// Evaluate base point once if needed for forward/backward on single vector function
			let baseVector = null
			if (isSingleVectorFn && (method === 'forward' || method === 'backward')) {
				baseVector = evalVectorField(field, coords.slice(), dim)
			}

			let sumRe = 0
			let sumIm = 0

			for (let i = 0; i < dim; i++) {
				const step = steps !== null ? steps[i] : scalarStep

				/**
				 * Evaluate component `i` at `coords + scale * step * e_i`.
				 * @param {number} scale
				 * @returns {Complex}
				 */
				const evalAt = (scale) => {
					const shifted = coords.slice()
					if (scale !== 0) {
						shifted[i] = perturbCoordinate(coords[i], step, scale)
					}
					if (isSingleVectorFn) {
						return evalVectorField(field, shifted, dim)[i]
					}
					return parseComplex(fieldFns[i](shifted), `field[${i}](point)`)
				}

				let partial
				if (method === 'central') {
					const fPlus = evalAt(1)
					const fMinus = evalAt(-1)
					partial = complexDiv(
						fPlus.re - fMinus.re,
						fPlus.im - fMinus.im,
						2 * step.re,
						2 * step.im
					)
				} else if (method === 'forward') {
					const f0 = isSingleVectorFn ? baseVector[i] : evalAt(0)
					const fPlus = evalAt(1)
					partial = complexDiv(
						fPlus.re - f0.re,
						fPlus.im - f0.im,
						step.re,
						step.im
					)
				} else if (method === 'backward') {
					const f0 = isSingleVectorFn ? baseVector[i] : evalAt(0)
					const fMinus = evalAt(-1)
					partial = complexDiv(
						f0.re - fMinus.re,
						f0.im - fMinus.im,
						step.re,
						step.im
					)
				} else {
					// fivePoint: (-f(x+2h) + 8f(x+h) - 8f(x-h) + f(x-2h)) / (12h)
					const fPlus2 = evalAt(2)
					const fPlus1 = evalAt(1)
					const fMinus1 = evalAt(-1)
					const fMinus2 = evalAt(-2)
					partial = complexDiv(
						-fPlus2.re + 8 * fPlus1.re - 8 * fMinus1.re + fMinus2.re,
						-fPlus2.im + 8 * fPlus1.im - 8 * fMinus1.im + fMinus2.im,
						12 * step.re,
						12 * step.im
					)
				}

				sumRe += partial.re
				sumIm += partial.im
			}

			if (!Number.isFinite(sumRe) || !Number.isFinite(sumIm)) {
				throw new RangeError('Divergence computation produced a non-finite result')
			}

			yield { re: normalizeZero(sumRe), im: normalizeZero(sumIm) }
		}
	})()
}
