/**
 * Computes the tensor product of two dual-number tensors using the exact
 * first-order truncated dual series (bilinear Leibniz identity).
 *
 * A dual number is an object `{ v, d }` representing `v + d * ε` with `ε² = 0`,
 * where `v` is the primal value and `d` is the forward-mode derivative.
 *
 * Expanding `(A₀ + ε·A₁) ⊗ (B₀ + ε·B₁)` as a series in the nilpotent
 * indeterminate `ε` terminates identically at order 1:
 *
 *   (A ⊗ B)_v = A_v ⊗ B_v
 *   (A ⊗ B)_d = (A_d ⊗ B_v) + (A_v ⊗ B_d)
 *
 * Supports arbitrary-rank rectangular tensors of dual numbers (including rank-0
 * dual scalars, rank-1 vectors, rank-2 matrices, and higher-rank nested arrays).
 * If `a` has shape `[d₁, ..., dₘ]` and `b` has shape `[e₁, ..., eₙ]`, the result
 * has shape `[d₁, ..., dₘ, e₁, ..., eₙ]`.
 *
 * @typedef {{ v: number, d: number }} DualNumber
 * @typedef {DualNumber | DualTensor[]} DualTensor
 *
 * @param {DualTensor} a - Left operand dual scalar or rectangular nested array of dual numbers.
 * @param {DualTensor} b - Right operand dual scalar or rectangular nested array of dual numbers.
 * @returns {DualTensor} The dual-number tensor product `a ⊗ b`.
 * @throws {TypeError} If either operand is not a valid dual number or nested array of dual numbers.
 * @throws {RangeError} If any dual component is non-finite, an array is ragged, or multiplication overflows.
 */
export function tensorProductDualSeries(a, b) {
	validateDualTensor(a, 'a')
	validateDualTensor(b, 'b')
	return tensorProductRec(a, b)
}

/**
 * Validates that `node` is a well-formed dual scalar or rectangular dual tensor
 * and returns its shape array (`[]` for a scalar).
 *
 * @param {unknown} node
 * @param {string} name
 * @returns {number[]}
 */
function validateDualTensor(node, name) {
	if (Array.isArray(node)) {
		if (node.length === 0) {
			return [0]
		}
		if (!(0 in node)) {
			throw new TypeError(`${name} must not contain sparse array holes`)
		}
		const firstShape = validateDualTensor(node[0], name)
		for (let i = 1; i < node.length; i++) {
			if (!(i in node)) {
				throw new TypeError(`${name} must not contain sparse array holes`)
			}
			const childShape = validateDualTensor(node[i], name)
			if (childShape.length !== firstShape.length) {
				throw new RangeError(`${name} must be a rectangular tensor with uniform depth`)
			}
			for (let k = 0; k < firstShape.length; k++) {
				if (childShape[k] !== firstShape[k]) {
					throw new RangeError(`${name} must be a rectangular tensor with uniform inner dimensions`)
				}
			}
		}
		return [node.length, ...firstShape]
	}

	if (node === null || typeof node !== 'object') {
		throw new TypeError(`${name} elements must be dual number objects { v, d }`)
	}

	const { v, d } = node
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name} dual numbers must have numeric v and d properties`)
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name} dual number components v and d must be finite numbers`)
	}

	return []
}

/**
 * Multiplies two dual numbers via the order-1 nilpotent series product:
 * `(x.v + x.d·ε)(y.v + y.d·ε) = (x.v·y.v) + (x.d·y.v + x.v·y.d)·ε`.
 *
 * @param {DualNumber} x
 * @param {DualNumber} y
 * @returns {DualNumber}
 */
function mulDual(x, y) {
	const v = x.v * y.v
	const d = x.d * y.v + x.v * y.d
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual tensor product overflowed to a non-finite value')
	}
	return {
		v: v === 0 ? 0 : v,
		d: d === 0 ? 0 : d,
	}
}

/**
 * Scales a dual tensor by a dual scalar, producing fresh dual leaves.
 *
 * @param {DualNumber} scalar
 * @param {DualTensor} tensor
 * @returns {DualTensor}
 */
function scaleDualTensor(scalar, tensor) {
	if (Array.isArray(tensor)) {
		const out = new Array(tensor.length)
		for (let i = 0; i < tensor.length; i++) {
			out[i] = scaleDualTensor(scalar, tensor[i])
		}
		return out
	}
	return mulDual(scalar, tensor)
}

/**
 * Recursively computes the tensor product `a ⊗ b` over validated dual tensors.
 *
 * @param {DualTensor} a
 * @param {DualTensor} b
 * @returns {DualTensor}
 */
function tensorProductRec(a, b) {
	if (Array.isArray(a)) {
		const out = new Array(a.length)
		for (let i = 0; i < a.length; i++) {
			out[i] = tensorProductRec(a[i], b)
		}
		return out
	}
	return scaleDualTensor(a, b)
}
