/**
 * Default fixed-point scaling factor (10^18) for exact BigInt division results.
 * @type {bigint}
 */
export const FIXED_POINT_SCALE = 10n ** 18n;

/**
 * Computes the bit length of a non-negative BigInt.
 *
 * @param {bigint} value - Non-negative integer.
 * @returns {number} Number of bits required to represent `value` (0 for 0n).
 */
function bitLength(value) {
	if (value === 0n) {
		return 0;
	}
	const hex = value.toString(16);
	const leadingBits = 32 - Math.clz32(parseInt(hex[0], 16));
	return (hex.length - 1) * 4 + leadingBits;
}

/**
 * Recursive divide-and-conquer Euclidean division for non-negative BigInts.
 * Splits the dividend around half the bit-length excess over the divisor,
 * solves the high half recursively, recombines the remainder with the low half,
 * and solves the lower subproblem recursively.
 *
 * @param {bigint} n - Non-negative dividend.
 * @param {bigint} d - Positive divisor.
 * @param {bigint} d2 - Precomputed 2 * d.
 * @param {bigint} d3 - Precomputed 3 * d.
 * @param {bigint} d4 - Precomputed 4 * d.
 * @param {number} dBits - Precomputed bit length of d.
 * @returns {{ quotient: bigint, remainder: bigint }} Exact quotient and remainder.
 */
function divModRecursive(n, d, d2, d3, d4, dBits) {
	if (n < d) {
		return { quotient: 0n, remainder: n };
	}
	if (n < d2) {
		return { quotient: 1n, remainder: n - d };
	}
	if (n < d3) {
		return { quotient: 2n, remainder: n - d2 };
	}
	if (n < d4) {
		return { quotient: 3n, remainder: n - d3 };
	}

	const excessBits = bitLength(n) - dBits;
	const shift = BigInt(excessBits >> 1);
	const lowMask = (1n << shift) - 1n;

	const highPart = n >> shift;
	const lowPart = n & lowMask;

	const highResult = divModRecursive(highPart, d, d2, d3, d4, dBits);
	const combinedRemainder = (highResult.remainder << shift) | lowPart;
	const lowResult = divModRecursive(combinedRemainder, d, d2, d3, d4, dBits);

	return {
		quotient: (highResult.quotient << shift) | lowResult.quotient,
		remainder: lowResult.remainder,
	};
}

/**
 * Divides two exact BigInt integers using a recursive divide-and-conquer
 * algorithm, returning a fixed-point BigInt scaled by `scale` (default 10^18)
 * truncated toward zero.
 *
 * Formally, returns `trunc((a * scale) / b)`.
 *
 * @param {bigint} a - Dividend (exact BigInt).
 * @param {bigint} b - Non-zero divisor (exact BigInt).
 * @param {bigint} [scale=1000000000000000000n] - Positive fixed-point scale factor (default 10^18).
 * @returns {bigint} Fixed-point quotient scaled by `scale`, truncated toward zero.
 * @throws {TypeError} If `a`, `b`, or `scale` is not a BigInt.
 * @throws {RangeError} If `b` is 0n or `scale` is not positive.
 */
export function divideBigIntRecursive(a, b, scale = FIXED_POINT_SCALE) {
	if (typeof a !== 'bigint') {
		throw new TypeError('Expected dividend "a" to be a BigInt');
	}
	if (typeof b !== 'bigint') {
		throw new TypeError('Expected divisor "b" to be a BigInt');
	}
	if (typeof scale !== 'bigint') {
		throw new TypeError('Expected "scale" to be a BigInt');
	}
	if (b === 0n) {
		throw new RangeError('Division by zero');
	}
	if (scale <= 0n) {
		throw new RangeError('Expected "scale" to be a positive BigInt');
	}

	if (a === 0n) {
		return 0n;
	}

	const isNegative = (a < 0n) !== (b < 0n);
	const absA = a < 0n ? -a : a;
	const absB = b < 0n ? -b : b;

	const scaledDividend = absA * scale;
	const d2 = absB << 1n;
	const d3 = d2 + absB;
	const d4 = absB << 2n;
	const dBits = bitLength(absB);

	const { quotient } = divModRecursive(scaledDividend, absB, d2, d3, d4, dBits);
	return isNegative && quotient !== 0n ? -quotient : quotient;
}
