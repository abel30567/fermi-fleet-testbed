/**
 * Computes the numerical divergence of an N-dimensional vector field on a
 * regular grid using a straightforward iterative finite-difference algorithm.
 *
 * For a D-dimensional vector field F = (F_0, F_1, ..., F_{D-1}) sampled on a
 * row-major (C-order) grid of dimensions `shape = [n_0, n_1, ..., n_{D-1}]`
 * with grid spacings `spacing = [h_0, h_1, ..., h_{D-1}]`, the divergence is:
 *
 *   div(F) = sum_{d=0}^{D-1} (dF_d / dx_d)
 *
 * Algorithm:
 * - Traverses each spatial axis `d` iteratively using precomputed row-major
 *   strides (no recursion).
 * - For axis length `n >= 3`:
 *   - Interior points (`0 < k < n - 1`): 2nd-order central difference
 *     `(F[k + 1] - F[k - 1]) / (2 * h_d)`.
 *   - Left boundary (`k = 0`): 2nd-order forward one-sided difference
 *     `(-3 * F[0] + 4 * F[1] - F[2]) / (2 * h_d)`.
 *   - Right boundary (`k = n - 1`): 2nd-order backward one-sided difference
 *     `(3 * F[n - 1] - 4 * F[n - 2] + F[n - 3]) / (2 * h_d)`.
 * - For axis length `n === 2`: 1st-order one-sided difference
 *   `(F[1] - F[0]) / h_d` at both endpoints.
 * - For axis length `n === 1`: partial derivative contribution is `0`.
 * - For empty grids (any axis length `0`): returns an empty `Float64Array(0)`.
 *
 * @param {Float64Array[]} field - Array of D `Float64Array` components, one per
 *   spatial dimension, each containing `prod(shape)` finite values in row-major order.
 * @param {number[]} shape - Array of D non-negative safe integers specifying the
 *   grid size along each dimension.
 * @param {number | number[] | Float64Array} [spacing=1] - Uniform positive finite
 *   grid spacing scalar, or an array / `Float64Array` of D positive finite spacings
 *   (one per axis).
 * @returns {Float64Array} Row-major `Float64Array` of length `prod(shape)` containing
 *   the scalar divergence at each grid point.
 * @throws {TypeError} If `field`, `shape`, `spacing`, or their elements have invalid types.
 * @throws {RangeError} If dimensions are empty/mismatched, lengths disagree with `shape`,
 *   spacings are non-positive or non-finite, or any field value is `NaN`/`Infinity`.
 */
export function divergenceTypedIterative(field, shape, spacing = 1) {
	if (!Array.isArray(field)) {
		throw new TypeError('field must be an Array of Float64Array components')
	}
	if (!Array.isArray(shape)) {
		throw new TypeError('shape must be an Array of non-negative integers')
	}
	if (shape.length === 0) {
		throw new RangeError('shape must contain at least one dimension')
	}
	if (field.length !== shape.length) {
		throw new RangeError(
			`field component count (${field.length}) must match shape dimensionality (${shape.length})`
		)
	}

	const dims = shape.length
	let totalSize = 1
	for (let d = 0; d < dims; d++) {
		const n = shape[d]
		if (typeof n !== 'number') {
			throw new TypeError(`shape[${d}] must be a number`)
		}
		if (!Number.isInteger(n) || n < 0 || !Number.isSafeInteger(n)) {
			throw new RangeError(`shape[${d}] must be a non-negative safe integer`)
		}
		totalSize *= n
		if (!Number.isSafeInteger(totalSize)) {
			throw new RangeError('total grid size exceeds Number.MAX_SAFE_INTEGER')
		}
	}

	// Normalize and validate spacing
	const spacings = new Float64Array(dims)
	if (typeof spacing === 'number') {
		if (!Number.isFinite(spacing) || spacing <= 0) {
			throw new RangeError('spacing must be a positive finite number')
		}
		for (let d = 0; d < dims; d++) {
			spacings[d] = spacing
		}
	} else if (Array.isArray(spacing) || spacing instanceof Float64Array) {
		if (spacing.length !== dims) {
			throw new RangeError(
				`spacing length (${spacing.length}) must match shape dimensionality (${dims})`
			)
		}
		for (let d = 0; d < dims; d++) {
			const h = spacing[d]
			if (typeof h !== 'number') {
				throw new TypeError(`spacing[${d}] must be a number`)
			}
			if (!Number.isFinite(h) || h <= 0) {
				throw new RangeError(`spacing[${d}] must be a positive finite number`)
			}
			spacings[d] = h
		}
	} else {
		throw new TypeError('spacing must be a number, Array, or Float64Array')
	}

	// Validate field components and element finiteness
	for (let d = 0; d < dims; d++) {
		const comp = field[d]
		if (!(comp instanceof Float64Array)) {
			throw new TypeError(`field[${d}] must be a Float64Array`)
		}
		if (comp.length !== totalSize) {
			throw new RangeError(
				`field[${d}] length (${comp.length}) must equal total grid size (${totalSize})`
			)
		}
		for (let i = 0; i < totalSize; i++) {
			if (!Number.isFinite(comp[i])) {
				throw new RangeError(`field[${d}][${i}] must be a finite number`)
			}
		}
	}

	if (totalSize === 0) {
		return new Float64Array(0)
	}

	// Precompute row-major strides
	const strides = new Array(dims)
	let runningStride = 1
	for (let d = dims - 1; d >= 0; d--) {
		strides[d] = runningStride
		runningStride *= shape[d]
	}

	const out = new Float64Array(totalSize)

	for (let d = 0; d < dims; d++) {
		const n = shape[d]
		if (n <= 1) {
			continue
		}

		const comp = field[d]
		const h = spacings[d]
		const stride = strides[d]
		const outerBlock = stride * n

		if (n === 2) {
			for (let outer = 0; outer < totalSize; outer += outerBlock) {
				for (let inner = 0; inner < stride; inner++) {
					const i0 = outer + inner
					const i1 = i0 + stride
					const deriv = (comp[i1] - comp[i0]) / h
					out[i0] += deriv
					out[i1] += deriv
				}
			}
		} else {
			const twoH = 2 * h
			const twoStride = 2 * stride
			const useTwoH = Number.isFinite(twoH)

			for (let outer = 0; outer < totalSize; outer += outerBlock) {
				for (let inner = 0; inner < stride; inner++) {
					const base = outer + inner

					// Left boundary (k = 0): 2nd-order forward difference
					const fwdNum =
						-3 * comp[base] + 4 * comp[base + stride] - comp[base + twoStride]
					out[base] += useTwoH ? fwdNum / twoH : (0.5 * fwdNum) / h

					// Interior (1 <= k <= n - 2): 2nd-order central difference
					for (let k = 1; k < n - 1; k++) {
						const idx = base + k * stride
						const cenNum = comp[idx + stride] - comp[idx - stride]
						out[idx] += useTwoH ? cenNum / twoH : (0.5 * cenNum) / h
					}

					// Right boundary (k = n - 1): 2nd-order backward difference
					const last = base + (n - 1) * stride
					const bwdNum =
						3 * comp[last] - 4 * comp[last - stride] + comp[last - twoStride]
					out[last] += useTwoH ? bwdNum / twoH : (0.5 * bwdNum) / h
				}
			}
		}
	}

	return out
}
