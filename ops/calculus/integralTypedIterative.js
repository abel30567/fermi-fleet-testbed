/**
 * Computes the numerical definite integral of sampled function values using
 * the composite trapezoidal rule with a straightforward iterative loop.
 *
 * Supports either a uniform step size `dx` (defaulting to `1`) or a
 * `Float64Array` of sample coordinates `x` for non-uniform grids:
 *
 * - Uniform spacing (`dx`):
 *   `dx * (0.5 * y[0] + y[1] + ... + y[n - 2] + 0.5 * y[n - 1])`
 * - Non-uniform spacing (`x`):
 *   `sum_{i=0}^{n-2} 0.5 * (y[i] + y[i + 1]) * (x[i + 1] - x[i])`
 *
 * @param {Float64Array} y - Sampled function values. All elements must be finite.
 * @param {number | Float64Array} [xOrDx=1] - Uniform step size `dx` (finite number)
 *   or sample coordinates `x` (`Float64Array` of the same length as `y` with finite elements).
 * @returns {number} The approximated definite integral (returns `0` when `y.length < 2`).
 * @throws {TypeError} If `y` is not a `Float64Array`, or if `xOrDx` is neither a number nor a `Float64Array`.
 * @throws {RangeError} If `dx` is not finite, if `x.length !== y.length`, or if any element of `y` or `x` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function integralTypedIterative(y, xOrDx = 1) {
	if (!(y instanceof Float64Array)) {
		throw new TypeError('First argument y must be a Float64Array')
	}

	const n = y.length

	if (typeof xOrDx === 'number') {
		if (!Number.isFinite(xOrDx)) {
			throw new RangeError('Step size dx must be a finite number')
		}

		for (let i = 0; i < n; i += 1) {
			if (!Number.isFinite(y[i])) {
				throw new RangeError(`Element y[${i}] must be a finite number`)
			}
		}

		if (n < 2 || xOrDx === 0) {
			return 0
		}

		let sum = 0.5 * y[0] + 0.5 * y[n - 1]
		for (let i = 1; i < n - 1; i += 1) {
			sum += y[i]
		}

		const result = sum * xOrDx
		return result === 0 ? 0 : result
	}

	if (xOrDx instanceof Float64Array) {
		if (xOrDx.length !== n) {
			throw new RangeError(
				`Length mismatch: y has length ${n} but x has length ${xOrDx.length}`
			)
		}

		for (let i = 0; i < n; i += 1) {
			if (!Number.isFinite(y[i])) {
				throw new RangeError(`Element y[${i}] must be a finite number`)
			}
			if (!Number.isFinite(xOrDx[i])) {
				throw new RangeError(`Element x[${i}] must be a finite number`)
			}
		}

		if (n < 2) {
			return 0
		}

		let area = 0
		for (let i = 0; i < n - 1; i += 1) {
			area += 0.5 * (y[i] + y[i + 1]) * (xOrDx[i + 1] - xOrDx[i])
		}

		return area === 0 ? 0 : area
	}

	throw new TypeError(
		'Second argument must be a finite number (dx) or a Float64Array (x)'
	)
}
