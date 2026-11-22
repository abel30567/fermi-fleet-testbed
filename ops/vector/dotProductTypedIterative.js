/**
 * Computes the Euclidean dot product (inner product) of two vectors stored as
 * {@link Float64Array} instances using a straightforward iterative loop:
 *
 *   dot(a, b) = sum_{i = 0}^{n - 1} a[i] * b[i]
 *
 * Algorithm:
 * Validates that both inputs are {@link Float64Array} instances of equal length,
 * then iterates sequentially from index `0` to `a.length - 1`, verifying that each
 * element is finite and accumulating `a[i] * b[i]` into a scalar sum. For empty
 * vectors (`length === 0`), returns `0`.
 *
 * Time complexity: O(n)
 * Space complexity: O(1)
 *
 * @param {Float64Array} a - First input vector of finite 64-bit floats.
 * @param {Float64Array} b - Second input vector of finite 64-bit floats (same length as `a`).
 * @returns {number} The scalar dot product of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a {@link Float64Array}.
 * @throws {RangeError} If `a` and `b` have different lengths, or if any element is `NaN`, `Infinity`, or `-Infinity`.
 */
export function dotProductTypedIterative(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument "a" must be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument "b" must be a Float64Array')
	}

	const len = a.length
	if (len !== b.length) {
		throw new RangeError(`Vector length mismatch: a.length (${len}) !== b.length (${b.length})`)
	}

	let sum = 0
	for (let i = 0; i < len; i += 1) {
		const ai = a[i]
		const bi = b[i]
		if (!Number.isFinite(ai)) {
			throw new RangeError(`Element a[${i}] must be finite, received ${ai}`)
		}
		if (!Number.isFinite(bi)) {
			throw new RangeError(`Element b[${i}] must be finite, received ${bi}`)
		}
		sum += ai * bi
	}

	return sum
}
