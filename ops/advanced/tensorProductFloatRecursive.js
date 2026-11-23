/**
 * Computes the tensor product (generalized outer product) of two arbitrarily
 * ranked rectangular tensors over IEEE-754 float64 Numbers using a recursive
 * divide-and-conquer strategy.
 *
 * Given a tensor `a` of shape `(d_1, ..., d_p)` and a tensor `b` of shape
 * `(e_1, ..., e_q)`, the resulting tensor has shape
 * `(d_1, ..., d_p, e_1, ..., e_q)` with entries:
 * `(a ⊗ b)[i_1]...[i_p][j_1]...[j_q] = a[i_1]...[i_p] * b[j_1]...[j_q]`.
 *
 * Each axis is traversed by recursively splitting index ranges in half
 * (divide-and-conquer) down to single-element base cases.
 *
 * @param {Array<number | Array>} a - Left-hand rectangular tensor of finite float64 numbers.
 * @param {Array<number | Array>} b - Right-hand rectangular tensor of finite float64 numbers.
 * @returns {Array} The tensor product `a ⊗ b` as a newly allocated nested Array of float64 numbers.
 * @throws {TypeError} If `a` or `b` is not an Array, contains sparse holes, or contains non-number leaf values.
 * @throws {RangeError} If `a` or `b` is ragged (inconsistent shape) or contains non-finite numbers (`NaN`, `±Infinity`).
 */
export function tensorProductFloatRecursive(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an Array');
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an Array');
	}

	validateTensor(a, 'a');
	validateTensor(b, 'b');

	return productTensorRecursive(a, b);
}

/**
 * Recursively validates that a tensor is rectangular, dense (no sparse holes),
 * and contains only finite IEEE-754 float64 numbers at every leaf.
 *
 * @param {number | Array} node - Current tensor node.
 * @param {string} name - Parameter name for error diagnostics.
 * @returns {number[]} Verified shape of the node (`[]` for scalar leaves).
 */
function validateTensor(node, name) {
	if (!Array.isArray(node)) {
		if (typeof node !== 'number') {
			throw new TypeError(
				`Tensor "${name}" must contain only finite IEEE-754 float64 numbers`
			);
		}
		if (!Number.isFinite(node)) {
			throw new RangeError(
				`Tensor "${name}" must contain only finite IEEE-754 float64 numbers`
			);
		}
		return [];
	}

	const len = node.length;
	if (len === 0) {
		return [0];
	}

	if (!(0 in node)) {
		throw new TypeError(`Tensor "${name}" must not contain sparse array holes`);
	}

	const expectedSubShape = validateTensor(node[0], name);
	for (let i = 1; i < len; i += 1) {
		if (!(i in node)) {
			throw new TypeError(`Tensor "${name}" must not contain sparse array holes`);
		}
		const subShape = validateTensor(node[i], name);
		if (!shapesEqual(subShape, expectedSubShape)) {
			throw new RangeError(
				`Tensor "${name}" must be rectangular with consistent shape`
			);
		}
	}

	return [len, ...expectedSubShape];
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
		return false;
	}
	for (let i = 0; i < s1.length; i += 1) {
		if (s1[i] !== s2[i]) {
			return false;
		}
	}
	return true;
}

/**
 * Recursively computes `tensorA ⊗ tensorB` by allocating the outer dimension
 * and filling it via divide-and-conquer halving.
 *
 * @param {Array} tensorA
 * @param {Array} tensorB
 * @returns {Array}
 */
function productTensorRecursive(tensorA, tensorB) {
	const len = tensorA.length;
	const out = new Array(len);
	productAxisDivideAndConquer(tensorA, 0, len, tensorB, out);
	return out;
}

/**
 * Divide-and-conquer traversal over `[start, end)` of an axis in `tensorA`.
 *
 * @param {Array} arr
 * @param {number} start
 * @param {number} end
 * @param {Array} tensorB
 * @param {Array} out
 */
function productAxisDivideAndConquer(arr, start, end, tensorB, out) {
	if (end <= start) {
		return;
	}
	if (end - start === 1) {
		const el = arr[start];
		out[start] =
			typeof el === 'number'
				? scaleTensorRecursive(el, tensorB)
				: productTensorRecursive(el, tensorB);
		return;
	}

	const mid = start + Math.floor((end - start) / 2);
	productAxisDivideAndConquer(arr, start, mid, tensorB, out);
	productAxisDivideAndConquer(arr, mid, end, tensorB, out);
}

/**
 * Recursively scales every float64 entry of `tensor` by `scalar` using
 * divide-and-conquer along each axis.
 *
 * @param {number} scalar
 * @param {Array} tensor
 * @returns {Array}
 */
function scaleTensorRecursive(scalar, tensor) {
	const len = tensor.length;
	const out = new Array(len);
	scaleAxisDivideAndConquer(scalar, tensor, 0, len, out);
	return out;
}

/**
 * Divide-and-conquer traversal over `[start, end)` of an axis when scaling by `scalar`.
 *
 * @param {number} scalar
 * @param {Array} arr
 * @param {number} start
 * @param {number} end
 * @param {Array} out
 */
function scaleAxisDivideAndConquer(scalar, arr, start, end, out) {
	if (end <= start) {
		return;
	}
	if (end - start === 1) {
		const el = arr[start];
		out[start] =
			typeof el === 'number'
				? scalar * el
				: scaleTensorRecursive(scalar, el);
		return;
	}

	const mid = start + Math.floor((end - start) / 2);
	scaleAxisDivideAndConquer(scalar, arr, start, mid, out);
	scaleAxisDivideAndConquer(scalar, arr, mid, end, out);
}
