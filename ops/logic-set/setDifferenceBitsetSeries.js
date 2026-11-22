/**
 * Computes the set difference `A \ B` over arbitrary-width non-negative BigInt bitsets.
 *
 * Each bitset `X >= 0n` encodes a finite subset of the natural numbers `N = {0, 1, 2, ...}`
 * via its binary characteristic series:
 *
 *   X = sum_{k >= 0} x_k * 2^k,   where x_k in {0, 1} indicates membership of k in X.
 *
 * Algorithm (Closed-Form Characteristic-Function Series Identity):
 * The indicator of `k in (A \ B)` is `a_k * (1 - b_k) = a_k - a_k * b_k`.
 * Summing the weighted power series term-by-term over all `k >= 0` yields the exact
 * closed-form identity:
 *
 *   A \ B = sum_{k >= 0} a_k * (1 - b_k) * 2^k
 *         = sum_{k >= 0} a_k * 2^k - sum_{k >= 0} (a_k * b_k) * 2^k
 *         = A - (A & B)
 *
 * Because `a_k * b_k <= a_k` at every bit position `k`, the subtraction `A - (A & B)`
 * produces zero borrows across all bit positions and evaluates the infinite characteristic
 * series exactly for bitsets of arbitrary width without bitwise inversion.
 *
 * @param {bigint} a - Non-negative BigInt bitset representing the minuend set `A`.
 * @param {bigint} b - Non-negative BigInt bitset representing the subtrahend set `B`.
 * @returns {bigint} Non-negative BigInt bitset representing `A \ B`.
 * @throws {TypeError} If `a` or `b` is not a `bigint`.
 * @throws {RangeError} If `a` or `b` is negative (`< 0n`).
 */
export function setDifferenceBitsetSeries(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected parameter "a" to be a bigint, got ${typeof a}`);
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected parameter "b" to be a bigint, got ${typeof b}`);
	}
	if (a < 0n) {
		throw new RangeError('Expected parameter "a" to be a non-negative bigint bitset (>= 0n)');
	}
	if (b < 0n) {
		throw new RangeError('Expected parameter "b" to be a non-negative bigint bitset (>= 0n)');
	}

	if (a === 0n || b === 0n) {
		return a;
	}

	return a - (a & b);
}
