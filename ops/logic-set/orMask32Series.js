/**
 * Computes the element-wise bitwise OR (logic-set union) of two 32-bit unsigned
 * bitmask word arrays using the closed-form inclusion-exclusion identity derived
 * from the 32-bit binary series expansion.
 *
 * For each 32-bit unsigned word pair `(x, y)` with bit decomposition
 * `x = sum_{k=0}^{31} x_k * 2^k` and `y = sum_{k=0}^{31} y_k * 2^k`, the
 * per-bit inclusive disjunction satisfies `x_k OR y_k = x_k + y_k - x_k * y_k`.
 * Summing across all 32 bit positions yields the closed-form identity:
 *
 *   x | y = sum_{k=0}^{31} (x_k + y_k - x_k * y_k) * 2^k
 *         = x + y - (x & y)
 *
 * Because `x, y in [0, 2^32 - 1]`, `x + y <= 2^33 - 2` is represented exactly
 * in IEEE-754 double precision (`<= Number.MAX_SAFE_INTEGER`), and subtracting
 * the unsigned intersection `(x & y) >>> 0` yields the exact uint32 union in
 * `[0, 2^32 - 1]`.
 *
 * Inputs are never mutated; a new `Uint32Array` of the same length is returned.
 *
 * @param {Uint32Array} a - First bitmask word array.
 * @param {Uint32Array} b - Second bitmask word array (must match `a.length`).
 * @returns {Uint32Array} New `Uint32Array` containing the bitwise OR of `a` and `b`.
 * @throws {TypeError} If either `a` or `b` is not a `Uint32Array`.
 * @throws {RangeError} If `a` and `b` have different lengths.
 */
export function orMask32Series(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('Expected first argument "a" to be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Expected second argument "b" to be a Uint32Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Bitmask length mismatch: a.length (${a.length}) !== b.length (${b.length})`,
		)
	}

	const len = a.length
	const out = new Uint32Array(len)

	for (let i = 0; i < len; i++) {
		const x = a[i]
		const y = b[i]
		// Closed-form sum of the inclusion-exclusion series: sum_k (x_k + y_k - x_k*y_k) * 2^k
		const intersection = (x & y) >>> 0
		out[i] = (x + y - intersection) >>> 0
	}

	return out
}
