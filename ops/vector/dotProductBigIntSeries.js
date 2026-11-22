/**
 * Computes the exact dot product of two equal-length BigInt vectors
 * using the finite bilinear series:
 *
 *   a · b = Σ_{i=0}^{n-1} a[i] * b[i]
 *
 * All intermediate products and the accumulated sum are computed in exact
 * arbitrary-precision BigInt arithmetic with zero precision loss.
 *
 * @param {readonly bigint[]} a - First vector of BigInt elements.
 * @param {readonly bigint[]} b - Second vector of BigInt elements.
 * @returns {bigint} Exact BigInt dot product of `a` and `b` (`0n` for empty vectors).
 * @throws {TypeError} If either argument is not an array or contains a non-BigInt element.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function dotProductBigIntSeries(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) {
		throw new TypeError('Both inputs must be arrays of BigInt values.')
	}

	const n = a.length
	if (n !== b.length) {
		throw new RangeError(
			`Input vectors must have equal length (received ${n} and ${b.length}).`
		)
	}

	let sum = 0n
	for (let i = 0; i < n; i++) {
		const ai = a[i]
		const bi = b[i]
		if (typeof ai !== 'bigint') {
			throw new TypeError(
				`Element at index ${i} of first vector must be a BigInt (received ${typeof ai}).`
			)
		}
		if (typeof bi !== 'bigint') {
			throw new TypeError(
				`Element at index ${i} of second vector must be a BigInt (received ${typeof bi}).`
			)
		}
		sum += ai * bi
	}

	return sum
}
