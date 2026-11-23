/**
 * Default initial finite-difference step size when `options.h` is omitted.
 * Scaled up automatically for very large |x| so `x ± h` remains distinct in float64.
 */
const DEFAULT_BASE_H = 1e-3;
const DEFAULT_TOLERANCE = 1e-9;
const DEFAULT_MAX_ITERATIONS = 25;
const SQRT_EPSILON = Math.sqrt(Number.EPSILON);

/**
 * Computes the numerical first derivative f'(x) of a scalar real-valued function
 * over IEEE-754 float64 Numbers using an iterative step-halving central-difference
 * approximation with round-off error safeguarding.
 *
 * At each iteration k, the central difference
 *   D_k = (f(x + h_k) - f(x - h_k)) / (2 * h_k)
 * is evaluated with h_k = h / 2^k. Iteration stops once consecutive estimates
 * agree within the requested tolerance, when float64 cancellation causes the
 * consecutive difference to grow, or when `maxIterations` is reached.
 *
 * @param {(x: number) => number} f - Real-valued scalar function to differentiate.
 * @param {number} x - Finite IEEE-754 float64 point at which to evaluate f'(x).
 * @param {object} [options] - Optional configuration parameters.
 * @param {number} [options.h] - Initial positive finite step size. Defaults to
 *   `Math.max(1e-3, Math.sqrt(Number.EPSILON) * Math.abs(x))`.
 * @param {number} [options.tolerance=1e-9] - Non-negative finite convergence tolerance
 *   applied as `|D_k - D_{k-1}| <= tolerance * Math.max(1, |D_k|)`.
 * @param {number} [options.maxIterations=25] - Positive integer upper bound on
 *   step-halving iterations.
 * @returns {number} Numerical approximation of f'(x) as a finite float64 Number.
 * @throws {TypeError} If `f` is not a function, `x` is not a number, `options` is not
 *   a plain object, any option has an invalid type, or `f` returns a non-number.
 * @throws {RangeError} If `x` is not finite, any numeric option is out of range,
 *   the initial step size underflows relative to `x`, or `f` produces non-finite values.
 */
export function derivativeFloatIterative(f, x, options = {}) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function');
	}
	if (typeof x !== 'number') {
		throw new TypeError('x must be a number');
	}
	if (!Number.isFinite(x)) {
		throw new RangeError('x must be a finite number');
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object');
	}

	const {
		h: userH,
		tolerance = DEFAULT_TOLERANCE,
		maxIterations = DEFAULT_MAX_ITERATIONS,
	} = options;

	let step;
	if (userH !== undefined) {
		if (typeof userH !== 'number') {
			throw new TypeError('options.h must be a number');
		}
		if (!Number.isFinite(userH) || userH <= 0) {
			throw new RangeError('options.h must be a positive finite number');
		}
		step = userH;
	} else {
		step = Math.max(DEFAULT_BASE_H, SQRT_EPSILON * Math.abs(x));
	}

	if (typeof tolerance !== 'number') {
		throw new TypeError('options.tolerance must be a number');
	}
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError('options.tolerance must be a non-negative finite number');
	}

	if (typeof maxIterations !== 'number') {
		throw new TypeError('options.maxIterations must be a number');
	}
	if (!Number.isInteger(maxIterations) || maxIterations < 1) {
		throw new RangeError('options.maxIterations must be a positive integer');
	}

	let prevEstimate = NaN;
	let bestEstimate = NaN;
	let bestDiff = Infinity;

	for (let iter = 0; iter < maxIterations; iter += 1) {
		const xPlus = x + step;
		const xMinus = x - step;

		if (xPlus === x || xMinus === x || !Number.isFinite(xPlus) || !Number.isFinite(xMinus)) {
			if (iter === 0) {
				throw new RangeError('Initial step size h is invalid relative to x in float64 precision');
			}
			break;
		}

		// Use the actual representable span (xPlus - xMinus) to reduce step-rounding bias.
		const span = xPlus - xMinus;
		const fPlus = f(xPlus);
		const fMinus = f(xMinus);

		if (typeof fPlus !== 'number' || typeof fMinus !== 'number') {
			throw new TypeError('f must return a number');
		}
		if (!Number.isFinite(fPlus) || !Number.isFinite(fMinus)) {
			throw new RangeError('f must return finite numbers near x');
		}

		const estimate = (fPlus - fMinus) / span;
		if (!Number.isFinite(estimate)) {
			throw new RangeError('Derivative estimate overflowed float64');
		}

		if (iter === 0) {
			bestEstimate = estimate;
		} else {
			const diff = Math.abs(estimate - prevEstimate);
			const threshold = tolerance * Math.max(1, Math.abs(estimate));

			if (diff <= threshold) {
				bestEstimate = estimate;
				break;
			}

			if (diff < bestDiff) {
				bestDiff = diff;
				bestEstimate = estimate;
			} else if (diff > bestDiff * 2) {
				// Round-off error is beginning to dominate truncation error; keep best estimate.
				break;
			}
		}

		prevEstimate = estimate;
		step *= 0.5;
	}

	return bestEstimate === 0 ? 0 : bestEstimate;
}
