/**
 * Computes the exact bitwise XOR (symmetric difference) of two non-negative
 * arbitrary-width BigInt bitsets, with optional unsigned width masking.
 *
 * All operations stay strictly in arbitrary-precision BigInt arithmetic
 * (avoiding IEEE-754 floating-point coercion and 32-bit signed truncation).
 * When `width` is provided, the result is masked to the low `width` bits
 * without allocating oversized bitmasks when the result already fits.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @param {number} [width] - Optional non-negative safe integer bit width to mask the output to `[0, 2^width)`.
 * @returns {bigint} Non-negative BigInt bitset representing `a XOR b` (masked to `width` bits if specified).
 * @throws {TypeError} If `a` or `b` is not a BigInt, or if `width` is provided and is not a number.
 * @throws {RangeError} If `a` or `b` is negative, or if `width` is not a non-negative safe integer.
 */
export function xorBitsetStable(a, b, width) {
	if (typeof a !== 'bigint') {
		throw new TypeError('First bitset "a" must be a BigInt');
	}
	if (typeof b !== 'bigint') {
		throw new TypeError('Second bitset "b" must be a BigInt');
	}
	if (a < 0n) {
		throw new RangeError('First bitset "a" must be a non-negative BigInt');
	}
	if (b < 0n) {
		throw new RangeError('Second bitset "b" must be a non-negative BigInt');
	}

	if (width !== undefined) {
		if (typeof width !== 'number') {
			throw new TypeError('Optional "width" must be a number');
		}
		if (!Number.isSafeInteger(width) || width < 0) {
			throw new RangeError('Optional "width" must be a non-negative safe integer');
		}
	}

	const raw = a ^ b;

	if (width === undefined) {
		return raw;
	}
	if (width === 0 || raw === 0n) {
		return 0n;
	}

	// Fast path: if `raw` already has no bits at or above `width`, return it directly.
	// This avoids allocating a `2^width` mask and stays safe even for huge `width`.
	if (raw >> BigInt(width) === 0n) {
		return raw;
	}

	return BigInt.asUintN(width, raw);
}
