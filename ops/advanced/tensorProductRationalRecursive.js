/**
 * @typedef {object} Rational
 * @property {bigint} num - Numerator as a BigInt.
 * @property {bigint} den - Non-zero denominator as a BigInt.
 */

/**
 * Recursive tensor of exact rationals: a rank-0 scalar Rational, or an arbitrarily
 * nested rectangular array of Rational elements.
 *
 * @typedef {Rational | RationalTensor[]} RationalTensor
 */

/**
 * Compute the absolute value of a BigInt.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function absBigInt(n) {
	return n < 0n ? -n : n
}

/**
 * Compute the non-negative greatest common divisor of two BigInts using the
 * Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validate and normalize a single rational object `{ num: BigInt, den: BigInt }`
 * to lowest terms with strictly positive denominator (`den > 0n`).
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateAndNormalizeRational(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label}: expected a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label}: rational num and den must both be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`${label}: rational denominator must be non-zero`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const sign = den < 0n ? -1n : 1n
	const signedNum = num * sign
	const posDen = den * sign
	const g = gcdBigInt(signedNum, posDen)
	return { num: signedNum / g, den: posDen / g }
}

/**
 * Multiply two already-normalized rationals (`den > 0n`, `gcd(|num|, den) === 1n`),
 * cross-cancelling common factors so the result is guaranteed to be in lowest terms
 * with `den > 0n`.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function multiplyNormalizedRationals(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Recursively compare two tensor shape tuples for equality.
 *
 * @param {number[]} s1
 * @param {number[]} s2
 * @param {number} [idx=0]
 * @returns {boolean}
 */
function shapesEqual(s1, s2, idx = 0) {
	if (s1.length !== s2.length) {
		return false
	}
	if (idx === s1.length) {
		return true
	}
	if (s1[idx] !== s2[idx]) {
		return false
	}
	return shapesEqual(s1, s2, idx + 1)
}

/**
 * Divide-and-conquer validation and normalization of an array slice `[start, end)`.
 * Returns the common shape of all elements in the slice and writes normalized
 * elements into `out[start..end-1]`.
 *
 * @param {unknown[]} arr
 * @param {number} start
 * @param {number} end
 * @param {RationalTensor[]} out
 * @param {string} label
 * @param {Set<unknown>} visiting
 * @returns {number[]}
 */
function validateSlice(arr, start, end, out, label, visiting) {
	if (end - start === 1) {
		if (!(start in arr)) {
			throw new TypeError(`${label}[${start}]: sparse array holes are not allowed`)
		}
		const child = validateAndNormalizeTensor(arr[start], `${label}[${start}]`, visiting)
		out[start] = child.value
		return child.shape
	}
	const mid = start + ((end - start) >>> 1)
	const leftShape = validateSlice(arr, start, mid, out, label, visiting)
	const rightShape = validateSlice(arr, mid, end, out, label, visiting)
	if (!shapesEqual(leftShape, rightShape)) {
		throw new RangeError(
			`${label}: ragged tensor detected (child shapes [${leftShape.join(', ')}] vs [${rightShape.join(', ')}])`
		)
	}
	return leftShape
}

/**
 * Recursively validate that `tensor` is a well-formed rectangular rational tensor
 * (without cycles or sparse holes) and return its normalized copy and shape.
 *
 * @param {unknown} tensor
 * @param {string} label
 * @param {Set<unknown>} visiting
 * @returns {{ value: RationalTensor, shape: number[] }}
 */
function validateAndNormalizeTensor(tensor, label, visiting) {
	if (!Array.isArray(tensor)) {
		return {
			value: validateAndNormalizeRational(tensor, label),
			shape: [],
		}
	}
	if (visiting.has(tensor)) {
		throw new TypeError(`${label}: circular reference detected in tensor`)
	}
	if (tensor.length === 0) {
		return { value: [], shape: [0] }
	}
	visiting.add(tensor)
	try {
		const out = new Array(tensor.length)
		const childShape = validateSlice(tensor, 0, tensor.length, out, label, visiting)
		return {
			value: out,
			shape: [tensor.length, ...childShape],
		}
	} finally {
		visiting.delete(tensor)
	}
}

/**
 * Divide-and-conquer scaling of a normalized tensor slice `[start, end)` by a
 * normalized rational scalar.
 *
 * @param {Rational} scalar
 * @param {RationalTensor[]} arr
 * @param {number} start
 * @param {number} end
 * @param {RationalTensor[]} out
 */
function scaleSlice(scalar, arr, start, end, out) {
	if (end - start === 1) {
		out[start] = scaleTensorRecursive(scalar, arr[start])
		return
	}
	const mid = start + ((end - start) >>> 1)
	scaleSlice(scalar, arr, start, mid, out)
	scaleSlice(scalar, arr, mid, end, out)
}

/**
 * Recursively multiply a normalized rational scalar by a normalized rational tensor.
 *
 * @param {Rational} scalar
 * @param {RationalTensor} tensor
 * @returns {RationalTensor}
 */
function scaleTensorRecursive(scalar, tensor) {
	if (!Array.isArray(tensor)) {
		return multiplyNormalizedRationals(scalar, tensor)
	}
	if (tensor.length === 0) {
		return []
	}
	const out = new Array(tensor.length)
	scaleSlice(scalar, tensor, 0, tensor.length, out)
	return out
}

/**
 * Divide-and-conquer tensor product over slice `[start, end)` of normalized tensor `a`
 * with normalized tensor `b`.
 *
 * @param {RationalTensor[]} a
 * @param {RationalTensor} b
 * @param {number} start
 * @param {number} end
 * @param {RationalTensor[]} out
 */
function productSlice(a, b, start, end, out) {
	if (end - start === 1) {
		out[start] = tensorProductCore(a[start], b)
		return
	}
	const mid = start + ((end - start) >>> 1)
	productSlice(a, b, start, mid, out)
	productSlice(a, b, mid, end, out)
}

/**
 * Recursively compute the tensor (outer) product of two normalized rational tensors.
 *
 * @param {RationalTensor} a
 * @param {RationalTensor} b
 * @returns {RationalTensor}
 */
function tensorProductCore(a, b) {
	if (!Array.isArray(a)) {
		return scaleTensorRecursive(a, b)
	}
	if (a.length === 0) {
		return []
	}
	const out = new Array(a.length)
	productSlice(a, b, 0, a.length, out)
	return out
}

/**
 * Compute the exact tensor (outer) product `a ⊗ b` over arbitrary-rank tensors
 * of exact rationals `{ num: BigInt, den: BigInt }` using a recursive
 * divide-and-conquer algorithm.
 *
 * For a tensor `a` of shape `(a_1, ..., a_m)` (rank `m >= 0`) and a tensor `b`
 * of shape `(b_1, ..., b_n)` (rank `n >= 0`), returns a tensor of shape
 * `(a_1, ..., a_m, b_1, ..., b_n)` (rank `m + n`) whose entry at
 * `[i_1]...[i_m][j_1]...[j_n]` is the exact rational product
 * `a[i_1]...[i_m] * b[j_1]...[j_n]`.
 *
 * All output rationals are normalized to lowest terms with strictly positive
 * denominator (`den > 0n`), and zero is always represented as `{ num: 0n, den: 1n }`.
 *
 * @param {RationalTensor} a - Left rational scalar or rectangular nested array tensor.
 * @param {RationalTensor} b - Right rational scalar or rectangular nested array tensor.
 * @returns {RationalTensor} The exact tensor product `a ⊗ b`.
 * @throws {TypeError} If an input contains non-rational elements, non-BigInt fields,
 *   sparse array holes, or circular references.
 * @throws {RangeError} If any rational has a zero denominator or any tensor is ragged.
 */
export function tensorProductRationalRecursive(a, b) {
	const normA = validateAndNormalizeTensor(a, 'a', new Set())
	const normB = validateAndNormalizeTensor(b, 'b', new Set())
	return tensorProductCore(normA.value, normB.value)
}
