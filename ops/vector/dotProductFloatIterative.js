/**
 * Computes the dot product (inner product) of two numeric vectors over
 * IEEE-754 float64 numbers using a straightforward iterative loop.
 *
 * For vectors `a` and `b` of length `n`, returns:
 * `sum_{i=0}^{n-1} a[i] * b[i]`.
 *
 * For empty vectors (`n === 0`), returns `0`.
 * IEEE-754 special values (`NaN`, `Infinity`, `-Infinity`) follow standard
 * JavaScript floating-point arithmetic semantics.
 *
 * @param {number[]} a - First input vector of IEEE-754 float64 numbers.
 * @param {number[]} b - Second input vector of IEEE-754 float64 numbers.
 * @returns {number} The scalar dot product of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element is not a `number`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 *
 * @example
 * dotProductFloatIterative([1, 2, 3], [4, 5, 6]);
 * // => 32
 *
 * @example
 * dotProductFloatIterative([1, 0], [0, 1]);
 * // => 0
 */
export function dotProductFloatIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array of numbers.')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array of numbers.')
	}

	const len = a.length
	if (len !== b.length) {
		throw new RangeError(
			`Vectors must have the same length (received ${len} and ${b.length}).`
		)
	}

	let sum = 0
	for (let i = 0; i < len; i++) {
		const ai = a[i]
		if (typeof ai !== 'number') {
			throw new TypeError(
				`Element a[${i}] must be a number (received ${typeof ai}).`
			)
		}

		const bi = b[i]
		if (typeof bi !== 'number') {
			throw new TypeError(
				`Element b[${i}] must be a number (received ${typeof bi}).`
			)
		}

		sum += ai * bi
	}

	return sum
}
