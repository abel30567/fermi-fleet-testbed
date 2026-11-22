/**
 * Exact arbitrary-rank tensor product (outer product) over BigInt tensors using
 * a recursive divide-and-conquer algorithm.
 *
 * Mathematical definition:
 * Given a rectangular BigInt tensor `a` of rank `p` with shape `[a_0, ..., a_{p-1}]`
 * and a rectangular BigInt tensor `b` of rank `q` with shape `[b_0, ..., b_{q-1}]`,
 * their tensor product `c = a ⊗ b` is a rectangular BigInt tensor of rank `p + q`
 * with shape `[a_0, ..., a_{p-1}, b_0, ..., b_{q-1}]` whose entries satisfy:
 *
 *   c[i_0]...[i_{p-1}][j_0]...[j_{q-1}] = a[i_0]...[i_{p-1}] * b[j_0]...[j_{q-1}]
 *
 * Special cases:
 * - Scalar (rank 0) ⊗ scalar (rank 0) -> scalar BigInt (`a * b`).
 * - Scalar (rank 0) ⊗ tensor (rank q) -> tensor of rank q scaled by the scalar.
 * - Vector `[m]` ⊗ vector `[n]` -> rank-2 outer product matrix `[m, n]`.
 * - Matrix `[m, n]` ⊗ matrix `[p, q]` -> rank-4 tensor `[m, n, p, q]`.
 *
 * Because all entries are exact BigInts and tensor multiplication uses only
 * multiplication, every output entry is an exact BigInt with no rounding or
 * fixed-point scaling required.
 */

/**
 * Validates that `value` is a non-empty rectangular nested array of BigInts (or a scalar BigInt)
 * and returns its shape as an array of positive dimension sizes.
 *
 * @param {unknown} value - Candidate tensor to validate.
 * @param {string} name - Parameter name used in error messages.
 * @param {Set<object>} seen - Active ancestor arrays for cycle detection.
 * @returns {number[]} Tensor shape (`[]` for a scalar BigInt).
 * @throws {TypeError} If any leaf is not a BigInt, an array contains holes, or a cycle is detected.
 * @throws {RangeError} If any array is empty or sub-tensors have inconsistent (ragged) shapes.
 */
function validateTensor(value, name, seen = new Set()) {
	if (typeof value === 'bigint') {
		return [];
	}

	if (!Array.isArray(value)) {
		throw new TypeError(
			`${name} must be a BigInt or a rectangular nested array of BigInts`
		);
	}

	if (seen.has(value)) {
		throw new TypeError(`${name} must not contain circular array references`);
	}

	const len = value.length;
	if (len === 0) {
		throw new RangeError(`${name} must not contain empty arrays`);
	}

	seen.add(value);
	try {
		if (!Object.hasOwn(value, 0)) {
			throw new TypeError(`${name} must not be a sparse array`);
		}

		const firstShape = validateTensor(value[0], name, seen);
		const firstRank = firstShape.length;

		for (let i = 1; i < len; i++) {
			if (!Object.hasOwn(value, i)) {
				throw new TypeError(`${name} must not be a sparse array`);
			}

			const elemShape = validateTensor(value[i], name, seen);
			if (elemShape.length !== firstRank) {
				throw new RangeError(
					`${name} must be a rectangular tensor (ragged/inconsistent rank at index ${i})`
				);
			}
			for (let d = 0; d < firstRank; d++) {
				if (elemShape[d] !== firstShape[d]) {
					throw new RangeError(
						`${name} must be a rectangular tensor (ragged/inconsistent dimension at index ${i})`
					);
				}
			}
		}

		return [len, ...firstShape];
	} finally {
		seen.delete(value);
	}
}

/**
 * Scales a slice `[start, end)` of a BigInt tensor by `scalar` using binary divide-and-conquer.
 *
 * @param {bigint} scalar
 * @param {Array} tensor
 * @param {number} start
 * @param {number} end
 * @param {Array} out
 */
function scaleSliceDivideAndConquer(scalar, tensor, start, end, out) {
	if (end - start === 1) {
		out[start] = scaleTensorRecursive(scalar, tensor[start]);
		return;
	}

	const mid = start + ((end - start) >> 1);
	scaleSliceDivideAndConquer(scalar, tensor, start, mid, out);
	scaleSliceDivideAndConquer(scalar, tensor, mid, end, out);
}

/**
 * Recursively multiplies every entry of `tensor` by `scalar`.
 *
 * @param {bigint} scalar
 * @param {bigint | Array} tensor
 * @returns {bigint | Array}
 */
function scaleTensorRecursive(scalar, tensor) {
	if (typeof tensor === 'bigint') {
		return scalar * tensor;
	}

	const out = new Array(tensor.length);
	scaleSliceDivideAndConquer(scalar, tensor, 0, tensor.length, out);
	return out;
}

/**
 * Computes tensor products for slice `[start, end)` of `a` with `b` using binary divide-and-conquer.
 *
 * @param {Array} a
 * @param {number} start
 * @param {number} end
 * @param {bigint | Array} b
 * @param {Array} out
 */
function productSliceDivideAndConquer(a, start, end, b, out) {
	if (end - start === 1) {
		out[start] = tensorProductRecursive(a[start], b);
		return;
	}

	const mid = start + ((end - start) >> 1);
	productSliceDivideAndConquer(a, start, mid, b, out);
	productSliceDivideAndConquer(a, mid, end, b, out);
}

/**
 * Recursively computes `a ⊗ b` across the dimensions of `a`, splitting each axis
 * by binary divide-and-conquer until reaching scalar leaves, where `b` is recursively scaled.
 *
 * @param {bigint | Array} a
 * @param {bigint | Array} b
 * @returns {bigint | Array}
 */
function tensorProductRecursive(a, b) {
	if (typeof a === 'bigint') {
		return scaleTensorRecursive(a, b);
	}

	const out = new Array(a.length);
	productSliceDivideAndConquer(a, 0, a.length, b, out);
	return out;
}

/**
 * Computes the exact tensor product `a ⊗ b` of two arbitrary-rank rectangular BigInt tensors
 * using a recursive divide-and-conquer implementation.
 *
 * @typedef {bigint | BigIntTensor[]} BigIntTensor
 * @param {BigIntTensor} a - Left operand (BigInt scalar or non-empty rectangular nested array of BigInts).
 * @param {BigIntTensor} b - Right operand (BigInt scalar or non-empty rectangular nested array of BigInts).
 * @returns {BigIntTensor} New BigInt tensor with shape `[...shape(a), ...shape(b)]`.
 * @throws {TypeError} If `a` or `b` contains non-BigInt leaves, sparse holes, or circular references.
 * @throws {RangeError} If `a` or `b` contains empty arrays or ragged (non-rectangular) dimensions.
 */
export function tensorProductBigIntRecursive(a, b) {
	validateTensor(a, 'a');
	validateTensor(b, 'b');
	return tensorProductRecursive(a, b);
}
