/**
 * Computes the numerical first derivative of a sampled 1D function over a
 * Float64Array using a straightforward iterative finite-difference scheme.
 *
 * Algorithm:
 * - For uniform spacing `h > 0` (default `1`):
 *   - Left boundary (`i = 0`): forward difference `(y[1] - y[0]) / h`
 *   - Interior (`1 <= i <= n - 2`): second-order central difference
 *     `((y[i + 1] - y[i - 1]) / h) * 0.5`
 *   - Right boundary (`i = n - 1`): backward difference `(y[n - 1] - y[n - 2]) / h`
 * - For non-uniform strictly increasing sample coordinates `x`:
 *   - Left boundary (`i = 0`): forward difference `(y[1] - y[0]) / (x[1] - x[0])`
 *   - Interior (`1 <= i <= n - 2`): second-order three-point Lagrange central
 *     difference expressed as the distance-weighted average of forward and
 *     backward secant slopes:
 *     `(hs / (hs + hd)) * ((y[i + 1] - y[i]) / hd) + (hd / (hs + hd)) * ((y[i] - y[i - 1]) / hs)`
 *     where `hs = x[i] - x[i - 1]` and `hd = x[i + 1] - x[i]`
 *   - Right boundary (`i = n - 1`): backward difference
 *     `(y[n - 1] - y[n - 2]) / (x[n - 1] - x[n - 2])`
 *
 * Returns an empty `Float64Array` when `y` is empty. Does not mutate inputs.
 *
 * @param {Float64Array} y - Sampled function values (all elements must be finite).
 * @param {number | Float64Array} [spacingOrX=1] - Positive finite uniform step
 *   size `h`, or a `Float64Array` of strictly increasing finite sample
 *   coordinates `x` with the same length as `y`.
 * @returns {Float64Array} Estimated first derivative values at each sample point.
 * @throws {TypeError} If `y` is not a `Float64Array`, or `spacingOrX` is neither
 *   a `number` nor a `Float64Array`.
 * @throws {RangeError} If `y` contains non-finite values, has length 1, if
 *   uniform spacing `h` is not finite and strictly positive, or if `x` has a
 *   mismatched length, contains non-finite values, or is not strictly increasing.
 */
export function derivativeTypedIterative(y, spacingOrX = 1) {
	if (!(y instanceof Float64Array)) {
		throw new TypeError('y must be a Float64Array')
	}

	const isUniform = typeof spacingOrX === 'number'
	const isCoordinateArray = spacingOrX instanceof Float64Array

	if (!isUniform && !isCoordinateArray) {
		throw new TypeError('spacingOrX must be a number or a Float64Array')
	}

	if (isUniform) {
		if (!Number.isFinite(spacingOrX) || spacingOrX <= 0) {
			throw new RangeError('spacing h must be a finite positive number')
		}
	} else if (spacingOrX.length !== y.length) {
		throw new RangeError('x and y must have the same length')
	}

	const n = y.length
	if (n === 0) {
		return new Float64Array(0)
	}

	for (let i = 0; i < n; i++) {
		if (!Number.isFinite(y[i])) {
			throw new RangeError(`y[${i}] must be finite`)
		}
	}

	if (isCoordinateArray) {
		for (let i = 0; i < n; i++) {
			if (!Number.isFinite(spacingOrX[i])) {
				throw new RangeError(`x[${i}] must be finite`)
			}
			if (i > 0 && spacingOrX[i] <= spacingOrX[i - 1]) {
				throw new RangeError('x must be strictly increasing')
			}
		}
	}

	if (n < 2) {
		throw new RangeError('y must contain at least 2 samples to compute a derivative')
	}

	const out = new Float64Array(n)

	if (isUniform) {
		const h = spacingOrX
		out[0] = (y[1] - y[0]) / h
		for (let i = 1; i < n - 1; i++) {
			out[i] = ((y[i + 1] - y[i - 1]) / h) * 0.5
		}
		out[n - 1] = (y[n - 1] - y[n - 2]) / h
		return out
	}

	const x = spacingOrX
	out[0] = (y[1] - y[0]) / (x[1] - x[0])
	for (let i = 1; i < n - 1; i++) {
		const hs = x[i] - x[i - 1]
		const hd = x[i + 1] - x[i]
		const denom = hs + hd
		const dForward = (y[i + 1] - y[i]) / hd
		const dBackward = (y[i] - y[i - 1]) / hs
		out[i] = (hs / denom) * dForward + (hd / denom) * dBackward
	}
	out[n - 1] = (y[n - 1] - y[n - 2]) / (x[n - 1] - x[n - 2])

	return out
}
