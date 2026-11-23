/**
 * Validates an arbitrary-rank float64 tensor (scalar or rectangular nested arrays)
 * and extracts its shape tuple and row-major flat coordinate array.
 *
 * @param {number | Array} tensor - Input scalar or rectangular nested array of finite float64 numbers.
 * @param {number[]} flat - Accumulator array populated in row-major order.
 * @param {string} label - Parameter name used in error messages.
 * @returns {number[]} The inferred shape tuple (`[]` for scalars).
 */
function parseTensor(tensor, flat, label) {
	if (typeof tensor === 'number') {
		if (!Number.isFinite(tensor)) {
			throw new RangeError(`${label} must contain only finite IEEE-754 float64 numbers`)
		}
		flat.push(tensor)
		return []
	}

	if (!Array.isArray(tensor)) {
		throw new TypeError(`${label} must be a finite number or a nested array of finite numbers`)
	}

	const len = tensor.length
	if (len === 0) {
		return [0]
	}

	const expectedChildShape = parseTensor(tensor[0], flat, label)
	for (let i = 1; i < len; i++) {
		const childShape = parseTensor(tensor[i], flat, label)
		if (childShape.length !== expectedChildShape.length) {
			throw new RangeError(`${label} must be a rectangular tensor with consistent rank`)
		}
		for (let d = 0; d < expectedChildShape.length; d++) {
			if (childShape[d] !== expectedChildShape[d]) {
				throw new RangeError(`${label} must be a rectangular tensor with consistent dimensions`)
			}
		}
	}

	return [len, ...expectedChildShape]
}

/**
 * Computes closed-form row-major strides for a tensor shape.
 *
 * For shape `[d_0, d_1, ..., d_{r-1}]`, the stride along axis `k` is:
 * `stride[k] = prod_{m=k+1}^{r-1} d_m`.
 *
 * @param {number[]} shape - Tensor shape tuple.
 * @returns {number[]} Stride array of the same length as `shape`.
 */
function computeStrides(shape) {
	const rank = shape.length
	const strides = new Array(rank)
	let stride = 1
	for (let d = rank - 1; d >= 0; d--) {
		strides[d] = stride
		stride *= shape[d]
	}
	return strides
}

/**
 * Reconstructs a nested JavaScript array tensor from a row-major Float64Array
 * using the closed-form stride mapping.
 *
 * @param {Float64Array} flat - Flat row-major data buffer.
 * @param {number[]} shape - Target tensor shape tuple.
 * @param {number[]} strides - Precomputed row-major strides for `shape`.
 * @param {number} axis - Current recursion axis.
 * @param {number} offset - Current flat starting index.
 * @returns {number | Array} Reconstructed nested tensor.
 */
function unflatten(flat, shape, strides, axis, offset) {
	const dim = shape[axis]
	if (axis === shape.length - 1) {
		const slice = new Array(dim)
		for (let i = 0; i < dim; i++) {
			slice[i] = flat[offset + i]
		}
		return slice
	}

	const step = strides[axis]
	const result = new Array(dim)
	for (let i = 0; i < dim; i++) {
		result[i] = unflatten(flat, shape, strides, axis + 1, offset + i * step)
	}
	return result
}

/**
 * Computes the tensor product `A ⊗ B` over IEEE-754 float64 numbers using the
 * closed-form canonical basis expansion and Kronecker stride bijection.
 *
 * For a rank-p tensor `A` with shape `[d_1, ..., d_p]` and a rank-q tensor `B`
 * with shape `[e_1, ..., e_q]`, the tensor product `C = A ⊗ B` is the rank-(p+q)
 * tensor of shape `[d_1, ..., d_p, e_1, ..., e_q]` defined by the basis series
 * identity:
 *
 *   A ⊗ B = Σ_{u=0}^{|A|-1} Σ_{v=0}^{|B|-1} (A_flat[u] * B_flat[v]) (e_u ⊗ f_v)
 *
 * where each flat coordinate index `k ∈ [0, |A| * |B|)` maps in closed form via:
 *
 *   u = floor(k / |B|),   v = k mod |B|,   C_flat[k] = A_flat[u] * B_flat[v].
 *
 * Supports arbitrary-rank tensors including rank-0 scalars, 1D vectors (outer
 * product), 2D matrices (rank-4 tensor product), higher-rank tensors, and empty
 * dimensions. Intermediate arithmetic uses native IEEE-754 float64 (`Float64Array`).
 *
 * @param {number | Array} a - Left operand tensor (finite float64 number or rectangular nested array).
 * @param {number | Array} b - Right operand tensor (finite float64 number or rectangular nested array).
 * @returns {number | Array} The tensor product `a ⊗ b` with shape `[...shape(a), ...shape(b)]`.
 * @throws {TypeError} If `a` or `b` contains values that are neither numbers nor arrays.
 * @throws {RangeError} If `a` or `b` contains non-finite numbers (`NaN`, `±Infinity`) or is ragged.
 */
export function tensorProductFloatSeries(a, b) {
	const flatA = []
	const flatB = []
	const shapeA = parseTensor(a, flatA, 'a')
	const shapeB = parseTensor(b, flatB, 'b')

	const outShape = [...shapeA, ...shapeB]
	const lenA = flatA.length
	const lenB = flatB.length
	const total = lenA * lenB

	const flatOut = new Float64Array(total)

	// Closed-form Kronecker stride bijection: k -> (floor(k / lenB), k mod lenB)
	if (lenB > 0) {
		for (let k = 0; k < total; k++) {
			const u = Math.floor(k / lenB)
			const v = k - u * lenB
			flatOut[k] = flatA[u] * flatB[v]
		}
	}

	if (outShape.length === 0) {
		return flatOut[0]
	}

	const strides = computeStrides(outShape)
	return unflatten(flatOut, outShape, strides, 0, 0)
}
