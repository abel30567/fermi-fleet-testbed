/**
 * Iteratively validates a BigInt tensor (scalar or rectangular nested Array of BigInts),
 * extracting its shape and row-major flattened BigInt entries.
 *
 * @param {bigint | Array<*>} input - Tensor to inspect.
 * @param {string} name - Parameter name for error messages.
 * @returns {{ shape: number[], flat: bigint[] }}
 */
function inspectTensor(input, name) {
	if (typeof input === 'bigint') {
		return { shape: [], flat: [input] }
	}
	if (!Array.isArray(input)) {
		throw new TypeError(
			`${name} must be a BigInt or a rectangular nested Array of BigInts`
		)
	}

	const shape = [input.length]
	const flat = []
	let leafDepth = null
	const ancestors = new Set([input])
	const stack = [{ arr: input, index: 0, depth: 0 }]

	while (stack.length > 0) {
		const frame = stack[stack.length - 1]
		const { arr, depth } = frame

		if (frame.index >= arr.length) {
			stack.pop()
			ancestors.delete(arr)
			continue
		}

		const idx = frame.index
		frame.index += 1

		if (!(idx in arr)) {
			throw new TypeError(`${name} must not contain sparse array holes`)
		}

		const elem = arr[idx]
		const elemDepth = depth + 1

		if (typeof elem === 'bigint') {
			if (leafDepth === null) {
				if (elemDepth < shape.length) {
					throw new RangeError(`${name} has inconsistent rank across branches`)
				}
				leafDepth = elemDepth
			} else if (elemDepth !== leafDepth) {
				throw new RangeError(`${name} has inconsistent rank across branches`)
			}
			flat.push(elem)
		} else if (Array.isArray(elem)) {
			if (ancestors.has(elem)) {
				throw new RangeError(`${name} contains a cyclic array reference`)
			}
			if (leafDepth !== null && elemDepth >= leafDepth) {
				throw new RangeError(`${name} has inconsistent rank across branches`)
			}
			if (elemDepth < shape.length) {
				if (elem.length !== shape[elemDepth]) {
					throw new RangeError(
						`${name} is ragged at depth ${elemDepth}: expected length ${shape[elemDepth]}, got ${elem.length}`
					)
				}
			} else {
				shape.push(elem.length)
			}
			ancestors.add(elem)
			stack.push({ arr: elem, index: 0, depth: elemDepth })
		} else {
			const actualType = elem === null ? 'null' : typeof elem
			throw new TypeError(
				`${name} contains invalid element of type ${actualType}; expected BigInt or Array`
			)
		}
	}

	return { shape, flat }
}

/**
 * Iteratively builds a nested Array tensor of the given shape from a flat
 * row-major array of BigInt entries.
 *
 * @param {number[]} shape - Target tensor shape.
 * @param {bigint[]} flat - Flattened row-major BigInt entries.
 * @returns {bigint | Array<*>}
 */
function buildTensor(shape, flat) {
	if (shape.length === 0) {
		return flat[0]
	}

	const zeroIdx = shape.indexOf(0)
	let current
	let startDim

	if (zeroIdx !== -1) {
		if (zeroIdx === 0) {
			return []
		}
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

	for (let dimIdx = startDim; dimIdx >= 1; dimIdx--) {
		const dimSize = shape[dimIdx]
		const nextLen = current.length / dimSize
		const next = new Array(nextLen)
		for (let i = 0; i < nextLen; i++) {
			const chunk = new Array(dimSize)
			const base = i * dimSize
			for (let j = 0; j < dimSize; j++) {
				chunk[j] = current[base + j]
			}
			next[i] = chunk
		}
		current = next
	}

	return current
}

/**
 * Computes the exact tensor product (outer product) of two arbitrary-rank
 * BigInt tensors using a straightforward iterative implementation.
 *
 * Supports rank-0 scalars (`bigint`) as well as rectangular nested `Array`
 * tensors of arbitrary rank (including empty tensors). For operand `a` of
 * shape `[d_1, ..., d_r]` and operand `b` of shape `[e_1, ..., e_s]`, the
 * resulting tensor has shape `[d_1, ..., d_r, e_1, ..., e_s]` with entries:
 *
 * `(a ⊗ b)[i_1]...[i_r][j_1]...[j_s] = a[i_1]...[i_r] * b[j_1]...[j_s]`
 *
 * Because the tensor product of exact `bigint` integers is closed under
 * integer multiplication, every output entry is an exact `bigint` integer
 * with no rounding or fixed-point scaling loss.
 *
 * All validation, flattening, multiplication, and output reconstruction
 * stages are implemented iteratively without recursion.
 *
 * @param {bigint | Array<*>} a - Left operand: a `bigint` scalar or rectangular nested array of `bigint`s.
 * @param {bigint | Array<*>} b - Right operand: a `bigint` scalar or rectangular nested array of `bigint`s.
 * @returns {bigint | Array<*>} The exact tensor product `a ⊗ b`.
 * @throws {TypeError} If either operand or any leaf is not a `bigint` or `Array`, or if an array is sparse.
 * @throws {RangeError} If either operand is ragged, has inconsistent rank across branches, or contains a cycle.
 */
export function tensorProductBigIntIterative(a, b) {
	const left = inspectTensor(a, 'a')
	const right = inspectTensor(b, 'b')

	const outShape = [...left.shape, ...right.shape]
	if (outShape.length === 0) {
		return left.flat[0] * right.flat[0]
	}

	const leftLen = left.flat.length
	const rightLen = right.flat.length
	const outFlat = new Array(leftLen * rightLen)

	let outIdx = 0
	for (let i = 0; i < leftLen; i++) {
		const ai = left.flat[i]
		for (let j = 0; j < rightLen; j++) {
			outFlat[outIdx++] = ai * right.flat[j]
		}
	}

	return buildTensor(outShape, outFlat)
}
