/**
 * Computes the discrete gradient (partial derivatives along each axis) of an
 * N-dimensional scalar field stored in a row-major {@link Float64Array}.
 *
 * Along each axis of size `n` with uniform grid spacing `h > 0`, the partial
 * derivative is evaluated using Taylor-series finite-difference stencils:
 * - `n === 1`: identically `0` (no variation along a singleton axis).
 * - `n === 2`: first-order difference `(f[1] - f[0]) / h` at both endpoints.
 * - `n >= 3`:
 *   - interior (`1 <= k <= n - 2`): second-order central difference
 *     `(f[k + 1] - f[k - 1]) / (2 * h)`.
 *   - left boundary (`k === 0`): second-order forward Taylor difference
 *     `(-3 * f[0] + 4 * f[1] - f[2]) / (2 * h)`.
 *   - right boundary (`k === n - 1`): second-order backward Taylor difference
 *     `(3 * f[n - 1] - 4 * f[n - 2] + f[n - 3]) / (2 * h)`.
 *
 * These stencils are exact (up to floating-point rounding) for all polynomials
 * of degree <= 2 along axes of size >= 3 and degree <= 1 along axes of size 2.
 *
 * @param {Float64Array} field - Row-major flattened N-D scalar field values.
 * @param {number[]} [shape] - Positive integer dimensions `[d_0, d_1, ..., d_{N-1}]`
 *   whose product equals `field.length`. Defaults to `[field.length]` (1D).
 * @param {number | number[] | Float64Array} [spacings] - Positive finite grid
 *   spacing(s). May be omitted (defaults to `1` on every axis), a single scalar
 *   applied to every axis, or an array / `Float64Array` of length `shape.length`
 *   specifying `[h_0, h_1, ..., h_{N-1}]`.
 * @returns {Float64Array[]} Array of `shape.length` row-major `Float64Array`s
 *   `[df/dx_0, df/dx_1, ..., df/dx_{N-1}]`, each of length `field.length`.
 * @throws {TypeError} If `field` is not a `Float64Array`, `shape` is not an
 *   array, or `spacings` has an invalid type.
 * @throws {RangeError} If `field` is empty, `shape` is empty or has non-positive
 *   / non-integer dimensions or mismatched total length, or any spacing is not
 *   a positive finite number / length mismatches `shape.length`.
 */
export function gradientTypedSeries(field, shape, spacings) {
	if (!(field instanceof Float64Array)) {
		throw new TypeError('field must be a Float64Array')
	}

	const totalLength = field.length
	if (totalLength === 0) {
		throw new RangeError('field must not be empty')
	}

	const dims = shape === undefined ? [totalLength] : shape
	if (!Array.isArray(dims)) {
		throw new TypeError('shape must be an array of positive integers')
	}
	const ndim = dims.length
	if (ndim === 0) {
		throw new RangeError('shape must not be empty')
	}

	let product = 1
	for (let i = 0; i < ndim; i++) {
		const d = dims[i]
		if (typeof d !== 'number' || !Number.isInteger(d) || d <= 0) {
			throw new RangeError(
				`shape[${i}] must be a positive integer, got ${String(d)}`
			)
		}
		product *= d
		if (!Number.isSafeInteger(product)) {
			throw new RangeError('shape product exceeds safe integer range')
		}
	}

	if (product !== totalLength) {
		throw new RangeError(
			`shape product (${product}) does not match field.length (${totalLength})`
		)
	}

	const steps = new Float64Array(ndim)
	if (spacings === undefined) {
		steps.fill(1)
	} else if (typeof spacings === 'number') {
		if (!Number.isFinite(spacings) || spacings <= 0) {
			throw new RangeError(
				`spacings must be a positive finite number, got ${String(spacings)}`
			)
		}
		steps.fill(spacings)
	} else if (Array.isArray(spacings) || spacings instanceof Float64Array) {
		if (spacings.length !== ndim) {
			throw new RangeError(
				`spacings length (${spacings.length}) must match shape.length (${ndim})`
			)
		}
		for (let i = 0; i < ndim; i++) {
			const h = spacings[i]
			if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
				throw new RangeError(
					`spacings[${i}] must be a positive finite number, got ${String(h)}`
				)
			}
			steps[i] = h
		}
	} else {
		throw new TypeError(
			'spacings must be a positive finite number, an array, or a Float64Array'
		)
	}

	// Precompute row-major strides for each axis.
	const strides = new Array(ndim)
	let stride = 1
	for (let axis = ndim - 1; axis >= 0; axis--) {
		strides[axis] = stride
		stride *= dims[axis]
	}

	const result = new Array(ndim)
	let outerCount = 1

	for (let axis = 0; axis < ndim; axis++) {
		const dim = dims[axis]
		const axisStride = strides[axis]
		const blockSize = dim * axisStride
		const h = steps[axis]
		const out = new Float64Array(totalLength)

		if (dim === 2) {
			const invH = 1 / h
			for (let outer = 0; outer < outerCount; outer++) {
				const base0 = outer * blockSize
				const base1 = base0 + axisStride
				for (let inner = 0; inner < axisStride; inner++) {
					const diff = (field[base1 + inner] - field[base0 + inner]) * invH
					out[base0 + inner] = diff
					out[base1 + inner] = diff
				}
			}
		} else if (dim >= 3) {
			const inv2H = 0.5 / h
			const twoStride = 2 * axisStride
			const lastOffset = (dim - 1) * axisStride

			for (let outer = 0; outer < outerCount; outer++) {
				const outerBase = outer * blockSize

				// Left boundary (k = 0): second-order forward Taylor difference
				const b0 = outerBase
				const b1 = outerBase + axisStride
				const b2 = outerBase + twoStride
				for (let inner = 0; inner < axisStride; inner++) {
					out[b0 + inner] =
						(-3 * field[b0 + inner] +
							4 * field[b1 + inner] -
							field[b2 + inner]) *
						inv2H
				}

				// Interior points (1 <= k <= dim - 2): second-order central difference
				for (let k = 1; k < dim - 1; k++) {
					const curr = outerBase + k * axisStride
					const prev = curr - axisStride
					const next = curr + axisStride
					for (let inner = 0; inner < axisStride; inner++) {
						out[curr + inner] =
							(field[next + inner] - field[prev + inner]) * inv2H
					}
				}

				// Right boundary (k = dim - 1): second-order backward Taylor difference
				const e0 = outerBase + lastOffset
				const e1 = e0 - axisStride
				const e2 = e1 - axisStride
				for (let inner = 0; inner < axisStride; inner++) {
					out[e0 + inner] =
						(3 * field[e0 + inner] -
							4 * field[e1 + inner] +
							field[e2 + inner]) *
						inv2H
				}
			}
		}
		// When dim === 1, `out` remains zero-filled.

		result[axis] = out
		outerCount *= dim
	}

	return result
}
