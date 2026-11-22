/**
 * Default upper integration limit for numerical truncation of `[0, ∞)`.
 * @type {number}
 */
const DEFAULT_UPPER_LIMIT = 50

/**
 * Default number of quadrature subintervals.
 * @type {number}
 */
const DEFAULT_STEPS = 20000

/**
 * Evaluates the Laplace integrand `f(t) * exp(-s * t)` with strict validation.
 *
 * @param {(t: number) => number} f - Time-domain function.
 * @param {number} s - Real frequency parameter.
 * @param {number} t - Non-negative time coordinate.
 * @returns {number} Finite integrand value at `t`.
 * @throws {TypeError} If `f(t)` does not return a number.
 * @throws {RangeError} If `f(t)` or `f(t) * exp(-s * t)` is not finite.
 */
function evaluateIntegrand(f, s, t) {
	const value = f(t)
	if (typeof value !== 'number') {
		throw new TypeError(`Expected f(${t}) to return a number, got ${typeof value}`)
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`Expected f(${t}) to return a finite number, got ${value}`)
	}
	if (value === 0) {
		return 0
	}
	const weight = Math.exp(-s * t)
	const product = value * weight
	if (!Number.isFinite(product)) {
		throw new RangeError(
			`Laplace integrand overflowed to a non-finite value at t=${t} (f(t)=${value}, exp(-s*t)=${weight})`,
		)
	}
	return product
}

/**
 * Computes the unilateral Laplace transform numerically over IEEE-754 float64
 * numbers using an iterative composite Simpson's quadrature (with Simpson's 3/8
 * tail for odd `steps >= 3` and trapezoidal rule for `steps === 1`):
 *
 *     L{f}(s) = ∫_0^∞ f(t) * e^(-s * t) dt ≈ ∫_0^upperLimit f(t) * e^(-s * t) dt
 *
 * Accumulation uses Kahan compensated summation to minimize floating-point drift
 * across large step counts and oscillatory integrands.
 *
 * @param {(t: number) => number} f - Real-valued time-domain function defined on `[0, upperLimit]`.
 * @param {number} s - Finite IEEE-754 float64 frequency parameter `s`.
 * @param {number} [upperLimit=50] - Positive finite upper integration bound approximating `∞`.
 * @param {number} [steps=20000] - Positive safe integer number of subintervals.
 * @returns {number} Numerical approximation of `L{f}(s)`.
 * @throws {TypeError} If `f` is not a function, or if `s`, `upperLimit`, or `steps` is not a number, or if `f(t)` returns a non-number.
 * @throws {RangeError} If `s` is non-finite, `upperLimit` is non-finite or `<= 0`, `steps` is not a positive safe integer, or any integrand/result is non-finite.
 */
export function laplaceTransformFloatIterative(
	f,
	s,
	upperLimit = DEFAULT_UPPER_LIMIT,
	steps = DEFAULT_STEPS,
) {
	if (typeof f !== 'function') {
		throw new TypeError(`Expected f to be a function, got ${typeof f}`)
	}
	if (typeof s !== 'number') {
		throw new TypeError(`Expected s to be a number, got ${typeof s}`)
	}
	if (!Number.isFinite(s)) {
		throw new RangeError(`Expected s to be a finite number, got ${s}`)
	}
	if (typeof upperLimit !== 'number') {
		throw new TypeError(`Expected upperLimit to be a number, got ${typeof upperLimit}`)
	}
	if (!Number.isFinite(upperLimit) || upperLimit <= 0) {
		throw new RangeError(`Expected upperLimit to be a positive finite number, got ${upperLimit}`)
	}
	if (typeof steps !== 'number') {
		throw new TypeError(`Expected steps to be a number, got ${typeof steps}`)
	}
	if (!Number.isSafeInteger(steps) || steps < 1) {
		throw new RangeError(`Expected steps to be a positive safe integer, got ${steps}`)
	}

	const h = upperLimit / steps
	let result

	if (steps === 1) {
		const y0 = evaluateIntegrand(f, s, 0)
		const y1 = evaluateIntegrand(f, s, upperLimit)
		result = (h / 2) * (y0 + y1)
	} else if (steps === 3) {
		const y0 = evaluateIntegrand(f, s, 0)
		const y1 = evaluateIntegrand(f, s, h)
		const y2 = evaluateIntegrand(f, s, 2 * h)
		const y3 = evaluateIntegrand(f, s, upperLimit)
		result = ((3 * h) / 8) * (y0 + 3 * y1 + 3 * y2 + y3)
	} else {
		const isOdd = steps % 2 === 1
		const simpsonEnd = isOdd ? steps - 3 : steps

		let sum = evaluateIntegrand(f, s, 0)
		let compensation = 0

		for (let i = 1; i < simpsonEnd; i += 1) {
			const weight = i % 2 === 1 ? 4 : 2
			const term = weight * evaluateIntegrand(f, s, i * h)
			const y = term - compensation
			const nextSum = sum + y
			compensation = nextSum - sum - y
			sum = nextSum
		}

		const tBoundary = simpsonEnd === steps ? upperLimit : simpsonEnd * h
		const yBoundary = evaluateIntegrand(f, s, tBoundary)
		const yLast = yBoundary - compensation
		const simpsonSum = sum + yLast
		result = (h / 3) * simpsonSum

		if (isOdd) {
			const y1 = evaluateIntegrand(f, s, (simpsonEnd + 1) * h)
			const y2 = evaluateIntegrand(f, s, (simpsonEnd + 2) * h)
			const y3 = evaluateIntegrand(f, s, upperLimit)
			result += ((3 * h) / 8) * (yBoundary + 3 * y1 + 3 * y2 + y3)
		}
	}

	if (!Number.isFinite(result)) {
		throw new RangeError(`Laplace transform quadrature produced a non-finite result: ${result}`)
	}

	return result === 0 ? 0 : result
}
