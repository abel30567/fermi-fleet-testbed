/**
 * @typedef {object} DualNumber
 * @property {number} v - Primal (real) value.
 * @property {number} d - Forward-mode derivative (tangent / dual part).
 */

/**
 * @typedef {object} SqrtDualOptions
 * @property {number} [tolerance=Number.EPSILON] - Relative convergence tolerance (>= 0).
 * @property {number} [maxIterations=100] - Maximum number of Newton-Raphson iterations (>= 1).
 */

/**
 * Computes the square root of a dual number `x = v + d·ε` (with `ε² = 0`),
 * carrying the forward-mode derivative alongside the primal value, using a
 * straightforward iterative Newton-Raphson (Babylonian / Heron) method over
 * dual numbers:
 *
 *   y_{k+1} = 1/2 * (y_k + x / y_k)
 *
 * For `v > 0`, this converges quadratically to:
 *   v_out = sqrt(v)
 *   d_out = d / (2 * sqrt(v))
 *
 * For `v === 0`:
 * - If `d === 0`, returns `{ v: 0, d: 0 }`.
 * - If `d !== 0`, throws a `RangeError` because the derivative of sqrt at 0
 *   is undefined and `0 + d·ε` has no square root in the dual numbers.
 *
 * @param {DualNumber} x - Input dual number `{ v, d }` with finite `v >= 0` and finite `d`.
 * @param {SqrtDualOptions} [options] - Optional iteration settings.
 * @returns {DualNumber} The dual number square root `{ v, d }`.
 * @throws {TypeError} If `x` is not a plain dual-number object with numeric `v` and `d`,
 *   or if `options` or its fields have invalid types.
 * @throws {RangeError} If `v` or `d` is non-finite, if `v < 0`, if `v === 0 && d !== 0`,
 *   or if `options.tolerance` / `options.maxIterations` are out of valid range.
 */
export function sqrtDualIterative(x, options) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected dual number input x to be a non-null object { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number components v and d must be finite numbers')
	}

	if (v < 0) {
		throw new RangeError('Cannot compute square root of a dual number with negative value v')
	}

	let tolerance = Number.EPSILON
	let maxIterations = 100

	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('Expected options to be a non-null object')
		}

		if (options.tolerance !== undefined) {
			if (typeof options.tolerance !== 'number') {
				throw new TypeError('options.tolerance must be a number')
			}
			if (!Number.isFinite(options.tolerance) || options.tolerance < 0) {
				throw new RangeError('options.tolerance must be a finite number >= 0')
			}
			tolerance = options.tolerance
		}

		if (options.maxIterations !== undefined) {
			if (typeof options.maxIterations !== 'number') {
				throw new TypeError('options.maxIterations must be a number')
			}
			if (!Number.isSafeInteger(options.maxIterations) || options.maxIterations < 1) {
				throw new RangeError('options.maxIterations must be a positive safe integer')
			}
			maxIterations = options.maxIterations
		}
	}

	if (v === 0) {
		if (d !== 0) {
			throw new RangeError('Derivative of sqrt is undefined at v = 0 when d != 0')
		}
		return { v: 0, d: 0 }
	}

	// Power-of-2 initial estimate within a factor of 2 of sqrt(v) across the full IEEE 754 range.
	let u = 2 ** Math.floor(Math.log2(v) / 2)
	let t = 0

	for (let i = 0; i < maxIterations; i++) {
		const q = v / u
		const nextU = 0.5 * (u + q)

		// Dual Newton-Raphson tangent step: 1/2 * (t + (d*u - v*t) / u^2)
		// Rearranged as d / (2*u) + 0.5 * (1 - q / u) * t to avoid intermediate overflow/underflow.
		const ratioDiff = 1 - q / u
		const correction = ratioDiff === 0 ? 0 : 0.5 * ratioDiff * t
		const nextT = d / (2 * u) + correction

		const uConverged = nextU === u || Math.abs(nextU - u) <= tolerance * Math.abs(nextU)
		const tConverged = nextT === t || Math.abs(nextT - t) <= tolerance * Math.abs(nextT)

		u = nextU
		t = nextT

		if (uConverged && tConverged) {
			break
		}
	}

	return {
		v: u,
		d: t === 0 ? 0 : t,
	}
}
