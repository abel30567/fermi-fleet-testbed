/**
 * Maximum flat element count supported for a single dense JavaScript array (2^32 - 1).
 */
const MAX_TENSOR_ELEMENTS = 0xffffffff

/**
 * Checks whether two tensor shape tuples are identical.
 *
 * @param {number[]} s1 - First shape tuple.
 * @param {number[]} s2 - Second shape tuple.
 * @returns {boolean} True when both shapes have identical rank and dimensions.
 */
function shapesEqual(s1, s2) {
	if (s1.length !== s2.length) {
		return false
	}
	for (let i = 0; i < s1.length; i++) {
		if (s1[i] !== s2[i]) {
			return false
		}
	}
	return true
}

/**
 * Validates that a value is either a BigInt scalar (rank-0 tensor) or a non-empty,
 * non-sparse, acyclic rectangular nested array of BigInts, and flattens it in
 * row-major order along with its inferred shape tuple.
 *
 * @param {bigint | Array} node - Candidate tensor or sub-tensor.
 * @param {string} paramName - Parameter label used in error messages.
 * @param {Set<Array>} visiting - Active ancestor arrays for cycle detection.
 * @returns {{ shape: number[], flat: bigint[] }} Inferred shape and row-major flat entries.
 * @throws {TypeError} If any entry is not a BigInt/Array, contains sparse holes, or mixes scalars and arrays at the same depth.
 * @throws {RangeError} If any array is empty, ragged, or cyclic.
 */
function validateAndFlatten(node, paramName, visiting) {
	if (typeof node === 'bigint') {
		return { shape: [], flat: [node] }
	}
	if (!Array.isArray(node)) {
		throw new TypeError(
			`${paramName} must be a BigInt or a rectangular nested array of BigInts`
		)
	}
	if (visiting.has(node)) {
		throw new RangeError(`${paramName} contains a cyclic array reference`)
	}
	if (node.length === 0) {
		throw new RangeError(`${paramName} must not contain empty arrays`)
	}

	visiting.add(node)
	try {
		if (!Object.hasOwn(node, 0)) {
			throw new TypeError(`${paramName} must not contain sparse array holes`)
		}

		const first = node[0]
		const firstIsArray = Array.isArray(first)
		if (!firstIsArray && typeof first !== 'bigint') {
			throw new TypeError(
				`${paramName} must contain only BigInt values or rectangular nested arrays of BigInts`
			)
		}

		if (!firstIsArray) {
			const flat = new Array(node.length)
			for (let i = 0; i < node.length; i++) {
				if (!Object.hasOwn(node, i)) {
					throw new TypeError(`${paramName} must not contain sparse array holes`)
				}
				const val = node[i]
				if (typeof val !== 'bigint') {
					throw new TypeError(
						`${paramName} must contain only BigInt values at leaf level (found ${
							val === null ? 'null' : Array.isArray(val) ? 'Array' : typeof val
						})`
					)
				}
				flat[i] = val
			}
			return { shape: [node.length], flat }
		}

		let expectedSubShape = null
		const subFlats = new Array(node.length)
		let totalLength = 0

		for (let i = 0; i < node.length; i++) {
			if (!Object.hasOwn(node, i)) {
				throw new TypeError(`${paramName} must not contain sparse array holes`)
			}
			const child = node[i]
			if (!Array.isArray(child)) {
				throw new TypeError(
					`${paramName} has inconsistent nesting depth (expected Array, found ${
						child === null ? 'null' : typeof child
					})`
				)
			}
			const sub = validateAndFlatten(child, paramName, visiting)
			if (expectedSubShape === null) {
				expectedSubShape = sub.shape
			} else if (!shapesEqual(expectedSubShape, sub.shape)) {
				throw new RangeError(
					`${paramName} must be a rectangular tensor (mismatched subarray shape [${sub.shape.join(', ')}] vs [${expectedSubShape.join(', ')}])`
				)
			}
			subFlats[i] = sub.flat
			totalLength += sub.flat.length
		}

		const flat = new Array(totalLength)
		let cursor = 0
		for (let i = 0; i < subFlats.length; i++) {
			const chunk = subFlats[i]
			for (let j = 0; j < chunk.length; j++) {
				flat[cursor++] = chunk[j]
			}
		}

		return { shape: [node.length, ...expectedSubShape], flat }
	} finally {
		visiting.delete(node)
	}
}

/**
 * Computes closed-form row-major strides for a tensor shape tuple:
 * `strides[axis] = prod_{k = axis + 1}^{rank - 1} shape[k]`.
 *
 * @param {number[]} shape - Tensor shape tuple.
 * @returns {number[]} Row-major stride tuple of identical length.
 */
function computeStrides(shape) {
	const strides = new Array(shape.length)
	let stride = 1
	for (let axis = shape.length - 1; axis >= 0; axis--) {
		strides[axis] = stride
		stride *= shape[axis]
	}
	return strides
}

/**
 * Reconstructs a nested array tensor from a row-major flat BigInt buffer using
 * closed-form stride offsets.
 *
 * @param {bigint[]} flat - Row-major flat entries.
 * @param {number[]} shape - Output shape tuple.
 * @param {number[]} strides - Row-major strides for `shape`.
 * @param {number} axis - Current recursion axis.
 * @param {number} offset - Linear offset into `flat`.
 * @returns {bigint | Array} Nested tensor matching `shape` (or scalar `bigint` for rank 0).
 */
function unflattenByStrides(flat, shape, strides, axis, offset) {
	if (axis === shape.length) {
		return flat[offset]
	}
	const dim = shape[axis]
	const out = new Array(dim)
	if (axis === shape.length - 1) {
		for (let i = 0; i < dim; i++) {
			out[i] = flat[offset + i]
		}
		return out
	}
	const step = strides[axis]
	for (let i = 0; i < dim; i++) {
		out[i] = unflattenByStrides(flat, shape, strides, axis + 1, offset + i * step)
	}
	return out
}

/**
 * Computes the exact outer tensor product `A ⊗ B` over arbitrary-rank BigInt tensors
 * using closed-form row-major multi-index stride mapping.
 *
 * Contract:
 * - A rank-0 tensor is a `bigint` scalar (shape `[]`).
 * - A rank-`r` tensor (`r >= 1`) is a non-empty, non-sparse, acyclic rectangular nested
 *   `Array` of `bigint` values with shape `[d_0, ..., d_{r-1}]`.
 * - Given `a` of shape `[d_0, ..., d_{r-1}]` (rank `r`) and `b` of shape `[e_0, ..., e_{s-1}]`
 *   (rank `s`), the result `C = a ⊗ b` has shape `[d_0, ..., d_{r-1}, e_0, ..., e_{s-1}]`
 *   (rank `r + s`) with exact BigInt entries:
 *   `C[i_0, ..., i_{r-1}, j_0, ..., j_{s-1}] = a[i_0, ..., i_{r-1}] * b[j_0, ..., j_{s-1}]`.
 * - Special cases:
 *   - Scalar ⊗ Scalar -> Scalar (`a * b`).
 *   - Scalar ⊗ Tensor -> Scaled Tensor of same shape.
 *   - Vector `[m]` ⊗ Vector `[n]` -> Rank-2 outer product matrix `[m, n]`.
 *   - Matrix `[m, n]` ⊗ Matrix `[p, q]` -> Rank-4 tensor `[m, n, p, q]` (whose reshaping
 *     by `(i * p + k, j * q + l)` yields the classical 2D Kronecker block matrix).
 *
 * Algorithm:
 * 1. Validate both inputs and flatten them into contiguous row-major BigInt buffers
 *    `flatA` (length `N_A`) and `flatB` (length `N_B`).
 * 2. Use the closed-form row-major stride factorization:
 *    `idx_C(i_0,...,i_{r-1}, j_0,...,j_{s-1}) = idx_A(i_0,...,i_{r-1}) * N_B + idx_B(j_0,...,j_{s-1})`
 *    to compute `flatC[idx_A * N_B + idx_B] = flatA[idx_A] * flatB[idx_B]`.
 * 3. Unflatten `flatC` into a freshly allocated nested array matching `shapeA.concat(shapeB)`
 *    via exact row-major strides (never mutating or aliasing inputs).
 *
 * @param {bigint | Array} a - Left operand tensor (BigInt scalar or rectangular nested BigInt array).
 * @param {bigint | Array} b - Right operand tensor (BigInt scalar or rectangular nested BigInt array).
 * @returns {bigint | Array} Exact BigInt tensor product `a ⊗ b` of rank `rank(a) + rank(b)`.
 * @throws {TypeError} If `a` or `b` is not a BigInt or rectangular nested BigInt array, contains non-BigInt entries, sparse holes, or mixed depths.
 * @throws {RangeError} If `a` or `b` contains empty arrays, ragged dimensions, cyclic references, or if the output exceeds the maximum supported flat array size.
 */
export function tensorProductBigIntSeries(a, b) {
	const parsedA = validateAndFlatten(a, 'a', new Set())
	const parsedB = validateAndFlatten(b, 'b', new Set())

	const flatA = parsedA.flat
	const flatB = parsedB.flat
	const nA = flatA.length
	const nB = flatB.length

	if (nA > Math.floor(MAX_TENSOR_ELEMENTS / nB)) {
		throw new RangeError(
			`Resulting tensor size (${BigInt(nA) * BigInt(nB)}) exceeds maximum supported flat length`
		)
	}

	const nC = nA * nB
	const flatC = new Array(nC)

	for (let idxA = 0; idxA < nA; idxA++) {
		const aVal = flatA[idxA]
		const baseOffset = idxA * nB
		for (let idxB = 0; idxB < nB; idxB++) {
			flatC[baseOffset + idxB] = aVal * flatB[idxB]
		}
	}

	const shapeC = parsedA.shape.concat(parsedB.shape)
	const stridesC = computeStrides(shapeC)
	return unflattenByStrides(flatC, shapeC, stridesC, 0, 0)
}
