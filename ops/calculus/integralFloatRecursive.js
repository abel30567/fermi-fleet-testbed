/**
 * Computes the definite numerical integral of a real-valued function `f(x)`
 * over the interval `[a, b]` in IEEE-754 float64 arithmetic using recursive
 * divide-and-conquer adaptive Simpson's quadrature with Richardson extrapolation.
 *
 * @param {(x: number) => number} f - Integrand function taking and returning a finite float64 number.
 * @param {number} a - Lower limit of integration (finite float64 number).
 * @param {number} b - Upper limit of integration (finite float64 number).
 * @param {object} [options] - Optional integration controls.
 * @param {number} [options.tolerance=1e-10] - Positive absolute error tolerance.
 * @param {number} [options.maxDepth=24] - Maximum recursion depth (non-negative integer).
 * @returns {number} Approximate value of the definite integral of `f` from `a` to `b`.
 * @throws {TypeError} If `f` is not a function, numeric arguments are not numbers, `options` is not an object, or `f(x)` returns a non-number.
 * @throws {RangeError} If limits or options are out of range / non-finite, or `f(x)` returns a non-finite value.
 */
export function integralFloatRecursive(f, a, b, options = {}) {
	if (typeof f !== 'function') {
		throw new TypeError('Expected integrand f to be a function')
	}
	if (typeof a !== 'number') {
		throw new TypeError('Expected lower limit a to be a number')
	}
	if (typeof b !== 'number') {
		throw new TypeError('Expected upper limit b to be a number')
	}
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		throw new RangeError('Integration limits a and b must be finite numbers')
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('Expected options to be a plain object')
	}

	const { tolerance = 1e-10, maxDepth = 24 } = options

	if (typeof tolerance !== 'number') {
		throw new TypeError('Expected options.tolerance to be a number')
	}
	if (!Number.isFinite(tolerance) || tolerance <= 0) {
		throw new RangeError('Expected options.tolerance to be a finite positive number')
	}
	if (typeof maxDepth !== 'number') {
		throw new TypeError('Expected options.maxDepth to be a number')
	}
	if (!Number.isInteger(maxDepth) || maxDepth < 0) {
		throw new RangeError('Expected options.maxDepth to be a non-negative integer')
	}

	if (a === b) {
		return 0
	}

	if (a > b) {
		const reversed = integralFloatRecursive(f, b, a, { tolerance, maxDepth })
		return reversed === 0 ? 0 : -reversed
	}

	const width = b - a
	if (!Number.isFinite(width)) {
		throw new RangeError('Interval width (b - a) must be finite')
	}

	/**
	 * Evaluates `f(x)` and validates that the output is a finite number.
	 * @param {number} x
	 * @returns {number}
	 */
	function evalIntegrand(x) {
		const y = f(x)
		if (typeof y !== 'number') {
			throw new TypeError(`Integrand returned non-number (${typeof y}) at x=${x}`)
		}
		if (!Number.isFinite(y)) {
			throw new RangeError(`Integrand returned non-finite value (${y}) at x=${x}`)
		}
		return y
	}

	// Enforce a small minimum recursion depth (up to maxDepth) to avoid aliasing
	// on periodic or symmetric functions where coarse samples cancel out.
	const minDepth = Math.min(3, maxDepth)

	/**
	 * Recursive divide-and-conquer adaptive Simpson's rule on `[x0, x1]`.
	 *
	 * @param {number} x0 - Left endpoint.
	 * @param {number} x1 - Right endpoint.
	 * @param {number} f0 - f(x0).
	 * @param {number} fm - f(xm), where xm is the midpoint of [x0, x1].
	 * @param {number} f1 - f(x1).
	 * @param {number} whole - Simpson estimate on [x0, x1].
	 * @param {number} tol - Error budget allocated to [x0, x1].
	 * @param {number} depth - Current recursion depth.
	 * @returns {number}
	 */
	function adaptiveSimpson(x0, x1, f0, fm, f1, whole, tol, depth) {
		const h = x1 - x0
		const xm = x0 + h / 2
		const xl = x0 + (xm - x0) / 2
		const xr = xm + (x1 - xm) / 2

		// Guard against float64 midpoint underflow on tiny subintervals.
		if (xl <= x0 || xl >= xm || xr <= xm || xr >= x1) {
			return whole
		}

		const fl = evalIntegrand(xl)
		const fr = evalIntegrand(xr)

		const left = ((xm - x0) / 6) * (f0 + 4 * fl + fm)
		const right = ((x1 - xm) / 6) * (fm + 4 * fr + f1)
		const delta = left + right - whole

		// Stop when recursion budget is exhausted, or when error is within tolerance
		// (or below float64 rounding floor) after reaching minDepth.
		const roundoffFloor = 16 * Number.EPSILON * (Math.abs(left) + Math.abs(right))
		if (
			depth >= maxDepth ||
			(depth >= minDepth && (Math.abs(delta) <= 15 * tol || Math.abs(delta) <= roundoffFloor))
		) {
			return left + right + delta / 15
		}

		const halfTol = tol / 2
		return (
			adaptiveSimpson(x0, xm, f0, fl, fm, left, halfTol, depth + 1) +
			adaptiveSimpson(xm, x1, fm, fr, f1, right, halfTol, depth + 1)
		)
	}

	const mid = a + width / 2
	const fa = evalIntegrand(a)
	const fm = evalIntegrand(mid)
	const fb = evalIntegrand(b)
	const whole = (width / 6) * (fa + 4 * fm + fb)

	if (maxDepth === 0) {
		return whole === 0 ? 0 : whole
	}

	const result = adaptiveSimpson(a, b, fa, fm, fb, whole, tolerance, 0)
	return result === 0 ? 0 : result
}
