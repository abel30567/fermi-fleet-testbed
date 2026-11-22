/**
 * Computes the exact discrete linear convolution of two BigInt sequences using
 * a straightforward iterative O(M * N) algorithm.
 *
 * For input sequences `a` of length M and `b` of length N, the resulting
 * sequence `c` has length `M + N - 1` (or `0` when either input is empty),
 * where each element is defined as:
 *
 *   c[k] = sum_{i + j = k} a[i] * b[j]   for 0 <= k < M + N - 1
 *
 * Because discrete linear convolution of integers is closed over the integers,
 * every output element is an exact `BigInt` with arbitrary precision and no
 * rounding or fixed-point loss.
 *
 * @param {readonly bigint[]} a - First sequence of BigInt values.
 * @param {readonly bigint[]} b - Second sequence of BigInt values.
 * @returns {bigint[]} Exact discrete linear convolution of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element is not a `bigint`.
 */
export function convolutionBigIntIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an Array of BigInt values')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an Array of BigInt values')
	}

	const lenA = a.length
	const lenB = b.length

	for (let i = 0; i < lenA; i++) {
		if (typeof a[i] !== 'bigint') {
			throw new TypeError(`Element a[${i}] must be a BigInt, received ${typeof a[i]}`)
		}
	}

	for (let j = 0; j < lenB; j++) {
		if (typeof b[j] !== 'bigint') {
			throw new TypeError(`Element b[${j}] must be a BigInt, received ${typeof b[j]}`)
		}
	}

	if (lenA === 0 || lenB === 0) {
		return []
	}

	const result = new Array(lenA + lenB - 1).fill(0n)

	for (let i = 0; i < lenA; i++) {
		const ai = a[i]
		if (ai === 0n) continue
		for (let j = 0; j < lenB; j++) {
			result[i + j] += ai * b[j]
		}
	}

	return result
}
