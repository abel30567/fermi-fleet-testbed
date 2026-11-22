/**
 * Fixed-point scaling factor (10^18) used for non-integer cube root results.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

/**
 * Internal guard factor (10^6, even) providing 6 extra decimal digits of precision
 * so half-ULP rounding to the nearest scaled BigInt is mathematically exact.
 * @type {bigint}
 */
const GUARD = 10n ** 6n;
const HALF_GUARD = GUARD / 2n;

/**
 * Bit length lookup table for a single hexadecimal nibble (0x0..0xf).
 */
const NIBBLE_BIT_LENGTH = [0, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4];

/**
 * Computes the exact binary bit length of a non-negative BigInt.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {number} Number of bits required to represent `n` (0 for `0n`).
 */
function bitLength(n) {
	if (n === 0n) return 0;
	const hex = n.toString(16);
	const leadNibble = parseInt(hex[0], 16);
	return (hex.length - 1) * 4 + NIBBLE_BIT_LENGTH[leadNibble];
}

/**
 * Adjusts a candidate integer cube root so that it equals the exact floor cube root:
 * `x^3 <= n < (x + 1)^3`.
 *
 * After the divide-and-conquer Newton step, the candidate is proven to satisfy
 * `floor(cbrt(n)) <= x <= floor(cbrt(n)) + 2`, so this recurses at most twice.
 *
 * @param {bigint} n - Non-negative radicand.
 * @param {bigint} x - Candidate integer root.
 * @returns {bigint} Exact floor integer cube root of `n`.
 */
function adjustFloorCbrt(n, x) {
	if (x * x * x > n) {
		return adjustFloorCbrt(n, x - 1n);
	}
	const next = x + 1n;
	if (next * next * next <= n) {
		return adjustFloorCbrt(n, next);
	}
	return x;
}

/**
 * Computes the exact integer floor cube root `floor(cbrt(n))` of a non-negative BigInt
 * using a divide-and-conquer bit-splitting (Karatsuba/Zimmermann-style) recursion.
 *
 * Algorithm:
 * - For `n < 64n`, returns the exact base-case root (`0n..3n`).
 * - Otherwise, let `k = floor((bitLength(n) - 1) / 3) + 1` be the bit length of the root,
 *   and split at `m = floor((k - 1) / 2)` output bits (shifting `n` right by `3 * m` bits).
 * - Recursively compute `rHi = integerCbrtRecursive(n >> (3n * BigInt(m)))`, which halves
 *   the problem bit length each call (`O(log log n)` recursion depth).
 * - Lift `x0 = rHi << BigInt(m)` and perform a single exact Newton-Raphson refinement step
 *   `x1 = (2n * x0 + n / (x0 * x0)) / 3n`. Because `0 <= cbrt(n) - x0 < 2^m` and
 *   `x0 >= 2^(k - 1) >= 2^(2m)`, quadratic convergence guarantees `r <= x1 <= r + 2`,
 *   which `adjustFloorCbrt` resolves to the exact floor root in at most 2 steps.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {bigint} Exact integer `floor(cbrt(n))`.
 */
function integerCbrtRecursive(n) {
	if (n === 0n) return 0n;
	if (n < 8n) return 1n;
	if (n < 27n) return 2n;
	if (n < 64n) return 3n;

	const bits = bitLength(n);
	const rootBits = Math.floor((bits - 1) / 3) + 1;
	const shift = BigInt(Math.floor((rootBits - 1) / 2));

	const rHi = integerCbrtRecursive(n >> (3n * shift));
	const x0 = rHi << shift;
	const x1 = (2n * x0 + n / (x0 * x0)) / 3n;

	return adjustFloorCbrt(n, x1);
}

/**
 * Computes the real cube root of an exact BigInt integer `n`, returned as a fixed-point
 * BigInt scaled by `scale` (default `SCALE = 10n ** 18n`), rounded to the nearest integer.
 *
 * Algorithm:
 * - Uses odd symmetry `cbrt(-n) = -cbrt(n)` to handle negative inputs over the full BigInt domain.
 * - Scales the radicand by `(scale * GUARD)^3` with an even internal guard factor (`GUARD = 10^6`)
 *   and computes the exact integer floor cube root via the divide-and-conquer recursive
 *   bit-splitting Newton algorithm (`O(log log |n|)` recursion depth).
 * - Because `GUARD` is even and `(q + 1/2)^3 = (2q + 1)^3 / 8` is never an integer, rounding via
 *   `guardRem >= GUARD / 2n` produces the mathematically exact closest scaled BigInt (< 0.5 ULP).
 *
 * @param {bigint} n - Exact BigInt integer radicand (negative, zero, or positive).
 * @param {bigint} [scale=SCALE] - Positive BigInt fixed-point scaling factor (defaults to `10n ** 18n`).
 * @returns {bigint} Fixed-point BigInt representing `round(cbrt(n) * scale)`.
 * @throws {TypeError} If `n` or `scale` is not a BigInt.
 * @throws {RangeError} If `scale <= 0n`.
 */
export function cbrtBigIntRecursive(n, scale = SCALE) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected n to be a BigInt, received ${typeof n}`);
	}
	if (typeof scale !== 'bigint') {
		throw new TypeError(`Expected scale to be a BigInt, received ${typeof scale}`);
	}
	if (scale <= 0n) {
		throw new RangeError('Expected scale to be a positive BigInt');
	}

	if (n === 0n) {
		return 0n;
	}

	const negative = n < 0n;
	const absN = negative ? -n : n;

	const guardedScale = scale * GUARD;
	const guardedTarget = absN * guardedScale * guardedScale * guardedScale;
	const guardedRoot = integerCbrtRecursive(guardedTarget);

	const quotient = guardedRoot / GUARD;
	const remainder = guardedRoot % GUARD;
	const rounded = remainder >= HALF_GUARD ? quotient + 1n : quotient;

	return negative ? -rounded : rounded;
}
