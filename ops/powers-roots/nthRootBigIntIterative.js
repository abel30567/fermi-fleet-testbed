const SCALE_DIGITS = 18n;
const SCALE = 10n ** SCALE_DIGITS;

/**
 * Computes the principal real `n`-th root of an exact BigInt integer `x`,
 * returned as a fixed-point BigInt scaled by `10^18` (truncated toward zero),
 * using an iterative Newton-Raphson method over exact BigInt arithmetic.
 *
 * Specifically, for `x >= 0n`, the returned value `r` satisfies:
 * `r^n <= x * (10^18)^n < (r + 1)^n`.
 * For `x < 0n` and odd `n`, the result is `-nthRootBigIntIterative(-x, n)`.
 *
 * @param {bigint} x - The radicand (exact BigInt integer).
 * @param {bigint} n - The root degree (positive BigInt integer, `n >= 1n`).
 * @returns {bigint} Fixed-point BigInt approximation of `x^(1/n)` scaled by `10^18`,
 *   truncated toward zero.
 * @throws {TypeError} If `x` or `n` is not a BigInt.
 * @throws {RangeError} If `n <= 0n`, or if `x < 0n` and `n` is even.
 */
export function nthRootBigIntIterative(x, n) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected radicand x to be a BigInt, received ${typeof x}`);
	}
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected degree n to be a BigInt, received ${typeof n}`);
	}
	if (n <= 0n) {
		throw new RangeError(`Expected degree n to be a positive BigInt (>= 1n), received ${n}`);
	}

	const isNegative = x < 0n;
	if (isNegative && n % 2n === 0n) {
		throw new RangeError(`Cannot compute even root (n=${n}) of negative BigInt (${x})`);
	}

	if (x === 0n) {
		return 0n;
	}
	if (n === 1n) {
		return x * SCALE;
	}

	const absX = isNegative ? -x : x;
	if (absX === 1n) {
		return isNegative ? -SCALE : SCALE;
	}

	// Scale radicand by (10^18)^n so that floor((absX * SCALE^n)^(1/n)) = floor(absX^(1/n) * 10^18).
	const scaledRadicand = absX * 10n ** (SCALE_DIGITS * n);
	const root = integerNthRoot(scaledRadicand, n);

	return isNegative ? -root : root;
}

/**
 * Computes `floor(value^(1/n))` for `value >= 1n` and `n >= 2n` via iterative
 * integer Newton-Raphson starting from a power-of-two upper bound.
 *
 * Because the starting estimate satisfies `cur >= floor(value^(1/n))`, integer
 * Newton updates decrease monotonically and never undershoot `floor(value^(1/n))`,
 * terminating with the exact integer root once `next >= cur`.
 *
 * @param {bigint} value - Positive BigInt radicand (`>= 1n`).
 * @param {bigint} n - Root degree (`>= 2n`).
 * @returns {bigint} Exact `floor(value^(1/n))`.
 */
function integerNthRoot(value, n) {
	const bitLength = BigInt(value.toString(2).length);
	const initialShift = (bitLength + n - 1n) / n;
	let cur = 1n << initialShift;
	const nMinus1 = n - 1n;

	while (true) {
		const next = (nMinus1 * cur + value / cur ** nMinus1) / n;
		if (next >= cur) {
			return cur;
		}
		cur = next;
	}
}
