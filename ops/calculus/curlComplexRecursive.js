/**
 * @typedef {{ re: number, im: number }} Complex
 * @typedef {[Complex, Complex, Complex]} ComplexVector3
 * @typedef {(point: ComplexVector3) => ComplexVector3} ComplexVectorField3
 * @typedef {object} CurlOptions
 * @property {number} [h=1e-2] Initial real step size for recursive central differences (must be finite and > 0).
 * @property {number} [maxDepth=5] Maximum Richardson extrapolation recursion depth (integer in [0, 16]).
 * @property {number} [tolerance=1e-12] Convergence tolerance for successive Richardson diagonal estimates (finite >= 0).
 */

const DEFAULT_STEP = 1e-2
const DEFAULT_MAX_DEPTH = 5
const DEFAULT_TOLERANCE = 1e-12
const MAX_ALLOWED_DEPTH = 16

/**
 * Normalizes negative zero (-0) to +0.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function validateComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object with numeric { re, im } properties`)
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}
	return { re: normalizeZero(re), im: normalizeZero(im) }
}

/**
 * Validates that a value is a 3-element array of finite complex numbers.
 *
 * @param {unknown} vec
 * @param {string} label
 * @returns {ComplexVector3}
 */
function validateComplexVector3(vec, label) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${label} must be an array of 3 complex numbers`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${label} must have length 3, received ${vec.length}`)
	}
	return [
		validateComplex(vec[0], `${label}[0]`),
		validateComplex(vec[1], `${label}[1]`),
		validateComplex(vec[2], `${label}[2]`),
	]
}

/**
 * Validates optional configuration parameters.
 *
 * @param {unknown} options
 * @returns {{ h: number, maxDepth: number, tolerance: number }}
 */
function validateOptions(options) {
	if (options === undefined) {
		return {
			h: DEFAULT_STEP,
			maxDepth: DEFAULT_MAX_DEPTH,
			tolerance: DEFAULT_TOLERANCE,
		}
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object when provided')
	}

	const opts = /** @type {Record<string, unknown>} */ (options)
	const h = opts.h === undefined ? DEFAULT_STEP : opts.h
	const maxDepth = opts.maxDepth === undefined ? DEFAULT_MAX_DEPTH : opts.maxDepth
	const tolerance = opts.tolerance === undefined ? DEFAULT_TOLERANCE : opts.tolerance

	if (typeof h !== 'number') {
		throw new TypeError('options.h must be a number')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('options.h must be a finite positive number')
	}

	if (typeof maxDepth !== 'number') {
		throw new TypeError('options.maxDepth must be an integer')
	}
	if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > MAX_ALLOWED_DEPTH) {
		throw new RangeError(`options.maxDepth must be an integer between 0 and ${MAX_ALLOWED_DEPTH}`)
	}

	if (typeof tolerance !== 'number') {
		throw new TypeError('options.tolerance must be a number')
	}
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError('options.tolerance must be a finite non-negative number')
	}

	return { h, maxDepth, tolerance }
}

/**
 * Subtracts two complex numbers: a - b.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexSub(a, b) {
	return {
		re: normalizeZero(a.re - b.re),
		im: normalizeZero(a.im - b.im),
	}
}

/**
 * Scales a complex number by a real factor.
 *
 * @param {Complex} a
 * @param {number} factor
 * @returns {Complex}
 */
function complexScale(a, factor) {
	return {
		re: normalizeZero(a.re * factor),
		im: normalizeZero(a.im * factor),
	}
}

/**
 * Computes the modulus |a| of a complex number.
 *
 * @param {Complex} a
 * @returns {number}
 */
function complexAbs(a) {
	return Math.hypot(a.re, a.im)
}

/**
 * Evaluates a complex vector field at a validated 3D point.
 *
 * @param {ComplexVectorField3} field
 * @param {ComplexVector3} point
 * @returns {ComplexVector3}
 */
function evaluateField(field, point) {
	const result = field([
		{ re: point[0].re, im: point[0].im },
		{ re: point[1].re, im: point[1].im },
		{ re: point[2].re, im: point[2].im },
	])
	return validateComplexVector3(result, 'field(point)')
}

/**
 * Evaluates the central difference approximation of ∂F_comp / ∂x_axis at `point`
 * with step `h` along the real axis.
 *
 * @param {ComplexVectorField3} field
 * @param {ComplexVector3} point
 * @param {0 | 1 | 2} comp
 * @param {0 | 1 | 2} axis
 * @param {number} h
 * @returns {Complex}
 */
function centralDifference(field, point, comp, axis, h) {
	/** @type {ComplexVector3} */
	const plusPoint = [
		{ re: point[0].re, im: point[0].im },
		{ re: point[1].re, im: point[1].im },
		{ re: point[2].re, im: point[2].im },
	]
	/** @type {ComplexVector3} */
	const minusPoint = [
		{ re: point[0].re, im: point[0].im },
		{ re: point[1].re, im: point[1].im },
		{ re: point[2].re, im: point[2].im },
	]

	plusPoint[axis] = { re: plusPoint[axis].re + h, im: plusPoint[axis].im }
	minusPoint[axis] = { re: minusPoint[axis].re - h, im: minusPoint[axis].im }

	const fPlus = evaluateField(field, plusPoint)[comp]
	const fMinus = evaluateField(field, minusPoint)[comp]

	return complexScale(complexSub(fPlus, fMinus), 1 / (2 * h))
}

/**
 * Recursively computes a single Richardson extrapolation row from the previous row
 * and the new base central difference value at halved step size.
 *
 * For central differences, truncation error expands in even powers of h (h^2, h^4, ...),
 * so column k uses factor 4^k: R(n, k) = (4^k * R(n, k-1) - R(n-1, k-1)) / (4^k - 1).
 *
 * @param {Complex[]} prevRow
 * @param {Complex} currVal
 * @param {number} col
 * @param {number} power4
 * @param {Complex[]} acc
 * @returns {Complex[]}
 */
function extrapolateRowRecursive(prevRow, currVal, col, power4, acc) {
	acc.push(currVal)
	if (col > prevRow.length) {
		return acc
	}
	const prevColVal = prevRow[col - 1]
	const numerator = complexSub(complexScale(currVal, power4), prevColVal)
	const nextVal = complexScale(numerator, 1 / (power4 - 1))
	return extrapolateRowRecursive(prevRow, nextVal, col + 1, power4 * 4, acc)
}

/**
 * Recursively computes the partial derivative ∂F_comp / ∂x_axis using
 * divide-and-conquer step-halving Richardson extrapolation.
 *
 * @param {ComplexVectorField3} field
 * @param {ComplexVector3} point
 * @param {0 | 1 | 2} comp
 * @param {0 | 1 | 2} axis
 * @param {number} h
 * @param {number} level
 * @param {Complex[] | null} prevRow
 * @param {number} prevError
 * @param {number} maxDepth
 * @param {number} tolerance
 * @returns {Complex}
 */
function partialDerivativeRecursive(
	field,
	point,
	comp,
	axis,
	h,
	level,
	prevRow,
	prevError,
	maxDepth,
	tolerance,
) {
	const baseEstimate = centralDifference(field, point, comp, axis, h)

	if (prevRow === null) {
		if (level >= maxDepth) {
			return baseEstimate
		}
		return partialDerivativeRecursive(
			field,
			point,
			comp,
			axis,
			h / 2,
			level + 1,
			[baseEstimate],
			Number.POSITIVE_INFINITY,
			maxDepth,
			tolerance,
		)
	}

	const currRow = extrapolateRowRecursive(prevRow, baseEstimate, 1, 4, [])
	const bestCurr = currRow[currRow.length - 1]
	const bestPrev = prevRow[prevRow.length - 1]
	const err = complexAbs(complexSub(bestCurr, bestPrev))

	if (err <= tolerance) {
		return bestCurr
	}

	// Guard against floating-point cancellation when step size becomes too small.
	if (level >= 2 && err > prevError) {
		return bestPrev
	}

	if (level >= maxDepth) {
		return bestCurr
	}

	return partialDerivativeRecursive(
		field,
		point,
		comp,
		axis,
		h / 2,
		level + 1,
		currRow,
		err,
		maxDepth,
		tolerance,
	)
}

/**
 * Curl component specifications:
 * - curl_x = ∂F_z/∂y - ∂F_y/∂z
 * - curl_y = ∂F_x/∂z - ∂F_z/∂x
 * - curl_z = ∂F_y/∂x - ∂F_x/∂y
 *
 * @type {ReadonlyArray<{ posComp: 0|1|2, posAxis: 0|1|2, negComp: 0|1|2, negAxis: 0|1|2 }>}
 */
const CURL_SPECS = Object.freeze([
	{ posComp: 2, posAxis: 1, negComp: 1, negAxis: 2 },
	{ posComp: 0, posAxis: 2, negComp: 2, negAxis: 0 },
	{ posComp: 1, posAxis: 0, negComp: 0, negAxis: 1 },
])

/**
 * Divide-and-conquer recursive evaluator over curl component specifications.
 *
 * @param {number} start
 * @param {number} end
 * @param {ComplexVectorField3} field
 * @param {ComplexVector3} point
 * @param {{ h: number, maxDepth: number, tolerance: number }} opts
 * @returns {Complex[]}
 */
function computeCurlSliceRecursive(start, end, field, point, opts) {
	if (end - start === 1) {
		const spec = CURL_SPECS[start]
		const posTerm = partialDerivativeRecursive(
			field,
			point,
			spec.posComp,
			spec.posAxis,
			opts.h,
			0,
			null,
			Number.POSITIVE_INFINITY,
			opts.maxDepth,
			opts.tolerance,
		)
		const negTerm = partialDerivativeRecursive(
			field,
			point,
			spec.negComp,
			spec.negAxis,
			opts.h,
			0,
			null,
			Number.POSITIVE_INFINITY,
			opts.maxDepth,
			opts.tolerance,
		)
		return [complexSub(posTerm, negTerm)]
	}

	const mid = (start + end) >> 1
	const left = computeCurlSliceRecursive(start, mid, field, point, opts)
	const right = computeCurlSliceRecursive(mid, end, field, point, opts)
	return left.concat(right)
}

/**
 * Computes the curl (∇ × F) of a 3D complex vector field at a given 3D complex point
 * using a recursive divide-and-conquer implementation.
 *
 * The curl components are partitioned via divide-and-conquer recursion, and each
 * partial derivative is refined via recursive step-halving Richardson extrapolation
 * over central differences. For holomorphic fields on C^3 or complex-valued fields
 * on R^3 (with im = 0), perturbing along the real step yields the exact complex
 * partial derivatives.
 *
 * @param {ComplexVectorField3} field 3D vector field mapping `[x, y, z]` (each `{ re, im }`) to `[Fx, Fy, Fz]` (each `{ re, im }`).
 * @param {ComplexVector3} point Evaluation point `[x, y, z]` with finite complex coordinates `{ re, im }`.
 * @param {CurlOptions} [options] Optional numerical parameters (`h`, `maxDepth`, `tolerance`).
 * @returns {ComplexVector3} The curl vector `[curl_x, curl_y, curl_z]` as `{ re, im }` complex numbers.
 * @throws {TypeError} If `field`, `point`, `options`, or `field` return values have invalid types.
 * @throws {RangeError} If `point` or `field` output does not have length 3, or numeric values are non-finite / out of range.
 */
export function curlComplexRecursive(field, point, options) {
	if (typeof field !== 'function') {
		throw new TypeError('field must be a function mapping [x, y, z] to [Fx, Fy, Fz]')
	}
	const validatedPoint = validateComplexVector3(point, 'point')
	const validatedOpts = validateOptions(options)

	const [cx, cy, cz] = computeCurlSliceRecursive(0, CURL_SPECS.length, field, validatedPoint, validatedOpts)
	return [cx, cy, cz]
}
