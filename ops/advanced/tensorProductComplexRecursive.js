/**
 * Computes the tensor (outer) product of two arbitrary-rank tensors over
 * complex numbers represented as `{ re, im }` objects, using a recursive
 * divide-and-conquer implementation.
 *
 * For a tensor `a` of shape `[a_0, ..., a_{r-1}]` and a tensor `b` of shape
 * `[b_0, ..., b_{s-1}]`, the resulting tensor `a ⊗ b` has shape
 * `[a_0, ..., a_{r-1}, b_0, ..., b_{s-1}]` and entries:
 *   `(a ⊗ b)[i_0]...[i_{r-1}][j_0]...[j_{s-1}] = a[i_0]...[i_{r-1}] * b[j_0]...[j_{s-1}]`
 *
 * Rank-0 tensors (scalar complex numbers `{ re, im }`) are also supported:
 * - scalar ⊗ scalar returns their complex product `{ re, im }`
 * - scalar ⊗ tensor scales every entry of the tensor recursively
 * - tensor ⊗ scalar scales every entry of the tensor recursively
 *
 * Along each array dimension of length n > 1, the algorithm divides the index
 * range `[start, end)` at the midpoint `mid = (start + end) >>> 1` and conquers
 * both halves recursively, achieving O(log n) recursion depth per axis and
 * optimal O(|a| * |b|) time and output space.
 *
 * @typedef {{ re: number, im: number }} Complex
 * @typedef {Complex | ComplexTensor[]} ComplexTensor
 *
 * @param {ComplexTensor} a - Left complex scalar or rectangular nested array of complex numbers.
 * @param {ComplexTensor} b - Right complex scalar or rectangular nested array of complex numbers.
 * @returns {ComplexTensor} The complex tensor product `a ⊗ b`.
 * @throws {TypeError} If an input or nested element is not a valid finite complex `{ re, im }` or dense array.
 * @throws {RangeError} If any array dimension is empty or the tensor is ragged (non-rectangular).
 */
export function tensorProductComplexRecursive(a, b) {
	validateTensor(a, 'a')
	validateTensor(b, 'b')
	return tensorProductCore(a, b)
}

/**
 * Checks whether a value is a valid finite complex number `{ re, im }`.
 *
 * @param {unknown} value
 * @returns {value is Complex}
 */
function isComplex(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		typeof value.re === 'number' &&
		Number.isFinite(value.re) &&
		typeof value.im === 'number' &&
		Number.isFinite(value.im)
	)
}

/**
 * Checks whether two shape arrays are identical.
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
 * Recursively validates that `value` is a finite complex scalar or a non-empty,
 * dense, rectangular nested array of finite complex numbers, returning its shape.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {number[]}
 */
function validateTensor(value, name) {
	if (isComplex(value)) {
		return []
	}
	if (!Array.isArray(value)) {
		throw new TypeError(
			`${name} must be a finite complex number { re, im } or a rectangular array of complex numbers`
		)
	}
	if (value.length === 0) {
		throw new RangeError(`${name} must not contain empty dimensions`)
	}
	if (!(0 in value)) {
		throw new TypeError(`${name} must not contain sparse array holes`)
	}

	const expectedSubShape = validateTensor(value[0], `${name}[0]`)
	for (let i = 1; i < value.length; i++) {
		if (!(i in value)) {
			throw new TypeError(`${name} must not contain sparse array holes`)
		}
		const subShape = validateTensor(value[i], `${name}[${i}]`)
		if (!shapesEqual(expectedSubShape, subShape)) {
			throw new RangeError(
				`${name} must be a rectangular tensor: shape mismatch at index ${i}`
			)
		}
	}

	return [value.length, ...expectedSubShape]
}

/**
 * Multiplies two complex numbers and normalizes `-0` to `0`.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexMul(a, b) {
	const re = a.re * b.re - a.im * b.im
	const im = a.re * b.im + a.im * b.re
	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}

/**
 * Divide-and-conquer filler that scales elements `tensor[start..end-1]` by `scalar`.
 *
 * @param {Complex} scalar
 * @param {ComplexTensor[]} tensor
 * @param {ComplexTensor[]} out
 * @param {number} start
 * @param {number} end
 */
function scaleTensorFill(scalar, tensor, out, start, end) {
	if (end - start === 1) {
		out[start] = scaleTensorRecursive(scalar, tensor[start])
		return
	}
	const mid = (start + end) >>> 1
	scaleTensorFill(scalar, tensor, out, start, mid)
	scaleTensorFill(scalar, tensor, out, mid, end)
}

/**
 * Recursively multiplies a complex tensor of arbitrary rank by a complex scalar.
 *
 * @param {Complex} scalar
 * @param {ComplexTensor} tensor
 * @returns {ComplexTensor}
 */
function scaleTensorRecursive(scalar, tensor) {
	if (!Array.isArray(tensor)) {
		return complexMul(scalar, tensor)
	}
	const out = new Array(tensor.length)
	scaleTensorFill(scalar, tensor, out, 0, tensor.length)
	return out
}

/**
 * Divide-and-conquer filler computing `a[i] ⊗ b` for `i` in `[start, end)`.
 *
 * @param {ComplexTensor[]} a
 * @param {ComplexTensor} b
 * @param {ComplexTensor[]} out
 * @param {number} start
 * @param {number} end
 */
function tensorProductFill(a, b, out, start, end) {
	if (end - start === 1) {
		out[start] = tensorProductCore(a[start], b)
		return
	}
	const mid = (start + end) >>> 1
	tensorProductFill(a, b, out, start, mid)
	tensorProductFill(a, b, out, mid, end)
}

/**
 * Core recursive tensor product assuming inputs have already been validated.
 *
 * @param {ComplexTensor} a
 * @param {ComplexTensor} b
 * @returns {ComplexTensor}
 */
function tensorProductCore(a, b) {
	if (!Array.isArray(a)) {
		return scaleTensorRecursive(a, b)
	}
	const out = new Array(a.length)
	tensorProductFill(a, b, out, 0, a.length)
	return out
}
