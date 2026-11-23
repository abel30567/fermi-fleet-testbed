/**
 * Exact rational number represented in lowest terms with a strictly positive denominator.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Recursive N-dimensional rectangular tensor whose leaves are exact rationals.
 * A rank-0 tensor is a `Rational`; a rank-k (k >= 1) tensor is a non-sparse
 * rectangular array of rank-(k - 1) tensors.
 *
 * @typedef {Rational | RationalTensor[]} RationalTensor
 */

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value;
}

/**
 * Computes the non-negative greatest common divisor of two BigInts using
 * the iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a);
	let y = absBigInt(b);
	while (y !== 0n) {
		const remainder = x % y;
		x = y;
		y = remainder;
	}
	return x;
}

/**
 * Validates and normalizes a rational `{ num: bigint, den: bigint }` into lowest
 * terms with `den > 0n` (and `{ num: 0n, den: 1n }` when `num === 0n`).
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function normalizeRational(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`);
	}
	const { num, den } = value;
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have bigint 'num' and 'den' properties`);
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be 0n`);
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcdBigInt(n, d);
	return { num: n / g, den: d / g };
}

/**
 * Multiplies two already-normalized exact rationals using cross-cancellation
 * so the result is directly in lowest terms with `den > 0n`.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function multiplyNormalizedRationals(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n };
	}
	const g1 = gcdBigInt(a.num, b.den);
	const g2 = gcdBigInt(b.num, a.den);
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	};
}

/**
 * Checks whether two tensor shape tuples are identical.
 *
 * @param {number[]} shapeA
 * @param {number[]} shapeB
 * @returns {boolean}
 */
function shapesEqual(shapeA, shapeB) {
	if (shapeA.length !== shapeB.length) {
		return false;
	}
	for (let i = 0; i < shapeA.length; i += 1) {
		if (shapeA[i] !== shapeB[i]) {
			return false;
		}
	}
	return true;
}

/**
 * Validates that `value` is a well-formed rectangular rational tensor (no
 * sparse arrays, no jagged dimensions, all leaves valid rationals) and returns
 * a freshly normalized copy alongside its shape.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ normalized: RationalTensor, shape: number[] }}
 */
function validateAndNormalizeTensor(value, label) {
	if (!Array.isArray(value)) {
		return {
			normalized: normalizeRational(value, label),
			shape: [],
		};
	}

	const len = value.length;
	if (len === 0) {
		return {
			normalized: [],
			shape: [0],
		};
	}

	const normalized = new Array(len);
	let expectedSubShape = null;

	for (let i = 0; i < len; i += 1) {
		if (!(i in value)) {
			throw new TypeError(`${label}[${i}] is a sparse array hole; tensors must be dense`);
		}
		const child = validateAndNormalizeTensor(value[i], `${label}[${i}]`);
		if (expectedSubShape === null) {
			expectedSubShape = child.shape;
		} else if (!shapesEqual(expectedSubShape, child.shape)) {
			throw new TypeError(
				`${label} must be rectangular: sub-tensor at index ${i} has shape [${child.shape.join(', ')}], expected [${expectedSubShape.join(', ')}]`
			);
		}
		normalized[i] = child.normalized;
	}

	return {
		normalized,
		shape: [len, ...expectedSubShape],
	};
}

/**
 * Divide-and-conquer helper that scales a contiguous slice `[start, end)` of a
 * normalized tensor array by a normalized rational scalar.
 *
 * @param {Rational} scalar
 * @param {RationalTensor[]} arr
 * @param {RationalTensor[]} out
 * @param {number} start
 * @param {number} end
 */
function scaleSliceDivideAndConquer(scalar, arr, out, start, end) {
	const len = end - start;
	if (len === 0) {
		return;
	}
	if (len === 1) {
		out[start] = scaleTensorRecursive(scalar, arr[start]);
		return;
	}
	const mid = start + (len >>> 1);
	scaleSliceDivideAndConquer(scalar, arr, out, start, mid);
	scaleSliceDivideAndConquer(scalar, arr, out, mid, end);
}

/**
 * Recursively scales a normalized rational tensor by a normalized rational
 * scalar using divide-and-conquer splitting along each tensor axis.
 *
 * @param {Rational} scalar
 * @param {RationalTensor} tensor
 * @returns {RationalTensor}
 */
function scaleTensorRecursive(scalar, tensor) {
	if (!Array.isArray(tensor)) {
		return multiplyNormalizedRationals(scalar, tensor);
	}
	const out = new Array(tensor.length);
	scaleSliceDivideAndConquer(scalar, tensor, out, 0, tensor.length);
	return out;
}

/**
 * Divide-and-conquer helper that computes the tensor product of a contiguous
 * slice `[start, end)` of `leftArr` with `rightTensor`.
 *
 * @param {RationalTensor[]} leftArr
 * @param {RationalTensor} rightTensor
 * @param {RationalTensor[]} out
 * @param {number} start
 * @param {number} end
 */
function tensorProductSliceDivideAndConquer(leftArr, rightTensor, out, start, end) {
	const len = end - start;
	if (len === 0) {
		return;
	}
	if (len === 1) {
		out[start] = computeTensorProductRecursive(leftArr[start], rightTensor);
		return;
	}
	const mid = start + (len >>> 1);
	tensorProductSliceDivideAndConquer(leftArr, rightTensor, out, start, mid);
	tensorProductSliceDivideAndConquer(leftArr, rightTensor, out, mid, end);
}

/**
 * Recursively computes the tensor product of two already-validated and
 * normalized rational tensors using divide-and-conquer.
 *
 * @param {RationalTensor} a
 * @param {RationalTensor} b
 * @returns {RationalTensor}
 */
function computeTensorProductRecursive(a, b) {
	if (!Array.isArray(a)) {
		return scaleTensorRecursive(a, b);
	}
	const out = new Array(a.length);
	tensorProductSliceDivideAndConquer(a, b, out, 0, a.length);
	return out;
}

/**
 * Computes the exact-rational tensor product (outer tensor product) `a ⊗ b`
 * using a recursive divide-and-conquer implementation.
 *
 * Given a tensor `a` of shape `[d_1, ..., d_r]` and a tensor `b` of shape
 * `[e_1, ..., e_s]`, returns a new tensor of shape `[d_1, ..., d_r, e_1, ..., e_s]`
 * where:
 *
 *   `(a ⊗ b)[i_1]...[i_r][j_1]...[j_s] = a[i_1]...[i_r] * b[j_1]...[j_s]`
 *
 * Rank-0 inputs are exact rational scalars `{ num: BigInt, den: BigInt }`,
 * rank-1 inputs are vectors (yielding an outer-product matrix for vector ⊗ vector),
 * rank-2 inputs are matrices, and higher-rank rectangular nested arrays are
 * supported to arbitrary depth.
 *
 * All output rationals are newly allocated and normalized in lowest terms with
 * `den > 0n` (with zero represented as `{ num: 0n, den: 1n }`).
 *
 * @param {RationalTensor} a - Left rational tensor (scalar or rectangular nested array).
 * @param {RationalTensor} b - Right rational tensor (scalar or rectangular nested array).
 * @returns {RationalTensor} The exact-rational tensor product `a ⊗ b`.
 * @throws {TypeError} If `a` or `b` is not a valid rectangular rational tensor or contains sparse holes.
 * @throws {RangeError} If any rational entry has a denominator of `0n`.
 */
export function tensorProductRationalRecursive(a, b) {
	const validatedA = validateAndNormalizeTensor(a, 'a');
	const validatedB = validateAndNormalizeTensor(b, 'b');
	return computeTensorProductRecursive(validatedA.normalized, validatedB.normalized);
}
