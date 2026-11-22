/**
 * @typedef {{ v: number, d: number }} Dual
 * A forward-mode dual number representing `v + d * ε` (with `ε² = 0`),
 * where `v` is the primal value and `d` is the tangent (derivative).
 */

/**
 * @typedef {Dual | DualTensor[]} DualTensor
 * An arbitrary-rank nested array (or scalar) of dual numbers.
 */

/**
 * Normalize IEEE-754 negative zero to positive zero.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Multiply two dual numbers using the forward-mode product (Leibniz) rule:
 * `(a.v + a.d ε)(b.v + b.d ε) = (a.v * b.v) + (a.v * b.d + a.d * b.v) ε`.
 *
 * @param {Dual} a
 * @param {Dual} b
 * @returns {Dual}
 */
function dualMul(a, b) {
	return {
		v: normalizeZero(a.v * b.v),
		d: normalizeZero(a.v * b.d + a.d * b.v),
	}
}

/**
 * Check whether two tensor shape arrays are identical.
 *
 * @param {number[]} s1
 * @param {number[]} s2
 * @returns {boolean}
 */
function shapesEqual(s1, s2) {
	if (s1.length !== s2.length) return false
	for (let i = 0; i < s1.length; i++) {
		if (s1[i] !== s2[i]) return false
	}
	return true
}

/**
 * Validate a contiguous slice `[lo, hi)` of a tensor array via divide-and-conquer
 * and ensure all sub-tensors share a uniform shape.
 *
 * @param {unknown[]} arr
 * @param {number} lo
 * @param {number} hi
 * @param {string} name
 * @param {Set<object>} visited
 * @returns {number[]} The common child shape.
 */
function validateSlice(arr, lo, hi, name, visited) {
	if (hi - lo === 1) {
		if (!(lo in arr)) {
			throw new TypeError(`${name} contains a sparse array hole at index ${lo}`)
		}
		return validateTensor(arr[lo], name, visited)
	}

	const mid = (lo + hi) >>> 1
	const leftShape = validateSlice(arr, lo, mid, name, visited)
	const rightShape = validateSlice(arr, mid, hi, name, visited)

	if (!shapesEqual(leftShape, rightShape)) {
		throw new RangeError(
			`${name} is ragged: expected uniform child shape [${leftShape.join(', ')}] but found [${rightShape.join(', ')}]`,
		)
	}

	return leftShape
}

/**
 * Validate that a value is a well-formed arbitrary-rank dual tensor (either a
 * scalar `{ v, d }` with finite numbers, or a non-ragged, non-sparse, acyclic
 * nested array of dual numbers) and return its shape.
 *
 * @param {unknown} value
 * @param {string} name
 * @param {Set<object>} visited
 * @returns {number[]}
 */
function validateTensor(value, name, visited) {
	if (Array.isArray(value)) {
		if (visited.has(value)) {
			throw new TypeError(`${name} contains a circular array reference`)
		}
		if (value.length === 0) {
			return [0]
		}
		visited.add(value)
		try {
			const childShape = validateSlice(value, 0, value.length, name, visited)
			return [value.length, ...childShape]
		} finally {
			visited.delete(value)
		}
	}

	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${name} must contain dual numbers { v, d } or nested arrays thereof`)
	}

	const candidate = /** @type {Record<string, unknown>} */ (value)
	if (typeof candidate.v !== 'number' || typeof candidate.d !== 'number') {
		throw new TypeError(`${name} dual element must have numeric properties "v" and "d"`)
	}

	if (!Number.isFinite(candidate.v) || !Number.isFinite(candidate.d)) {
		throw new RangeError(`${name} dual element properties "v" and "d" must be finite numbers`)
	}

	return []
}

/**
 * Divide-and-conquer helper that multiplies a scalar dual across a slice
 * `[lo, hi)` of a tensor array `arr`, writing results into `out`.
 *
 * @param {Dual} scalar
 * @param {DualTensor[]} arr
 * @param {number} lo
 * @param {number} hi
 * @param {DualTensor[]} out
 */
function scaleSliceDivideConquer(scalar, arr, lo, hi, out) {
	if (hi - lo === 1) {
		out[lo] = scaleTensorRecursive(scalar, arr[lo])
		return
	}

	const mid = (lo + hi) >>> 1
	scaleSliceDivideConquer(scalar, arr, lo, mid, out)
	scaleSliceDivideConquer(scalar, arr, mid, hi, out)
}

/**
 * Recursively multiply a scalar dual number by an arbitrary-rank dual tensor.
 *
 * @param {Dual} scalar
 * @param {DualTensor} tensor
 * @returns {DualTensor}
 */
function scaleTensorRecursive(scalar, tensor) {
	if (!Array.isArray(tensor)) {
		return dualMul(scalar, tensor)
	}
	if (tensor.length === 0) {
		return []
	}
	const out = new Array(tensor.length)
	scaleSliceDivideConquer(scalar, tensor, 0, tensor.length, out)
	return out
}

/**
 * Divide-and-conquer helper that computes the tensor product of each element in
 * `arr[lo..hi)` with tensor `b`, writing results into `out`.
 *
 * @param {DualTensor[]} arr
 * @param {number} lo
 * @param {number} hi
 * @param {DualTensor[]} out
 * @param {DualTensor} b
 */
function productSliceDivideConquer(arr, lo, hi, out, b) {
	if (hi - lo === 1) {
		out[lo] = tensorProductRecursive(arr[lo], b)
		return
	}

	const mid = (lo + hi) >>> 1
	productSliceDivideConquer(arr, lo, mid, out, b)
	productSliceDivideConquer(arr, mid, hi, out, b)
}

/**
 * Recursively compute the outer/tensor product of two validated dual tensors
 * using structural recursion across dimensions and binary divide-and-conquer
 * splitting along each axis.
 *
 * @param {DualTensor} a
 * @param {DualTensor} b
 * @returns {DualTensor}
 */
function tensorProductRecursive(a, b) {
	if (!Array.isArray(a)) {
		return scaleTensorRecursive(a, b)
	}
	if (a.length === 0) {
		return []
	}
	const out = new Array(a.length)
	productSliceDivideConquer(a, 0, a.length, out, b)
	return out
}

/**
 * Compute the tensor (outer / Kronecker-structured) product `a ⊗ b` over
 * arbitrary-rank nested arrays (or scalars) of forward-mode dual numbers
 * `{ v, d }`, using a recursive divide-and-conquer algorithm.
 *
 * If `a` has shape `(d_1, ..., d_m)` and `b` has shape `(e_1, ..., e_n)`, the
 * result has shape `(d_1, ..., d_m, e_1, ..., e_n)` with entries:
 *
 * `C[i_1, ..., i_m, j_1, ..., j_n] = A[i_1, ..., i_m] * B[j_1, ..., j_n]`
 *
 * where dual multiplication follows the forward-mode product rule:
 * `(u_v + u_d ε)(w_v + w_d ε) = (u_v w_v) + (u_v w_d + u_d w_v) ε`.
 *
 * @param {DualTensor} a - Left operand: a dual number `{ v, d }` or a rectangular nested array of dual numbers.
 * @param {DualTensor} b - Right operand: a dual number `{ v, d }` or a rectangular nested array of dual numbers.
 * @returns {DualTensor} A newly allocated dual number or nested array representing `a ⊗ b`.
 * @throws {TypeError} If `a` or `b` is not a valid dual tensor, contains non-dual elements, sparse holes, or circular references.
 * @throws {RangeError} If `a` or `b` is ragged (inconsistent sub-tensor shapes) or contains non-finite numbers (`NaN`, `±Infinity`).
 */
export function tensorProductDualRecursive(a, b) {
	validateTensor(a, 'First argument (a)', new Set())
	validateTensor(b, 'Second argument (b)', new Set())
	return tensorProductRecursive(a, b)
}
