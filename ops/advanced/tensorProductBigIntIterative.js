/**
 * Validates and flattens a BigInt scalar or rectangular nested Array of BigInts
 * into its shape and row-major flat array of BigInt values, using a strictly
 * iterative level-by-level traversal.
 *
 * @param {bigint | Array} tensor - Input tensor (scalar BigInt or rectangular nested Array of BigInts).
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {{ shape: number[], values: bigint[] }}
 */
function validateAndFlatten(tensor, name) {
	if (typeof tensor === 'bigint') {
		return { shape: [], values: [tensor] }
	}
	if (!Array.isArray(tensor)) {
		throw new TypeError(`${name} must be a BigInt or a rectangular nested Array of BigInts`)
	}

	const shape = []
	const visitedPriorLevels = new Set()
	let currentLevel = [tensor]

	while (true) {
		const first = currentLevel[0]

		if (Array.isArray(first)) {
			const dimLen = first.length

			for (let i = 0; i < currentLevel.length; i++) {
				const item = currentLevel[i]
				if (!Array.isArray(item)) {
					throw new TypeError(`${name} has inconsistent nesting depth (expected Array)`)
				}
				if (visitedPriorLevels.has(item)) {
					throw new TypeError(`${name} contains a circular array reference`)
				}
				if (item.length !== dimLen) {
					throw new RangeError(`${name} must be a rectangular tensor (ragged dimension encountered)`)
				}
			}

			shape.push(dimLen)
			if (dimLen === 0) {
				return { shape, values: [] }
			}

			for (let i = 0; i < currentLevel.length; i++) {
				visitedPriorLevels.add(currentLevel[i])
			}

			const nextLevel = new Array(currentLevel.length * dimLen)
			let idx = 0
			for (let i = 0; i < currentLevel.length; i++) {
				const arr = currentLevel[i]
				for (let j = 0; j < dimLen; j++) {
					nextLevel[idx++] = arr[j]
				}
			}
			currentLevel = nextLevel
		} else if (typeof first === 'bigint') {
			for (let i = 0; i < currentLevel.length; i++) {
				if (typeof currentLevel[i] !== 'bigint') {
					throw new TypeError(`${name} elements must all be BigInts at a uniform nesting depth`)
				}
			}
			return { shape, values: currentLevel }
		} else {
			throw new TypeError(`${name} elements must be BigInts`)
		}
	}
}

/**
 * Reshapes a flat array of items into a nested Array matching `shape` using
 * bottom-up iterative grouping.
 *
 * @param {Array} flat - Flat array of elements matching the product of `shape`.
 * @param {number[]} shape - Non-empty array of positive dimension sizes.
 * @returns {Array}
 */
function reshapeIterative(flat, shape) {
	let current = flat
	for (let d = shape.length - 1; d >= 1; d--) {
		const dim = shape[d]
		const groupCount = current.length / dim
		const next = new Array(groupCount)
		let offset = 0
		for (let g = 0; g < groupCount; g++) {
			const group = new Array(dim)
			for (let j = 0; j < dim; j++) {
				group[j] = current[offset++]
			}
			next[g] = group
		}
		current = next
	}
	return current
}

/**
 * Computes the tensor product (outer product) A ⊗ B of two arbitrary-rank
 * BigInt tensors using a straightforward, non-recursive iterative algorithm.
 *
 * Given tensor A with shape [d_1, ..., d_m] and tensor B with shape
 * [e_1, ..., e_n], the resulting tensor R has shape
 * [d_1, ..., d_m, e_1, ..., e_n] with exact BigInt entries:
 *   R[i_1]...[i_m][j_1]...[j_n] = A[i_1]...[i_m] * B[j_1]...[j_n]
 *
 * Special cases:
 * - Scalar ⊗ Scalar (rank 0 ⊗ rank 0) returns an exact BigInt scalar.
 * - Scalar ⊗ Tensor or Tensor ⊗ Scalar scales every entry by the scalar.
 * - Vector ⊗ Vector (rank 1 ⊗ rank 1) returns the 2D outer product matrix.
 * - Matrix ⊗ Matrix (rank 2 ⊗ rank 2) returns the 4D tensor product.
 * - Empty tensors (any dimension of size 0) return freshly allocated empty
 *   nested arrays up to the first zero-length dimension.
 *
 * @param {bigint | Array} a - Left operand tensor (BigInt scalar or rectangular nested Array of BigInts).
 * @param {bigint | Array} b - Right operand tensor (BigInt scalar or rectangular nested Array of BigInts).
 * @returns {bigint | Array} The exact BigInt tensor product A ⊗ B.
 * @throws {TypeError} If either operand is not a BigInt or rectangular nested Array of BigInts, has mixed depths, or contains circular references.
 * @throws {RangeError} If either operand is a ragged (non-rectangular) nested Array.
 */
export function tensorProductBigIntIterative(a, b) {
	const parsedA = validateAndFlatten(a, 'a')
	const parsedB = validateAndFlatten(b, 'b')

	const resultShape = [...parsedA.shape, ...parsedB.shape]

	if (resultShape.length === 0) {
		return parsedA.values[0] * parsedB.values[0]
	}

	const zeroIdx = resultShape.indexOf(0)
	if (zeroIdx !== -1) {
		if (zeroIdx === 0) {
			return []
		}
		const prefixShape = resultShape.slice(0, zeroIdx)
		let leafCount = 1
		for (let i = 0; i < prefixShape.length; i++) {
			leafCount *= prefixShape[i]
		}
		const emptyLeaves = new Array(leafCount)
		for (let i = 0; i < leafCount; i++) {
			emptyLeaves[i] = []
		}
		return reshapeIterative(emptyLeaves, prefixShape)
	}

	const valsA = parsedA.values
	const valsB = parsedB.values
	const lenA = valsA.length
	const lenB = valsB.length
	const flatProduct = new Array(lenA * lenB)

	let idx = 0
	for (let i = 0; i < lenA; i++) {
		const ai = valsA[i]
		for (let j = 0; j < lenB; j++) {
			flatProduct[idx++] = ai * valsB[j]
		}
	}

	return reshapeIterative(flatProduct, resultShape)
}
