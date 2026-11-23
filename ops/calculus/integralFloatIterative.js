/**
 * Approximates the definite integral of a real-valued function `fn` over the
 * closed interval `[a, b]` using an iterative composite Simpson's 1/3 rule over
 * IEEE-754 float64 numbers.
 *
 * The interval `[a, b]` is partitioned into `steps` uniform subintervals of
 * width `h = (b - a) / steps`. Each subinterval contributes
 * `(h / 6) * (fn(x_i) + 4 * fn(x_i + h / 2) + fn(x_{i+1}))`, accumulated
 * iteratively in a single pass. This achieves O(h^4) accuracy for smooth
 * functions and is exact (up to float64 rounding) for polynomials up to degree 3
 * for any positive integer `steps`.
 *
 * @param {(x: number) => number} fn - Integrand function taking a float64 number and returning a finite float64 number.
 * @param {number} a - Lower limit of integration (finite float64 number).
 * @param {number} b - Upper limit of integration (finite float64 number).
 * @param {number} [steps=1000] - Number of uniform Simpson panels (positive safe integer).
 * @returns {number} Approximate definite integral of `fn` from `a` to `b`.
 * @throws {TypeError} If `fn` is not a function, if `a`, `b`, or `steps` is not a number, or if `fn` returns a non-number.
 * @throws {RangeError} If `a`, `b`, `b - a`, any `fn(x)` evaluation, or the final result is not finite, or if `steps` is not a positive safe integer.
 */
export function integralFloatIterative(fn, a, b, steps = 1000) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
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
	if (typeof steps !== 'number') {
		throw new TypeError('steps must be a number')
	}
	if (!Number.isSafeInteger(steps) || steps < 1) {
		throw new RangeError('steps must be a positive safe integer')
	}

	const span = b - a
	if (!Number.isFinite(span)) {
		throw new RangeError('integration interval (b - a) overflows float64')
	}

	if (span === 0) {
		return 0
	}

	const h = span / steps

	const evalFn = (x) => {
		const y = fn(x)
		if (typeof y !== 'number') {
			throw new TypeError('fn must return a number')
		}
		if (!Number.isFinite(y)) {
			throw new RangeError(`fn(${x}) returned a non-finite value: ${y}`)
		}
		return y
	}

	const sumEnds = evalFn(a) + evalFn(b)
	let sumMid = 0
	let sumInterior = 0

	for (let i = 0; i < steps; i++) {
		sumMid += evalFn(a + (i + 0.5) * h)
		if (i > 0) {
			sumInterior += evalFn(a + i * h)
		}
	}

	const result = (h / 6) * (sumEnds + 4 * sumMid + 2 * sumInterior)
	if (!Number.isFinite(result)) {
		throw new RangeError('integral result overflows float64')
	}

	return result === 0 ? 0 : result
}
