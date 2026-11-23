/**
 * Fixed-point scale factor (10^18) used for non-integer BigInt square root results.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

const SCALE_SQUARED = SCALE * SCALE;

/**
 * Computes the square root of a non-negative BigInt integer using a
 * straightforward iterative Newton-Raphson (Heron's) method, returning a
 * fixed-point BigInt scaled by 10^18 (truncated toward zero).
 *
 * Specifically, for any non-negative BigInt `n`, the returned value `r`
 * is the unique non-negative BigInt satisfying:
 *   `r^2 <= n * 10^36 < (r + 1)^2`
 *
 * @param {bigint} n - Non-negative BigInt integer whose square root to compute.
 * @returns {bigint} Fixed-point BigInt representation of `floor(sqrt(n) * 10^18)`.
 * @throws {TypeError} If `n` is not a BigInt.
 * @throws {RangeError} If `n` is negative.
 */
export function sqrtBigIntIterative(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected n to be a BigInt, received ${typeof n}`);
	}
	if (n < 0n) {
		throw new RangeError('Cannot compute square root of a negative BigInt');
	}
	if (n === 0n) {
		return 0n;
	}

	const scaledTarget = n * SCALE_SQUARED;

	// Initial upper-bound estimate: 2^ceil(bitLength / 2) > sqrt(scaledTarget).
	// Starting above the root guarantees monotonic convergence via integer Newton's method.
	const bitLength = BigInt(scaledTarget.toString(2).length);
	let x = 1n << ((bitLength + 1n) >> 1n);

	while (true) {
		const next = (x + scaledTarget / x) >> 1n;
		if (next >= x) {
			return x;
		}
		x = next;
	}
}
