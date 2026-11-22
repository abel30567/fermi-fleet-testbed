/**
 * Computes the discrete divergence (∇ · F) of an N-dimensional vector field
 * represented as element-wise Float64Array components on a regular Cartesian grid,
 * using a recursive divide-and-conquer implementation.
 *
 * For a d-dimensional vector field F = (F_0, F_1, ..., F_{d-1}) defined on a
 * row-major grid of shape [n_0, n_1, ..., n_{d-1}] with grid spacings
 * [h_0, h_1, ..., h_{d-1}], the divergence at each grid point is:
 *
 *   (∇ · F)(i) = sum_{k=0}^{d-1} ∂F_k / ∂x_k
 *
 * Partial derivatives along each axis k use:
 * - Second-order central differences at interior points (0 < c < n_k - 1):
 *     (F_k[i + s_k] - F_k[i - s_k]) / (2 * h_k)
 * - Second-order one-sided differences at boundaries when n_k >= 3:
 *     c = 0:       (-3*F_k[i] + 4*F_k[i + s_k] - F_k[i + 2*s_k]) / (2 * h_k)
 *     c = n_k - 1: ( 3*F_k[i] - 4*F_k[i - s_k] + F_k[i - 2*s_k]) / (2 * h_k)
 * - First-order forward/backward differences when n_k === 2:
 *     (F_k[i_1] - F_k[i_0]) / h_k
 *
 * Both the element-wise traversal over the flattened grid and the summation
 * across vector components are performed via balanced binary divide-and-conquer
 * recursion (O(log N + log d) call stack depth).
 *
 * @param {Float64Array[]} components - Non-empty array of d equal-length
 *   Float64Array instances containing finite values for each vector component
 *   in row-major order.
 * @param {number[]} [shape] - Grid dimensions [n_0, ..., n_{d-1}], where each
 *   n_k is a safe integer >= 2 and their product equals components[0].length.
 *   May be omitted only for 1D fields (d === 1), defaulting to [components[0].length].
 * @param {number | number[] | Float64Array} [spacings=1] - Positive finite grid
 *   spacing(s). A single number applies uniformly to all axes; an array or
 *   Float64Array of length d specifies per-axis spacings [h_0, ..., h_{d-1}].
 * @returns {Float64Array} Newly allocated Float64Array of length product(shape)
 *   containing the element-wise divergence values.
 * @throws {TypeError} If arguments have invalid types.
 * @throws {RangeError} If dimensions, lengths, spacings, or element values are
 *   out of valid ranges (including NaN or Infinity).
 */
export function divergenceTypedRecursive(components, shape, spacings = 1) {
	if (!Array.isArray(components)) {
		throw new TypeError('components must be an array of Float64Array instances')
	}
	const dims = components.length
	if (dims === 0) {
		throw new RangeError('components must be a non-empty array')
	}

	let totalLength = 0
	for (let k = 0; k < dims; k++) {
		const comp = components[k]
		if (!(comp instanceof Float64Array)) {
			throw new TypeError(`components[${k}] must be a Float64Array`)
		}
		if (k === 0) {
			totalLength = comp.length
		} else if (comp.length !== totalLength) {
			throw new RangeError(
				`All component Float64Arrays must have equal length (expected ${totalLength}, got ${comp.length} at index ${k})`,
			)
		}
	}

	let resolvedShape
	if (shape === undefined) {
		if (dims !== 1) {
			throw new TypeError(
				'shape is required when components has more than 1 dimension',
			)
		}
		resolvedShape = [totalLength]
	} else {
		if (!Array.isArray(shape)) {
			throw new TypeError('shape must be an array of integers >= 2')
		}
		if (shape.length !== dims) {
			throw new RangeError(
				`shape length (${shape.length}) must match components length (${dims})`,
			)
		}
		resolvedShape = new Array(dims)
		for (let k = 0; k < dims; k++) {
			const dim = shape[k]
			if (typeof dim !== 'number' || !Number.isInteger(dim)) {
				throw new TypeError(`shape[${k}] must be an integer`)
			}
			if (dim < 2 || !Number.isSafeInteger(dim)) {
				throw new RangeError(`shape[${k}] must be a safe integer >= 2`)
			}
			resolvedShape[k] = dim
		}
	}

	// Validate defaulted 1D shape dimension >= 2 as well
	if (resolvedShape[0] < 2) {
		throw new RangeError('Each dimension in shape must be >= 2')
	}

	let expectedLength = 1
	for (let k = 0; k < dims; k++) {
		expectedLength *= resolvedShape[k]
		if (!Number.isSafeInteger(expectedLength)) {
			throw new RangeError('Product of shape dimensions exceeds safe integer range')
		}
	}
	if (expectedLength !== totalLength) {
		throw new RangeError(
			`Product of shape (${expectedLength}) must equal component length (${totalLength})`,
		)
	}

	const resolvedSpacings = normalizeSpacings(spacings, dims)

	// Validate all component entries are finite via divide-and-conquer recursion
	for (let k = 0; k < dims; k++) {
		assertAllFiniteRecursive(components[k], 0, totalLength, k)
	}

	const strides = new Array(dims)
	computeStridesRecursive(resolvedShape, dims - 1, 1, strides)

	const out = new Float64Array(totalLength)
	computeDivergenceRangeRecursive(
		components,
		resolvedShape,
		strides,
		resolvedSpacings,
		out,
		0,
		totalLength,
	)
	return out
}

/**
 * Validates and normalizes the spacings argument into a Float64Array of length dims.
 *
 * @param {number | number[] | Float64Array} spacings
 * @param {number} dims
 * @returns {Float64Array}
 */
function normalizeSpacings(spacings, dims) {
	const result = new Float64Array(dims)
	if (typeof spacings === 'number') {
		if (!Number.isFinite(spacings) || spacings <= 0) {
			throw new RangeError('spacings must be a positive finite number')
		}
		result.fill(spacings)
		return result
	}

	if (!Array.isArray(spacings) && !(spacings instanceof Float64Array)) {
		throw new TypeError(
			'spacings must be a positive finite number, array of numbers, or Float64Array',
		)
	}
	if (spacings.length !== dims) {
		throw new RangeError(
			`spacings length (${spacings.length}) must match components length (${dims})`,
		)
	}
	for (let k = 0; k < dims; k++) {
		const h = spacings[k]
		if (typeof h !== 'number') {
			throw new TypeError(`spacings[${k}] must be a number`)
		}
		if (!Number.isFinite(h) || h <= 0) {
			throw new RangeError(`spacings[${k}] must be a positive finite number`)
		}
		result[k] = h
	}
	return result
}

/**
 * Recursively checks via divide-and-conquer that every element in arr[start..end) is finite.
 *
 * @param {Float64Array} arr
 * @param {number} start
 * @param {number} end
 * @param {number} componentIndex
 */
function assertAllFiniteRecursive(arr, start, end, componentIndex) {
	const len = end - start
	if (len <= 0) return
	if (len === 1) {
		if (!Number.isFinite(arr[start])) {
			throw new RangeError(
				`Non-finite value detected at components[${componentIndex}][${start}]`,
			)
		}
		return
	}
	const mid = start + Math.floor(len / 2)
	assertAllFiniteRecursive(arr, start, mid, componentIndex)
	assertAllFiniteRecursive(arr, mid, end, componentIndex)
}

/**
 * Recursively computes row-major strides from the innermost axis outward.
 *
 * @param {number[]} shape
 * @param {number} axis
 * @param {number} currentStride
 * @param {number[]} strides
 */
function computeStridesRecursive(shape, axis, currentStride, strides) {
	if (axis < 0) return
	strides[axis] = currentStride
	computeStridesRecursive(shape, axis - 1, currentStride * shape[axis], strides)
}

/**
 * Computes the finite-difference partial derivative along a single axis at flat index idx.
 *
 * @param {Float64Array} component
 * @param {number} idx
 * @param {number} stride
 * @param {number} axisLen
 * @param {number} h
 * @returns {number}
 */
function partialDerivativeAt(component, idx, stride, axisLen, h) {
	const coord = Math.floor(idx / stride) % axisLen
	if (axisLen === 2) {
		return coord === 0
			? (component[idx + stride] - component[idx]) / h
			: (component[idx] - component[idx - stride]) / h
	}
	if (coord === 0) {
		return (
			(-3 * component[idx] +
				4 * component[idx + stride] -
				component[idx + 2 * stride]) /
			(2 * h)
		)
	}
	if (coord === axisLen - 1) {
		return (
			(3 * component[idx] -
				4 * component[idx - stride] +
				component[idx - 2 * stride]) /
			(2 * h)
		)
	}
	return (component[idx + stride] - component[idx - stride]) / (2 * h)
}

/**
 * Recursively sums partial derivatives across axes [axisStart, axisEnd)
 * using pairwise divide-and-conquer summation.
 *
 * @param {Float64Array[]} components
 * @param {number[]} shape
 * @param {number[]} strides
 * @param {Float64Array} spacings
 * @param {number} idx
 * @param {number} axisStart
 * @param {number} axisEnd
 * @returns {number}
 */
function sumAxisDerivativesRecursive(
	components,
	shape,
	strides,
	spacings,
	idx,
	axisStart,
	axisEnd,
) {
	const count = axisEnd - axisStart
	if (count === 1) {
		return partialDerivativeAt(
			components[axisStart],
			idx,
			strides[axisStart],
			shape[axisStart],
			spacings[axisStart],
		)
	}
	const mid = axisStart + Math.floor(count / 2)
	return (
		sumAxisDerivativesRecursive(
			components,
			shape,
			strides,
			spacings,
			idx,
			axisStart,
			mid,
		) +
		sumAxisDerivativesRecursive(
			components,
			shape,
			strides,
			spacings,
			idx,
			mid,
			axisEnd,
		)
	)
}

/**
 * Recursively fills out[start..end) with the divergence using balanced
 * binary divide-and-conquer over the flattened grid range.
 *
 * @param {Float64Array[]} components
 * @param {number[]} shape
 * @param {number[]} strides
 * @param {Float64Array} spacings
 * @param {Float64Array} out
 * @param {number} start
 * @param {number} end
 */
function computeDivergenceRangeRecursive(
	components,
	shape,
	strides,
	spacings,
	out,
	start,
	end,
) {
	const len = end - start
	if (len <= 0) return
	if (len === 1) {
		out[start] = sumAxisDerivativesRecursive(
			components,
			shape,
			strides,
			spacings,
			start,
			0,
			components.length,
		)
		return
	}
	const mid = start + Math.floor(len / 2)
	computeDivergenceRangeRecursive(
		components,
		shape,
		strides,
		spacings,
		out,
		start,
		mid,
	)
	computeDivergenceRangeRecursive(
		components,
		shape,
		strides,
		spacings,
		out,
		mid,
		end,
	)
}
