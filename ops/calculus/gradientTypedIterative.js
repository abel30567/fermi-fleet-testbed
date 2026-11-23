/**
 * Computes the numerical gradient (first derivative) of a 1D sampled function
 * stored in a `Float64Array` using a straightforward iterative implementation.
 *
 * Uses second-order central finite differences at interior points and
 * first-order one-sided (forward/backward) finite differences at the endpoints.
 * Supports either uniform scalar spacing or a `Float64Array` of strictly
 * increasing sample coordinates.
 *
 * @param {Float64Array} values - Sampled function values (length >= 2, all finite).
 * @param {number | Float64Array} [spacing=1] - Uniform positive step size `dx`,
 *   or a `Float64Array` of strictly increasing finite sample coordinates with
 *   the same length as `values`.
 * @returns {Float64Array} New `Float64Array` of the same length containing the
 *   estimated derivative at each sample point.
 * @throws {TypeError} If `values` is not a `Float64Array`, or if `spacing` is
 *   neither a number nor a `Float64Array`.
 * @throws {RangeError} If `values` has fewer than 2 elements, contains
 *   non-finite values, or if `spacing` is non-positive, non-finite, has a
 *   mismatched length, or is not strictly increasing.
 */
export function gradientTypedIterative(values, spacing = 1) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('values must be a Float64Array')
	}

	const n = values.length
	if (n < 2) {
		throw new RangeError('values must contain at least 2 elements')
	}

	for (let i = 0; i < n; i++) {
		if (!Number.isFinite(values[i])) {
			throw new RangeError(`values[${i}] must be a finite number`)
		}
	}

	const result = new Float64Array(n)

	if (typeof spacing === 'number') {
		if (!Number.isFinite(spacing) || spacing <= 0) {
			throw new RangeError('spacing must be a finite positive number')
		}

		// Endpoints: first-order forward and backward differences
		result[0] = (values[1] - values[0]) / spacing
		result[n - 1] = (values[n - 1] - values[n - 2]) / spacing

		// Interior points: second-order central differences
		const twoDx = 2 * spacing
		for (let i = 1; i < n - 1; i++) {
			result[i] = (values[i + 1] - values[i - 1]) / twoDx
		}

		return result
	}

	if (spacing instanceof Float64Array) {
		if (spacing.length !== n) {
			throw new RangeError('spacing Float64Array must have the same length as values')
		}

		if (!Number.isFinite(spacing[0])) {
			throw new RangeError('spacing[0] must be a finite number')
		}

		for (let i = 1; i < n; i++) {
			if (!Number.isFinite(spacing[i])) {
				throw new RangeError(`spacing[${i}] must be a finite number`)
			}
			if (spacing[i] <= spacing[i - 1]) {
				throw new RangeError('spacing coordinates must be strictly increasing')
			}
		}

		// Endpoints: first-order forward and backward differences
		result[0] = (values[1] - values[0]) / (spacing[1] - spacing[0])
		result[n - 1] = (values[n - 1] - values[n - 2]) / (spacing[n - 1] - spacing[n - 2])

		// Interior points: second-order Lagrangian difference for non-uniform grids
		for (let i = 1; i < n - 1; i++) {
			const hs = spacing[i] - spacing[i - 1]
			const hd = spacing[i + 1] - spacing[i]
			const invSpan = 1 / (hs + hd)
			const forwardSlope = (values[i + 1] - values[i]) / hd
			const backwardSlope = (values[i] - values[i - 1]) / hs
			result[i] = (hs * forwardSlope + hd * backwardSlope) * invSpan
		}

		return result
	}

	throw new TypeError('spacing must be a positive finite number or a Float64Array')
}
