/**
 * Computes the tensor product (outer product) of two arbitrary-rank tensors
 * over IEEE-754 float64 numbers using a recursive divide-and-conquer traversal.
 *
 * A tensor is represented either as a finite float64 scalar (`number`, rank 0)
 * or as a non-empty rectangular nested `Array` of finite float64 numbers.
 * Given tensor `a` of shape `[d_1, ..., d_p]` and tensor `b` of shape
 * `[e_1, ..., e_q]`, the resulting tensor `T = a ⊗ b` has shape
 * `[d_1, ..., d_p, e_1, ..., e_q]` with entries:
 *
 *   T[i_1, ..., i_p, j_1, ..., j_q] = a[i_1, ..., i_p] * b[j_1, ..., j_q]
 *
 * Both validation and product construction use binary divide-and-conquer
 * splitting along every tensor axis so recursion depth stays O(rank + sum(log d_k)).
 *
 * @typedef {number | Tensor[]} Tensor
 *
 * @param {Tensor} a - Left operand tensor (finite float64 scalar or rectangular nested array).
 * @param {Tensor} b - Right operand tensor (finite float64 scalar or rectangular nested array).
 * @returns {Tensor} Newly allocated tensor representing the outer product `a ⊗ b`.
 * @throws {TypeError} If either operand contains non-number/non-array values or sparse array holes.
 * @throws {RangeError} If either operand contains non-finite numbers (`NaN`, `±Infinity`),
 *   empty arrays, or non-rectangular (jagged / mixed-rank) dimensions.
 */
export function tensorProductFloatRecursive(a, b) {
	validateTensor(a, 'a')
	validateTensor(b, 'b')
	return outerProductRecursive(a, b)
}

/**
 * Checks whether two tensor shape tuples are identical.
 *
 * @param {number[]} s1
 * @param {number[]} s2
 * @returns {boolean}
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
 * Recursively validates a tensor and returns its uniform shape tuple.
 *
 * @param {unknown} node
 * @param {string} name
 * @returns {number[]}
 */
function validateTensor(node, name) {
	if (typeof node === 'number') {
		if (!Number.isFinite(node)) {
			throw new RangeError(
				`tensorProductFloatRecursive: operand "${name}" contains non-finite float64 value (${node})`
			)
		}
		return []
	}

	if (!Array.isArray(node)) {
		throw new TypeError(
			`tensorProductFloatRecursive: operand "${name}" must be a finite number or nested Array`
		)
	}

	if (node.length === 0) {
		throw new RangeError(
			`tensorProductFloatRecursive: operand "${name}" must not contain empty dimensions`
		)
	}

	const childShape = validateAxisRange(node, 0, node.length, name)
	return [node.length, ...childShape]
}

/**
 * Divide-and-conquer validation over index slice `[start, end)` of an axis array.
 *
 * @param {unknown[]} arr
 * @param {number} start
 * @param {number} end
 * @param {string} name
 * @returns {number[]} Common shape of elements in `[start, end)`.
 */
function validateAxisRange(arr, start, end, name) {
	if (end - start === 1) {
		if (!(start in arr)) {
			throw new TypeError(
				`tensorProductFloatRecursive: operand "${name}" must not be a sparse array`
			)
		}
		return validateTensor(arr[start], name)
	}

	const mid = (start + end) >>> 1
	const leftShape = validateAxisRange(arr, start, mid, name)
	const rightShape = validateAxisRange(arr, mid, end, name)

	if (!shapesEqual(leftShape, rightShape)) {
		throw new RangeError(
			`tensorProductFloatRecursive: operand "${name}" has non-rectangular shape ([${leftShape.join(', ')}] vs [${rightShape.join(', ')}])`
		)
	}

	return leftShape
}

/**
 * Multiplies a scalar by every element of tensor `b` using divide-and-conquer
 * across all axes of `b`, returning a newly allocated tensor.
 *
 * @param {number} scalar
 * @param {Tensor} b
 * @returns {Tensor}
 */
function scaleTensorRecursive(scalar, b) {
	if (typeof b === 'number') {
		const product = scalar * b
		return product === 0 ? 0 : product
	}

	const out = new Array(b.length)
	fillScaledAxis(out, scalar, b, 0, b.length)
	return out
}

/**
 * Divide-and-conquer fill for `scaleTensorRecursive` over `[start, end)`.
 *
 * @param {Tensor[]} out
 * @param {number} scalar
 * @param {Tensor[]} b
 * @param {number} start
 * @param {number} end
 */
function fillScaledAxis(out, scalar, b, start, end) {
	if (end - start === 1) {
		out[start] = scaleTensorRecursive(scalar, b[start])
		return
	}

	const mid = (start + end) >>> 1
	fillScaledAxis(out, scalar, b, start, mid)
	fillScaledAxis(out, scalar, b, mid, end)
}

/**
 * Recursively computes `a ⊗ b` by descending through `a`'s axes via
 * divide-and-conquer until reaching scalar leaves, where `b` is scaled.
 *
 * @param {Tensor} a
 * @param {Tensor} b
 * @returns {Tensor}
 */
function outerProductRecursive(a, b) {
	if (typeof a === 'number') {
		return scaleTensorRecursive(a, b)
	}

	const out = new Array(a.length)
	fillOuterAxis(out, a, b, 0, a.length)
	return out
}

/**
 * Divide-and-conquer fill for `outerProductRecursive` over `[start, end)`.
 *
 * @param {Tensor[]} out
 * @param {Tensor[]} a
 * @param {Tensor} b
 * @param {number} start
 * @param {number} end
 */
function fillOuterAxis(out, a, b, start, end) {
	if (end - start === 1) {
		out[start] = outerProductRecursive(a[start], b)
		return
	}

	const mid = (start + end) >>> 1
	fillOuterAxis(out, a, b, start, mid)
	fillOuterAxis(out, a, b, mid, end)
}
