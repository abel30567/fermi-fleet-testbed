/**
 * Evaluates the integrand at a single point and validates that the result is a
 * finite IEEE-754 float64 number.
 *
 * @param {(x: number) => number} f - Integrand function.
 * @param {number} x - Evaluation point.
 * @returns {number} Finite value `f(x)`.
 * @throws {TypeError} If `f(x)` does not return a number.
 * @throws {RangeError} If `f(x)` returns `NaN`, `Infinity`, or `-Infinity`.
 */
function evaluateIntegrand(f, x) {
	const y = f(x)
	if (typeof y !== 'number') {
		throw new TypeError(`Expected f(${x}) to return a number, got ${typeof y}`)
	}
	if (!Number.isFinite(y)) {
		throw new RangeError(`Expected f(${x}) to return a finite number, got ${y}`)
	}
	return y
}

/**
 * Numerically computes the definite integral of a real-valued function `f` over
 * the interval `[a, b]` using an iterative composite Simpson's 1/3 rule over
 * IEEE-754 float64 Numbers.
 *
 * Each of the `steps` uniform subintervals `[x_i, x_{i+1}]` of width
 * `h = (b - a) / steps` is integrated via the 3-point Simpson's rule using its
 * endpoints and midpoint `x_i + h / 2`, yielding O(h^4) accuracy for any
 * positive integer `steps` (odd or even) and exact results for polynomials up
 * to degree 3.
 *
 * When `a === b`, returns `0`. When `a > b`, integrates over `[b, a]` and
 * negates the result so that `integral(f, b, a) === -integral(f, a, b)`.
 *
 * @param {(x: number) => number} f - Single-variable real-valued integrand function.
 * @param {number} a - Finite lower limit of integration.
 * @param {number} b - Finite upper limit of integration.
 * @param {number} [steps=1000] - Positive safe integer number of subintervals.
 * @returns {number} Approximate definite integral of `f` from `a` to `b`.
 * @throws {TypeError} If `f` is not a function, if `a`, `b`, or `steps` is not
 *   a number, or if `f(x)` returns a non-number.
 * @throws {RangeError} If `a` or `b` is not finite, if `steps` is not a
 *   positive safe integer, or if `f(x)` returns a non-finite number.
 */
export function integralFloatIterative(f, a, b, steps = 1000) {
	if (typeof f !== 'function') {
		throw new TypeError(`Expected f to be a function, got ${typeof f}`)
	}
	if (typeof a !== 'number') {
		throw new TypeError(`Expected a to be a number, got ${typeof a}`)
	}
	if (!Number.isFinite(a)) {
		throw new RangeError(`Expected a to be a finite number, got ${a}`)
	}
	if (typeof b !== 'number') {
		throw new TypeError(`Expected b to be a number, got ${typeof b}`)
	}
	if (!Number.isFinite(b)) {
		throw new RangeError(`Expected b to be a finite number, got ${b}`)
	}
	if (typeof steps !== 'number') {
		throw new TypeError(`Expected steps to be a number, got ${typeof steps}`)
	}
	if (!Number.isSafeInteger(steps) || steps < 1) {
		throw new RangeError(`Expected steps to be a positive safe integer, got ${steps}`)
	}

	if (a === b) {
		return 0
	}

	const sign = a < b ? 1 : -1
	const lo = sign === 1 ? a : b
	const hi = sign === 1 ? b : a
	const span = hi - lo
	const h = Number.isFinite(span) ? span / steps : hi / steps - lo / steps

	const fa = evaluateIntegrand(f, lo)
	const fb = evaluateIntegrand(f, hi)

	let sumEven = 0
	let sumOdd = 0

	for (let i = 0; i < steps; i++) {
		if (i > 0) {
			sumEven += evaluateIntegrand(f, lo + i * h)
		}
		sumOdd += evaluateIntegrand(f, lo + (i + 0.5) * h)
	}

	const integral = (h / 6) * (fa + fb + 2 * sumEven + 4 * sumOdd)
	const signed = sign * integral
	return signed === 0 ? 0 : signed
}
