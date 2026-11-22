/**
 * Numerically approximates the derivative of a real-valued function over
 * IEEE-754 float64 numbers using an iterative central finite-difference scheme
 * refined with iterative Richardson extrapolation (Ridders-style step halving).
 *
 * For first-order derivatives (`order = 1`), each iteration `i` computes the
 * symmetric central difference with step `h_i = h / 2^i`:
 *   D(h_i) = (f(x + h_i) - f(x - h_i)) / ((x + h_i) - (x - h_i))
 *
 * For higher-order derivatives (`order = n >= 2`), each iteration computes the
 * symmetric central finite difference of order `n`:
 *   D_n(h_i) = (1 / h_i^n) * sum_{k=0..n} (-1)^k * C(n, k) * f(x + (n/2 - k) * h_i)
 *
 * Because the truncation error of both formulas contains only even powers of
 * `h_i`, Richardson extrapolation eliminates successively higher error terms
 * via `R[i][j] = R[i][j-1] + (R[i][j-1] - R[i-1][j-1]) / (4^j - 1)`, achieving
 * O(h^(2*(j+1))) accuracy while stopping early once the estimated error meets
 * `tolerance` or floating-point roundoff begins to dominate.
 *
 * @param {(x: number) => number} f - Real-valued function to differentiate.
 * @param {number} x - Finite point at which to evaluate the derivative.
 * @param {number | { h?: number, order?: number, iterations?: number, tolerance?: number }} [options={}]
 *   Optional step size `h` (shorthand) or configuration object:
 *   - `h` (`number`): Initial positive finite step size. Defaults to a scale-
 *     and order-aware step suitable for float64 Richardson extrapolation.
 *   - `order` (`number`): Derivative order, an integer in `[1, 8]`. Defaults to `1`.
 *   - `iterations` (`number`): Maximum Richardson step-halving iterations, an
 *     integer in `[1, 30]`. Defaults to `8`.
 *   - `tolerance` (`number`): Non-negative relative/absolute error target for
 *     early termination. Defaults to `1e-12`.
 * @returns {number} Numerical approximation of the `order`-th derivative of `f` at `x`.
 * @throws {TypeError} If `f` is not a function, `x` is not a number, or any
 *   option has an invalid type.
 * @throws {RangeError} If `x` is non-finite, `h` is not positive/finite (or
 *   underflows relative to `x`), `order`/`iterations`/`tolerance` are out of
 *   range, `f` returns a non-finite value, or the result is non-finite.
 */
export function derivativeFloatIterative(f, x, options = {}) {
	if (typeof f !== 'function') {
		throw new TypeError('Expected f to be a function')
	}
	if (typeof x !== 'number') {
		throw new TypeError('Expected x to be a finite number')
	}
	if (!Number.isFinite(x)) {
		throw new RangeError('Expected x to be a finite number')
	}

	let opts
	if (options === undefined) {
		opts = {}
	} else if (typeof options === 'number') {
		opts = { h: options }
	} else if (typeof options === 'object' && options !== null && !Array.isArray(options)) {
		opts = options
	} else {
		throw new TypeError('Expected options to be an object or a positive finite step size h')
	}

	const { h: rawH, order: rawOrder = 1, iterations: rawIterations = 8, tolerance: rawTolerance = 1e-12 } = opts

	if (typeof rawOrder !== 'number') {
		throw new TypeError('Expected order to be an integer between 1 and 8')
	}
	if (!Number.isInteger(rawOrder) || rawOrder < 1 || rawOrder > 8) {
		throw new RangeError('Expected order to be an integer between 1 and 8')
	}

	if (typeof rawIterations !== 'number') {
		throw new TypeError('Expected iterations to be an integer between 1 and 30')
	}
	if (!Number.isInteger(rawIterations) || rawIterations < 1 || rawIterations > 30) {
		throw new RangeError('Expected iterations to be an integer between 1 and 30')
	}

	if (typeof rawTolerance !== 'number') {
		throw new TypeError('Expected tolerance to be a non-negative finite number')
	}
	if (!Number.isFinite(rawTolerance) || rawTolerance < 0) {
		throw new RangeError('Expected tolerance to be a non-negative finite number')
	}

	let h0
	if (rawH !== undefined) {
		if (typeof rawH !== 'number') {
			throw new TypeError('Expected step size h to be a positive finite number')
		}
		if (!Number.isFinite(rawH) || rawH <= 0) {
			throw new RangeError('Expected step size h to be a positive finite number')
		}
		h0 = rawH
	} else {
		h0 = defaultStep(x, rawOrder)
	}

	const coeffs = rawOrder === 1 ? null : binomialCoefficients(rawOrder)

	let prevRow = null
	let best = NaN
	let bestError = Infinity
	let h = h0

	for (let i = 0; i < rawIterations; i++) {
		const estimate = centralDifference(f, x, h, rawOrder, coeffs)
		if (estimate === null) {
			if (i === 0) {
				throw new RangeError('Step size h is too small or causes overflow at x in float64 precision')
			}
			break
		}

		const currRow = new Array(i + 1)
		currRow[0] = estimate

		if (i === 0) {
			best = estimate
		} else {
			let factor = 1
			for (let j = 1; j <= i; j++) {
				factor *= 4
				const extrapolated = currRow[j - 1] + (currRow[j - 1] - prevRow[j - 1]) / (factor - 1)
				if (!Number.isFinite(extrapolated)) {
					throw new RangeError('Computed derivative is not finite')
				}
				currRow[j] = extrapolated

				const err = Math.max(
					Math.abs(extrapolated - currRow[j - 1]),
					Math.abs(extrapolated - prevRow[j - 1])
				)
				if (err <= bestError) {
					bestError = err
					best = extrapolated
				}
			}

			const target = rawTolerance * Math.max(1, Math.abs(best))
			if (bestError <= target) {
				break
			}

			// Ridders-style roundoff guard: stop if highest-order difference grows significantly
			const diagDiff = Math.abs(currRow[i] - prevRow[i - 1])
			if (diagDiff >= 2 * bestError) {
				break
			}
		}

		prevRow = currRow
		h *= 0.5
		if (h === 0) {
			break
		}
	}

	if (!Number.isFinite(best)) {
		throw new RangeError('Computed derivative is not finite')
	}

	return best === 0 ? 0 : best
}

/**
 * Computes a scale- and order-aware initial step size for float64 Richardson
 * extrapolation.
 *
 * @param {number} x - Evaluation point.
 * @param {number} order - Derivative order.
 * @returns {number} Initial positive finite step size.
 */
function defaultStep(x, order) {
	const absX = Math.abs(x)
	if (order === 1) {
		if (absX === 0) {
			return 1 / 128
		}
		if (absX < 0.05) {
			return Math.max(Number.EPSILON, absX * 1e-2)
		}
		return Math.max(1 / 128, Math.min(0.25, absX * 1e-3), absX * 1e-6)
	}

	const base = Math.pow(1e-3, 1 / order)
	if (absX === 0) {
		return base
	}
	const minScaleStep = absX * Math.pow(Number.EPSILON, 1 / (order + 2))
	if (absX < base * 10) {
		return Math.max(minScaleStep, absX * 1e-1)
	}
	return Math.max(base, minScaleStep)
}

/**
 * Iteratively computes binomial coefficients C(n, 0..n).
 *
 * @param {number} n - Non-negative integer order.
 * @returns {number[]} Array of length n + 1 containing C(n, k).
 */
function binomialCoefficients(n) {
	const coeffs = new Array(n + 1)
	coeffs[0] = 1
	for (let k = 1; k <= n; k++) {
		coeffs[k] = (coeffs[k - 1] * (n - k + 1)) / k
	}
	return coeffs
}

/**
 * Evaluates the function `f` at `point` and verifies the result is a finite number.
 *
 * @param {(x: number) => number} f - Function to evaluate.
 * @param {number} point - Finite input point.
 * @returns {number} Finite numeric output.
 */
function evaluateFinite(f, point) {
	if (!Number.isFinite(point)) {
		throw new RangeError('Evaluation point overflowed float64 range')
	}
	const value = f(point)
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new RangeError('Function f must return finite numbers')
	}
	return value
}

/**
 * Computes a single symmetric central finite difference of order `order` at `x`
 * with step `h`. Returns `null` if `h` underflows relative to `x`.
 *
 * @param {(x: number) => number} f - Function to differentiate.
 * @param {number} x - Evaluation point.
 * @param {number} h - Positive step size.
 * @param {number} order - Derivative order (>= 1).
 * @param {number[] | null} coeffs - Precomputed binomial coefficients for `order >= 2`.
 * @returns {number | null} Finite difference estimate, or `null` on step underflow.
 */
function centralDifference(f, x, h, order, coeffs) {
	if (order === 1) {
		const xPlus = x + h
		const xMinus = x - h
		if (!Number.isFinite(xPlus) || !Number.isFinite(xMinus)) {
			return null
		}
		const span = xPlus - xMinus
		if (span === 0) {
			return null
		}
		const fPlus = evaluateFinite(f, xPlus)
		const fMinus = evaluateFinite(f, xMinus)
		const result = (fPlus - fMinus) / span
		if (!Number.isFinite(result)) {
			throw new RangeError('Computed derivative is not finite')
		}
		return result
	}

	const halfOrder = order / 2
	const denom = Math.pow(h, order)
	if (!Number.isFinite(denom) || denom === 0) {
		return null
	}

	const highPoint = x + halfOrder * h
	const lowPoint = x - halfOrder * h
	if (!Number.isFinite(highPoint) || !Number.isFinite(lowPoint) || highPoint === lowPoint) {
		return null
	}

	let sum = 0
	for (let k = 0; k <= order; k++) {
		const offset = (halfOrder - k) * h
		const sign = k % 2 === 0 ? 1 : -1
		sum += sign * coeffs[k] * evaluateFinite(f, x + offset)
	}

	const result = sum / denom
	if (!Number.isFinite(result)) {
		throw new RangeError('Computed derivative is not finite')
	}
	return result
}
