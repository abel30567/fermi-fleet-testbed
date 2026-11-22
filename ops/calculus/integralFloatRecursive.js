/**
 * Definite numerical integration over IEEE-754 float64 numbers using a
 * recursive divide-and-conquer adaptive Simpson's rule.
 *
 * The interval `[a, b]` is recursively bisected into `[x0, xm]` and `[xm, x2]`
 * until the Richardson extrapolation error estimate `|S_left + S_right - S_whole| / 15`
 * is within the local tolerance budget (or floating-point / depth limits are reached).
 *
 * @module ops/calculus/integralFloatRecursive
 */

const DEFAULT_TOLERANCE = 1e-10
const DEFAULT_MAX_DEPTH = 20
const DEFAULT_MIN_DEPTH = 2

/**
 * Evaluates the integrand `f` at `x` and ensures it produces a finite float64 number.
 *
 * @param {(x: number) => number} f - Integrand function.
 * @param {number} x - Evaluation point.
 * @returns {number} Finite float64 function value `f(x)`.
 */
function evalIntegrand(f, x) {
	const y = f(x)
	if (typeof y !== 'number') {
		throw new TypeError(`Integrand must return a number, got ${typeof y} at x=${x}`)
	}
	if (!Number.isFinite(y)) {
		throw new RangeError(`Integrand returned non-finite value ${y} at x=${x}`)
	}
	return y
}

/**
 * Computes Simpson's 1/3 rule estimate on `[x0, x2]` with midpoint value `f1`.
 *
 * @param {number} x0 - Left endpoint.
 * @param {number} x2 - Right endpoint.
 * @param {number} f0 - Value `f(x0)`.
 * @param {number} f1 - Value `f((x0 + x2) / 2)`.
 * @param {number} f2 - Value `f(x2)`.
 * @returns {number} Simpson's rule approximation over `[x0, x2]`.
 */
function simpson(x0, x2, f0, f1, f2) {
	return ((x2 - x0) / 6) * (f0 + 4 * f1 + f2)
}

/**
 * Recursively integrates `f` over `[x0, x2]` via adaptive Simpson's rule with
 * Richardson extrapolation.
 *
 * @param {(x: number) => number} f - Integrand function.
 * @param {number} x0 - Left endpoint (`x0 < x2`).
 * @param {number} x2 - Right endpoint.
 * @param {number} f0 - Cached `f(x0)`.
 * @param {number} f1 - Cached `f(x1)` where `x1` is the midpoint of `[x0, x2]`.
 * @param {number} f2 - Cached `f(x2)`.
 * @param {number} whole - Coarse Simpson estimate over `[x0, x2]`.
 * @param {number} tol - Error tolerance budget for `[x0, x2]`.
 * @param {number} depth - Current recursion depth.
 * @param {number} minDepth - Minimum recursion depth before accepting convergence.
 * @param {number} maxDepth - Maximum allowed recursion depth.
 * @returns {number} Refined integral approximation over `[x0, x2]`.
 */
function adaptiveSimpsonRecursive(f, x0, x2, f0, f1, f2, whole, tol, depth, minDepth, maxDepth) {
	if (depth >= maxDepth) {
		return whole
	}

	const x1 = x0 + (x2 - x0) / 2
	const lm = x0 + (x1 - x0) / 2
	const rm = x1 + (x2 - x1) / 2

	// Stop if floating-point precision can no longer resolve distinct midpoints.
	if (lm === x0 || lm === x1 || rm === x1 || rm === x2) {
		return whole
	}

	const flm = evalIntegrand(f, lm)
	const frm = evalIntegrand(f, rm)

	const left = simpson(x0, x1, f0, flm, f1)
	const right = simpson(x1, x2, f1, frm, f2)
	const delta = left + right - whole

	// Guard against futile subdivision below IEEE-754 float64 rounding noise.
	const roundoffFloor = 8 * Number.EPSILON * (Math.abs(left) + Math.abs(right))

	if (depth >= minDepth && (Math.abs(delta) <= 15 * tol || Math.abs(delta) <= roundoffFloor)) {
		return left + right + delta / 15
	}

	const halfTol = tol / 2
	const leftIntegral = adaptiveSimpsonRecursive(
		f,
		x0,
		x1,
		f0,
		flm,
		f1,
		left,
		halfTol,
		depth + 1,
		minDepth,
		maxDepth,
	)
	const rightIntegral = adaptiveSimpsonRecursive(
		f,
		x1,
		x2,
		f1,
		frm,
		f2,
		right,
		halfTol,
		depth + 1,
		minDepth,
		maxDepth,
	)
	return leftIntegral + rightIntegral
}

/**
 * Computes the definite integral of a real-valued function `f` over `[a, b]`
 * using recursive divide-and-conquer adaptive Simpson's rule over IEEE-754
 * float64 numbers.
 *
 * @param {(x: number) => number} f - Continuous (or piecewise smooth) integrand function.
 * @param {number} a - Lower bound of integration (must be a finite number).
 * @param {number} b - Upper bound of integration (must be a finite number).
 * @param {object} [options] - Optional numerical integration controls.
 * @param {number} [options.tolerance=1e-10] - Positive finite absolute error tolerance.
 * @param {number} [options.maxDepth=20] - Non-negative integer maximum bisection depth.
 * @param {number} [options.minDepth] - Non-negative integer minimum bisection depth (defaults to `Math.min(2, maxDepth)`).
 * @returns {number} Approximate definite integral `∫_a^b f(x) dx`.
 * @throws {TypeError} If `f` is not a function, bounds/options have invalid types, or `f` returns a non-number.
 * @throws {RangeError} If bounds/options are non-finite or out of valid range, or `f` returns a non-finite value.
 */
export function integralFloatRecursive(f, a, b, options) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (typeof a !== 'number') {
		throw new TypeError('a must be a number')
	}
	if (!Number.isFinite(a)) {
		throw new RangeError('a must be a finite number')
	}
	if (typeof b !== 'number') {
		throw new TypeError('b must be a number')
	}
	if (!Number.isFinite(b)) {
		throw new RangeError('b must be a finite number')
	}

	let tolerance = DEFAULT_TOLERANCE
	let maxDepth = DEFAULT_MAX_DEPTH
	let minDepth

	if (options !== undefined) {
		if (typeof options !== 'object' || options === null || Array.isArray(options)) {
			throw new TypeError('options must be a plain object')
		}

		if (options.tolerance !== undefined) {
			if (typeof options.tolerance !== 'number') {
				throw new TypeError('options.tolerance must be a number')
			}
			if (!Number.isFinite(options.tolerance) || options.tolerance <= 0) {
				throw new RangeError('options.tolerance must be a positive finite number')
			}
			tolerance = options.tolerance
		}

		if (options.maxDepth !== undefined) {
			if (typeof options.maxDepth !== 'number') {
				throw new TypeError('options.maxDepth must be a number')
			}
			if (!Number.isInteger(options.maxDepth) || options.maxDepth < 0) {
				throw new RangeError('options.maxDepth must be a non-negative integer')
			}
			maxDepth = options.maxDepth
		}

		if (options.minDepth !== undefined) {
			if (typeof options.minDepth !== 'number') {
				throw new TypeError('options.minDepth must be a number')
			}
			if (!Number.isInteger(options.minDepth) || options.minDepth < 0) {
				throw new RangeError('options.minDepth must be a non-negative integer')
			}
			if (options.minDepth > maxDepth) {
				throw new RangeError('options.minDepth must not exceed options.maxDepth')
			}
			minDepth = options.minDepth
		}
	}

	const effectiveMinDepth = minDepth !== undefined ? minDepth : Math.min(DEFAULT_MIN_DEPTH, maxDepth)

	if (a === b) {
		return 0
	}

	const reversed = a > b
	const lo = reversed ? b : a
	const hi = reversed ? a : b
	const mid = lo + (hi - lo) / 2

	const fLo = evalIntegrand(f, lo)
	const fMid = evalIntegrand(f, mid)
	const fHi = evalIntegrand(f, hi)
	const whole = simpson(lo, hi, fLo, fMid, fHi)

	const result = adaptiveSimpsonRecursive(
		f,
		lo,
		hi,
		fLo,
		fMid,
		fHi,
		whole,
		tolerance,
		0,
		effectiveMinDepth,
		maxDepth,
	)

	const signed = reversed ? -result : result
	return signed === 0 ? 0 : signed
}
