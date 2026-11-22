/**
 * Validates that the given value is a 3-element array containing only BigInt values.
 *
 * @param {unknown} vec - The candidate vector to validate.
 * @param {string} name - Parameter name used in error messages.
 * @throws {TypeError} If `vec` is not an Array or any element is not a `bigint`.
 * @throws {RangeError} If `vec` does not have length 3.
 */
function validateVector3BigInt(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an Array of 3 BigInt values`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, got ${vec.length}`)
	}
	for (let i = 0; i < 3; i++) {
		if (typeof vec[i] !== 'bigint') {
			throw new TypeError(
				`${name}[${i}] must be a bigint, got ${typeof vec[i]}`,
			)
		}
	}
}

/**
 * Computes the exact 3D vector cross product `a × b` over arbitrary-precision
 * `BigInt` integers using a straightforward iterative cyclic-index algorithm.
 *
 * For `a = [a0, a1, a2]` and `b = [b0, b1, b2]`, each output component `i ∈ {0, 1, 2}`
 * is computed iteratively from the cyclic triple `(i, (i + 1) % 3, (i + 2) % 3)`:
 *
 *     result[i] = a[(i + 1) % 3] * b[(i + 2) % 3] - a[(i + 2) % 3] * b[(i + 1) % 3]
 *
 * All operations use exact `BigInt` arithmetic, avoiding floating-point rounding
 * or 64-bit integer overflow regardless of input magnitude.
 *
 * Time complexity: O(1) arithmetic operations (3 iterations of 2 multiplications and 1 subtraction;
 * bit-level complexity depends on the bit length of the `BigInt` operands).
 * Space complexity: O(1) additional array slots (a newly allocated 3-element `Array<bigint>`).
 *
 * @param {[bigint, bigint, bigint]} a - First 3D vector of `BigInt` coordinates.
 * @param {[bigint, bigint, bigint]} b - Second 3D vector of `BigInt` coordinates.
 * @returns {[bigint, bigint, bigint]} The exact cross product vector `a × b`.
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element is not a `bigint`.
 * @throws {RangeError} If `a` or `b` does not have length 3.
 *
 * @example
 * crossProductBigIntIterative([1n, 0n, 0n], [0n, 1n, 0n])
 * // => [0n, 0n, 1n]
 *
 * @example
 * crossProductBigIntIterative([1n, 2n, 3n], [4n, 5n, 6n])
 * // => [-3n, 6n, -3n]
 */
export function crossProductBigIntIterative(a, b) {
	validateVector3BigInt(a, 'a')
	validateVector3BigInt(b, 'b')

	const result = new Array(3)
	for (let i = 0; i < 3; i++) {
		const j = (i + 1) % 3
		const k = (i + 2) % 3
		result[i] = a[j] * b[k] - a[k] * b[j]
	}

	return result
}
