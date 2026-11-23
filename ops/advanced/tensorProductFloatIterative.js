/**
 * Computes the tensor product (outer product) of two arbitrary-rank tensors
 * over IEEE-754 float64 Numbers using a straightforward iterative algorithm.
 *
 * Given tensor `a` of shape `[d_1, ..., d_m]` and tensor `b` of shape
 * `[e_1, ..., e_n]`, returns tensor `c` of shape
 * `[d_1, ..., d_m, e_1, ..., e_n]` where:
 *
 *   c[i_1]...[i_m][j_1]...[j_n] = a[i_1]...[i_m] * b[j_1]...[j_n]
 *
 * @param {Array} a - First tensor (non-ragged nested Array of finite float64 numbers).
 * @param {Array} b - Second tensor (non-ragged nested Array of finite float64 numbers).
 * @returns {Array} Tensor product `a ⊗ b` as a nested Array of float64 numbers.
 * @throws {TypeError} If `a` or `b` is not an Array, or contains a non-number leaf.
 * @throws {RangeError} If `a` or `b` is ragged, has inconsistent rank, or contains non-finite numbers (NaN/Infinity).
 */
export function tensorProductFloatIterative(a, b) {
	const parsedA = inspectAndFlatten(a, 'a')
	const parsedB = inspectAndFlatten(b, 'b')

	const outShape = parsedA.shape.concat(parsedB.shape)
	const dataA = parsedA.data
	const dataB = parsedB.data
	const lenA = dataA.length
	const lenB = dataB.length

	const flat = new Array(lenA * lenB)
	let outIdx = 0
	for (let i = 0; i < lenA; i++) {
		const ai = dataA[i]
		for (let j = 0; j < lenB; j++) {
			flat[outIdx++] = ai * dataB[j]
		}
	}

	return reshapeIterative(flat, outShape)
}

/**
 * Iteratively validates that `tensor` is a rectangular nested Array of finite
 * IEEE-754 float64 numbers and returns its shape and row-major flat data.
 *
 * @param {unknown} tensor - Candidate tensor.
 * @param {string} name - Parameter name for error messages.
 * @returns {{ shape: number[], data: number[] }}
 */
function inspectAndFlatten(tensor, name) {
	if (!Array.isArray(tensor)) {
		throw new TypeError(`Parameter "${name}" must be an Array representing a tensor`)
	}

	const shape = []
	let currentLevel = [tensor]

	while (true) {
		const first = currentLevel[0]

		if (Array.isArray(first)) {
			const dim = first.length
			for (let i = 0; i < currentLevel.length; i++) {
				const item = currentLevel[i]
				if (!Array.isArray(item)) {
					throw new RangeError(`Parameter "${name}" has inconsistent tensor rank`)
				}
				if (item.length !== dim) {
					throw new RangeError(`Parameter "${name}" must be a rectangular (non-ragged) tensor`)
				}
			}

			shape.push(dim)

			if (dim === 0) {
				return { shape, data: [] }
			}

			const nextLevel = new Array(currentLevel.length * dim)
			let k = 0
			for (let i = 0; i < currentLevel.length; i++) {
				const item = currentLevel[i]
				for (let j = 0; j < dim; j++) {
					nextLevel[k++] = item[j]
				}
			}
			currentLevel = nextLevel
		} else {
			const data = new Array(currentLevel.length)
			for (let i = 0; i < currentLevel.length; i++) {
				const val = currentLevel[i]
				if (Array.isArray(val)) {
					throw new RangeError(`Parameter "${name}" has inconsistent tensor rank`)
				}
				if (typeof val !== 'number') {
					throw new TypeError(`Parameter "${name}" must contain only finite float64 numbers`)
				}
				if (!Number.isFinite(val)) {
					throw new RangeError(`Parameter "${name}" must contain only finite float64 numbers`)
				}
				data[i] = val
			}
			return { shape, data }
		}
	}
}

/**
 * Iteratively reshapes a flat row-major array into nested Arrays matching `shape`.
 *
 * @param {number[]} flat - Flat row-major data array.
 * @param {number[]} shape - Target tensor shape (length >= 1).
 * @returns {Array}
 */
function reshapeIterative(flat, shape) {
	let zeroIdx = -1
	for (let i = 0; i < shape.length; i++) {
		if (shape[i] === 0) {
			zeroIdx = i
			break
		}
	}

	if (zeroIdx === 0) {
		return []
	}

	let current
	let startDim

	if (zeroIdx > 0) {
		let totalEmpty = 1
		for (let i = 0; i < zeroIdx; i++) {
			totalEmpty *= shape[i]
		}
		current = new Array(totalEmpty)
		for (let i = 0; i < totalEmpty; i++) {
			current[i] = []
		}
		startDim = zeroIdx - 1
	} else {
		current = flat
		startDim = shape.length - 1
	}

	for (let d = startDim; d >= 1; d--) {
		const dim = shape[d]
		const groupCount = current.length / dim
		const next = new Array(groupCount)
		for (let g = 0; g < groupCount; g++) {
			const chunk = new Array(dim)
			const base = g * dim
			for (let k = 0; k < dim; k++) {
				chunk[k] = current[base + k]
			}
			next[g] = chunk
		}
		current = next
	}

	return current
}
