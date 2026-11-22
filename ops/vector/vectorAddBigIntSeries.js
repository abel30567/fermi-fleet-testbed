/**
 * Computes the exact component-wise sum of two equal-length BigInt vectors
 * using the closed-form vector addition identity `(a + b)_i = a_i + b_i` over ℤⁿ.
 *
 * Because exact integer addition is linear, this also performs exact addition
 * for fixed-point BigInt vectors scaled by a common factor (such as 10^18).
 * Neither input array is mutated; a new array of BigInt values is returned.
 *
 * @param {readonly bigint[]} a - First BigInt vector.
 * @param {readonly bigint[]} b - Second BigInt vector (must match length of `a`).
 * @returns {bigint[]} A new array containing exact component-wise sums `a[i] + b[i]`.
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element is not a `bigint`.
 * @throws {RangeError} If `a` and `b` have different lengths.
 */
export function vectorAddBigIntSeries(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument must be an array of BigInt values')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument must be an array of BigInt values')
	}

	const n = a.length
	if (n !== b.length) {
		throw new RangeError(
			`Vectors must have equal length (received ${n} and ${b.length})`
		)
	}

	const result = new Array(n)
	for (let i = 0; i < n; i++) {
		const ai = a[i]
		const bi = b[i]
		if (typeof ai !== 'bigint') {
			throw new TypeError(
				`Element at index ${i} of first vector must be a bigint`
			)
		}
		if (typeof bi !== 'bigint') {
			throw new TypeError(
				`Element at index ${i} of second vector must be a bigint`
			)
		}
		result[i] = ai + bi
	}

	return result
}
