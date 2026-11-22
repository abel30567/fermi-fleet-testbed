/**
 * Computes the exact Euclidean modulo (`dividend mod modulus`) over arbitrary-precision
 * BigInt integers using a recursive binary-doubling (divide-and-conquer) reduction.
 *
 * Unlike JavaScript's built-in `%` remainder operator (which uses truncated division and
 * preserves the sign of the dividend), Euclidean modulo always returns the unique remainder
 * `r` satisfying:
 *
 *   `dividend = q * modulus + r`  with  `0n <= r < |modulus|`
 *
 * Core reduction uses pure recursive binary doubling (`d -> 2d`) with O(log(|dividend| / |modulus|))
 * recursion depth, without relying on `%` or `/` operators.
 *
 * @param {bigint} dividend - The integer dividend.
 * @param {bigint} modulus - The non-zero integer modulus.
 * @returns {bigint} The exact Euclidean remainder in `[0n, |modulus|)`.
 * @throws {TypeError} If `dividend` or `modulus` is not a `bigint`.
 * @throws {RangeError} If `modulus` is `0n`.
 */
export function moduloBigIntRecursive(dividend, modulus) {
	if (typeof dividend !== 'bigint') {
		throw new TypeError(`Expected dividend to be a bigint, received ${typeof dividend}`)
	}
	if (typeof modulus !== 'bigint') {
		throw new TypeError(`Expected modulus to be a bigint, received ${typeof modulus}`)
	}
	if (modulus === 0n) {
		throw new RangeError('Modulus cannot be zero')
	}

	const absModulus = modulus < 0n ? -modulus : modulus

	if (dividend === 0n) {
		return 0n
	}

	if (dividend > 0n) {
		return reduceNonNegative(dividend, absModulus)
	}

	const absRemainder = reduceNonNegative(-dividend, absModulus)
	return absRemainder === 0n ? 0n : absModulus - absRemainder
}

/**
 * Recursively reduces a non-negative BigInt `n` modulo a positive BigInt `d`
 * using binary doubling (`d << 1n`) in O(log(n / d)) stack depth.
 *
 * Invariant: `n >= 0n` and `d > 0n`.
 * Returns `r` such that `0n <= r < d` and `r ≡ n (mod d)`.
 *
 * @param {bigint} n - Non-negative dividend.
 * @param {bigint} d - Positive divisor.
 * @returns {bigint} Remainder in `[0n, d)`.
 */
function reduceNonNegative(n, d) {
	if (n < d) {
		return n
	}

	const doubled = d << 1n
	const remainder = n >= doubled ? reduceNonNegative(n, doubled) : n
	return remainder >= d ? remainder - d : remainder
}
