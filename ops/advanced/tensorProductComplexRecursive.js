/**
 * @typedef {{ re: number, im: number }} Complex
 * @typedef {Complex | ComplexTensor[]} ComplexTensor
 */

/**
 * Normalizes `-0` to `+0`.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates that a value is a complex number `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value
 * @param {string} label
 * @throws {TypeError} If the value is not a non-null non-array object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex object { re, im } or a rectangular array of complex numbers`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${label} must have numeric "re" and "im" properties`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${label} must have finite numeric "re" and "im" properties`)
	}
}

/**
 * Recursively validates a complex tensor (scalar, vector, matrix, or higher-rank
 * rectangular nested array of complex numbers) and returns its shape.
 *
 * @param {unknown} value
 * @param {string} label
 * @param {Set<unknown>} ancestors
 * @returns {number[]} Shape array (`[]` for scalar, `[n]` for vector, `[m, n]` for matrix, etc.).
 * @throws {TypeError} If the input contains invalid types, sparse entries, mixed nesting depths, or circular references.
 * @throws {RangeError} If the input contains non-finite complex components or jagged dimensions.
 */
function inspectTensor(value, label, ancestors) {
	if (!Array.isArray(value)) {
		validateComplex(value, label)
		return []
	}

	if (ancestors.has(value)) {
		throw new TypeError(`${label} contains a circular array reference`)
	}

	if (value.length === 0) {
		return [0]
	}

	ancestors.add(value)
	try {
		if (!(0 in value)) {
			throw new TypeError(`${label}[0] is a sparse array hole; expected a complex value or sub-tensor`)
		}
		const firstIsArray = Array.isArray(value[0])
		const subShape = inspectTensor(value[0], `${label}[0]`, ancestors)

		for (let i = 1; i < value.length; i++) {
			if (!(i in value)) {
				throw new TypeError(`${label}[${i}] is a sparse array hole; expected a complex value or sub-tensor`)
			}
			const elemIsArray = Array.isArray(value[i])
			if (elemIsArray !== firstIsArray) {
				throw new TypeError(`${label}[${i}] mixes scalar and array elements at the same tensor rank`)
			}
			const elemShape = inspectTensor(value[i], `${label}[${i}]`, ancestors)
			if (elemShape.length !== subShape.length) {
				throw new TypeError(`${label}[${i}] has inconsistent tensor nesting depth (${elemShape.length} vs ${subShape.length})`)
			}
			for (let d = 0; d < subShape.length; d++) {
				if (elemShape[d] !== subShape[d]) {
					throw new RangeError(
						`${label}[${i}] is jagged at sub-axis ${d} (expected length ${subShape[d]}, got ${elemShape[d]})`
					)
				}
			}
		}

		return [value.length, ...subShape]
	} finally {
		ancestors.delete(value)
	}
}

/**
 * Multiplies two complex numbers and returns a normalized `{ re, im }` object.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 * @throws {RangeError} If multiplication overflows finite IEEE-754 numbers.
 */
function complexMul(a, b) {
	const re = a.re * b.re - a.im * b.im
	const im = a.re * b.im + a.im * b.re
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex multiplication overflowed finite numeric range')
	}
	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	}
}

/**
 * Recursively prepends singleton outer axes to align a lower-rank tensor
 * with `targetRank` (matching generalized Kronecker product semantics).
 *
 * @param {ComplexTensor} tensor
 * @param {number} currentRank
 * @param {number} targetRank
 * @returns {ComplexTensor}
 */
function promoteRank(tensor, currentRank, targetRank) {
	if (currentRank === targetRank) {
		return tensor
	}
	return [promoteRank(tensor, currentRank, targetRank - 1)]
}

/**
 * Divide-and-conquer helper that populates a contiguous slice of `out` for
 * the Kronecker product along the current axis by recursively bisecting `a`
 * and then `b`.
 *
 * @param {ComplexTensor[]} a
 * @param {ComplexTensor[]} b
 * @param {number} rank Current tensor rank (>= 1).
 * @param {number} aStart Inclusive start index in `a`.
 * @param {number} aEnd Exclusive end index in `a`.
 * @param {number} bStart Inclusive start index in `b`.
 * @param {number} bEnd Exclusive end index in `b`.
 * @param {ComplexTensor[]} out Pre-allocated output array for this axis.
 * @param {number} outOffset Starting write index in `out`.
 */
function fillKronAxis(a, b, rank, aStart, aEnd, bStart, bEnd, out, outOffset) {
	const aLen = aEnd - aStart
	const bLen = bEnd - bStart

	if (aLen > 1) {
		const aMid = aStart + Math.floor(aLen / 2)
		const leftCount = (aMid - aStart) * bLen
		fillKronAxis(a, b, rank, aStart, aMid, bStart, bEnd, out, outOffset)
		fillKronAxis(a, b, rank, aMid, aEnd, bStart, bEnd, out, outOffset + leftCount)
		return
	}

	if (bLen > 1) {
		const bMid = bStart + Math.floor(bLen / 2)
		fillKronAxis(a, b, rank, aStart, aEnd, bStart, bMid, out, outOffset)
		fillKronAxis(a, b, rank, aStart, aEnd, bMid, bEnd, out, outOffset + (bMid - bStart))
		return
	}

	out[outOffset] = kronRecursive(a[aStart], b[bStart], rank - 1)
}

/**
 * Recursively computes the Kronecker / tensor product of two complex tensors
 * of equal `rank`.
 *
 * @param {ComplexTensor} a
 * @param {ComplexTensor} b
 * @param {number} rank Non-negative integer rank shared by `a` and `b`.
 * @returns {ComplexTensor}
 */
function kronRecursive(a, b, rank) {
	if (rank === 0) {
		return complexMul(/** @type {Complex} */ (a), /** @type {Complex} */ (b))
	}

	const arrA = /** @type {ComplexTensor[]} */ (a)
	const arrB = /** @type {ComplexTensor[]} */ (b)

	if (arrA.length === 0 || arrB.length === 0) {
		return []
	}

	const out = new Array(arrA.length * arrB.length)
	fillKronAxis(arrA, arrB, rank, 0, arrA.length, 0, arrB.length, out, 0)
	return out
}

/**
 * Computes the Kronecker / tensor product `a ⊗ b` over complex numbers
 * represented as `{ re, im }`, using a recursive divide-and-conquer algorithm.
 *
 * Supports:
 * - Complex scalars (rank 0): returns complex product `a * b`.
 * - Complex vectors (rank 1): returns vector of length `a.length * b.length`.
 * - Complex matrices (rank 2): returns `(m * p) × (n * q)` block Kronecker matrix.
 * - Higher-rank complex tensors (rank `k`): returns rank-`k` tensor of shape
 *   `[d_0 * e_0, ..., d_{k-1} * e_{k-1}]`.
 * - Mixed ranks (e.g. scalar × matrix, vector × matrix): aligns the lower-rank
 *   operand by prepending singleton outer dimensions (matching generalized
 *   Kronecker product semantics such as NumPy's `kron`).
 *
 * Algorithm:
 * 1. Validates both inputs as finite complex scalars or rectangular nested arrays.
 * 2. Promotes the lower-rank tensor recursively so both operands share rank `k`.
 * 3. Recursively divides along each axis by bisecting the left operand slice and
 *    then the right operand slice into halves down to single-element sub-tensors,
 *    recursing across ranks down to the rank-0 complex scalar multiplication base case.
 *
 * Time complexity: `O(N)` where `N` is the total number of scalar elements in the output.
 * Recursion stack depth: `O(sum_d (log(m_d) + log(n_d)))`.
 *
 * @param {ComplexTensor} a Left complex scalar, vector, matrix, or tensor.
 * @param {ComplexTensor} b Right complex scalar, vector, matrix, or tensor.
 * @returns {ComplexTensor} New complex scalar or tensor representing `a ⊗ b` (with `-0` normalized to `0`).
 * @throws {TypeError} If either operand is not a valid complex scalar/tensor, contains sparse holes,
 *   mixes ranks at the same level, or contains circular references.
 * @throws {RangeError} If any complex component is non-finite, an array is jagged, or multiplication overflows.
 */
export function tensorProductComplexRecursive(a, b) {
	const shapeA = inspectTensor(a, 'a', new Set())
	const shapeB = inspectTensor(b, 'b', new Set())

	const rankA = shapeA.length
	const rankB = shapeB.length
	const targetRank = Math.max(rankA, rankB)

	if (targetRank === 0) {
		return complexMul(/** @type {Complex} */ (a), /** @type {Complex} */ (b))
	}

	const alignedA = promoteRank(a, rankA, targetRank)
	const alignedB = promoteRank(b, rankB, targetRank)

	return kronRecursive(alignedA, alignedB, targetRank)
}
