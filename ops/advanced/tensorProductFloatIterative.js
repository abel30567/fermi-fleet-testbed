/**
 * Computes the tensor product (outer product) of two tensors over IEEE-754
 * float64 numbers using a straightforward iterative implementation.
 *
 * For a tensor `a` of shape `[d_0, ..., d_{m-1}]` (rank `m`) and a tensor `b`
 * of shape `[e_0, ..., e_{n-1}]` (rank `n`), the resulting tensor `c = a ⊗ b`
 * has shape `[d_0, ..., d_{m-1}, e_0, ..., e_{n-1}]` (rank `m + n`) with entries:
 *
 * ```
 * c[i_0]...[i_{m-1}][j_0]...[j_{n-1}] = a[i_0]...[i_{m-1}] * b[j_0]...[j_{n-1}]
 * ```
 *
 * Special cases:
 * - 0D × 0D (scalar × scalar): returns the scalar product `a * b`.
 * - 0D × ND or ND × 0D: returns scalar multiplication of the ND tensor.
 * - 1D × 1D (vector × vector): returns the 2D outer product matrix.
 * - 2D × 2D (matrix × matrix): returns the rank-4 tensor product whose
 *   matricization `(i * p + k, j * q + l)` is the Kronecker product `A ⊗_K B`.
 *
 * All validation, flattening, multiplication, and reshaping steps are purely
 * iterative (no recursion), making this safe for arbitrary nesting depths.
 *
 * @typedef {number | NestedFloatArray[]} NestedFloatArray
 *
 * @param {NestedFloatArray} a - First input tensor: a finite IEEE-754 float64
 *   number (rank 0) or a non-empty rectangular nested Array of finite float64
 *   numbers.
 * @param {NestedFloatArray} b - Second input tensor: a finite IEEE-754 float64
 *   number (rank 0) or a non-empty rectangular nested Array of finite float64
 *   numbers.
 * @returns {NestedFloatArray} The tensor product `a ⊗ b` as a new nested Array
 *   of IEEE-754 float64 numbers (or a number when both inputs are scalars).
 * @throws {TypeError} If either input is not a number or rectangular Array,
 *   contains non-number leaves, sparse holes, or circular references.
 * @throws {RangeError} If either input contains non-finite numbers (`NaN`,
 *   `Infinity`, `-Infinity`) or empty arrays at any dimension.
 */
export function tensorProductFloatIterative(a, b) {
	const flatA = validateAndFlattenIterative(a, 'a')
	const flatB = validateAndFlattenIterative(b, 'b')

	const resultShape = [...flatA.shape, ...flatB.shape]

	if (resultShape.length === 0) {
		return flatA.data[0] * flatB.data[0]
	}

	const sizeA = flatA.data.length
	const sizeB = flatB.data.length
	const flatProduct = new Float64Array(sizeA * sizeB)

	let outIdx = 0
	for (let i = 0; i < sizeA; i++) {
		const ai = flatA.data[i]
		for (let j = 0; j < sizeB; j++) {
			flatProduct[outIdx++] = ai * flatB.data[j]
		}
	}

	return reshapeIterative(flatProduct, resultShape)
}

/**
 * Iteratively validates a tensor input (finite float64 scalar or non-empty
 * rectangular nested Array of finite float64 numbers) and flattens it in
 * row-major (C-contiguous) order.
 *
 * @param {unknown} input - Candidate tensor value.
 * @param {string} name - Parameter name used in error messages.
 * @returns {{ shape: number[], data: Float64Array }} Tensor shape and flat data.
 */
function validateAndFlattenIterative(input, name) {
	if (typeof input === 'number') {
		if (!Number.isFinite(input)) {
			throw new RangeError(`${name} must be a finite IEEE-754 float64 number`)
		}
		const data = new Float64Array(1)
		data[0] = input
		return { shape: [], data }
	}

	if (!Array.isArray(input)) {
		throw new TypeError(
			`${name} must be a finite float64 number or a rectangular Array of finite float64 numbers`
		)
	}

	// Infer candidate shape iteratively along the leading edge, guarding against cycles.
	const shape = []
	const seen = new Set()
	let probe = input
	while (Array.isArray(probe)) {
		if (seen.has(probe)) {
			throw new TypeError(`${name} must not contain circular references`)
		}
		seen.add(probe)
		if (probe.length === 0) {
			throw new RangeError(`${name} must not contain empty arrays`)
		}
		if (!(0 in probe)) {
			throw new TypeError(`${name} must not contain sparse array holes`)
		}
		shape.push(probe.length)
		probe = probe[0]
	}

	const rank = shape.length
	let totalSize = 1
	for (let d = 0; d < rank; d++) {
		totalSize *= shape[d]
	}

	// Iteratively validate every branch and leaf in row-major order.
	const data = new Float64Array(totalSize)
	let writeIdx = 0
	const stack = [{ arr: input, depth: 0, index: 0 }]

	while (stack.length > 0) {
		const frame = stack[stack.length - 1]
		const { arr, depth } = frame

		if (frame.index >= arr.length) {
			stack.pop()
			continue
		}

		const i = frame.index
		frame.index += 1

		if (!(i in arr)) {
			throw new TypeError(`${name} must not contain sparse array holes`)
		}

		const item = arr[i]
		const nextDepth = depth + 1

		if (nextDepth < rank) {
			if (!Array.isArray(item)) {
				throw new TypeError(
					`${name} must be a rectangular tensor (inconsistent nesting depth at depth ${nextDepth})`
				)
			}
			if (item.length === 0) {
				throw new RangeError(`${name} must not contain empty arrays`)
			}
			if (item.length !== shape[nextDepth]) {
				throw new TypeError(
					`${name} must be a rectangular tensor (expected length ${shape[nextDepth]} at depth ${nextDepth}, got ${item.length})`
				)
			}
			stack.push({ arr: item, depth: nextDepth, index: 0 })
		} else {
			if (Array.isArray(item)) {
				throw new TypeError(
					`${name} must be a rectangular tensor (inconsistent nesting depth at depth ${nextDepth})`
				)
			}
			if (typeof item !== 'number') {
				throw new TypeError(
					`${name} elements must be IEEE-754 float64 numbers`
				)
			}
			if (!Number.isFinite(item)) {
				throw new RangeError(
					`${name} elements must be finite IEEE-754 float64 numbers`
				)
			}
			data[writeIdx++] = item
		}
	}

	return { shape, data }
}

/**
 * Iteratively reshapes a flat row-major Float64Array into a nested JS Array
 * matching `shape` (with `shape.length >= 1`).
 *
 * @param {Float64Array} flatData - Row-major scalar values.
 * @param {number[]} shape - Target positive integer dimensions.
 * @returns {NestedFloatArray} Nested Array with the given shape.
 */
function reshapeIterative(flatData, shape) {
	const innerDim = shape[shape.length - 1]
	const numInnerChunks = flatData.length / innerDim
	let level = new Array(numInnerChunks)

	for (let c = 0; c < numInnerChunks; c++) {
		const chunk = new Array(innerDim)
		const base = c * innerDim
		for (let k = 0; k < innerDim; k++) {
			chunk[k] = flatData[base + k]
		}
		level[c] = chunk
	}

	for (let d = shape.length - 2; d >= 0; d--) {
		const dim = shape[d]
		const nextCount = level.length / dim
		const nextLevel = new Array(nextCount)
		for (let c = 0; c < nextCount; c++) {
			const chunk = new Array(dim)
			const base = c * dim
			for (let k = 0; k < dim; k++) {
				chunk[k] = level[base + k]
			}
			nextLevel[c] = chunk
		}
		level = nextLevel
	}

	return level[0]
}
