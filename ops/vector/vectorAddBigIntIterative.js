/**
 * Computes the element-wise sum of two equal-length vectors of exact BigInt values
 * using a straightforward iterative loop.
 *
 * Because BigInt arithmetic is arbitrary-precision and exact, this operation works
 * identically for raw integers and fixed-point BigInt values scaled by a common
 * factor such as `10n ** 18n` (addition preserves scaling without precision loss).
 *
 * Neither input array is mutated; a newly allocated array of BigInts is returned.
 *
 * Time complexity: O(n), where n is the length of the input vectors.
 * Space complexity: O(n) for the output vector.
 *
 * @param {readonly bigint[]} a - First input vector of BigInt elements.
 * @param {readonly bigint[]} b - Second input vector of BigInt elements (must match `a.length`).
 * @returns {bigint[]} A new array `c` of length `a.length` where `c[i] = a[i] + b[i]`.
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element is not a `bigint`.
 * @throws {RangeError} If `a.length !== b.length`.
 *
 * @example
 * vectorAddBigIntIterative([1n, 2n, 3n], [4n, 5n, 6n]);
 * // => [5n, 7n, 9n]
 *
 * @example
 * const SCALE = 10n ** 18n;
 * vectorAddBigIntIterative([15n * 10n ** 17n, -2n * SCALE], [5n * 10n ** 17n, 3n * SCALE]);
 * // => [2000000000000000000n, 1000000000000000000n]
 */
export function vectorAddBigIntIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an Array of BigInts')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an Array of BigInts')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector lengths must match: received ${a.length} and ${b.length}`,
		)
	}

	const n = a.length
	const result = new Array(n)

	for (let i = 0; i < n; i++) {
		const ai = a[i]
		const bi = b[i]
		if (typeof ai !== 'bigint') {
			throw new TypeError(
				`Element a[${i}] must be a bigint, received ${typeof ai}`,
			)
		}
		if (typeof bi !== 'bigint') {
			throw new TypeError(
				`Element b[${i}] must be a bigint, received ${typeof bi}`,
			)
		}
		result[i] = ai + bi
	}

	return result
}
