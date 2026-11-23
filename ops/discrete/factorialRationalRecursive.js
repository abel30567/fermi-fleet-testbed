/**
 * Exact rational arithmetic helpers (lowest terms, positive denominator).
 */

/**
 * Returns the absolute value of a BigInt.
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x;
}

/**
 * Computes the non-negative greatest common divisor of two BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a);
	let y = absBigInt(b);
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

/**
 * Normalizes a rational number { num, den } into lowest terms with den > 0n.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError('Rational num and den must be BigInt values');
	}
	if (den === 0n) {
		throw new RangeError('Rational denominator cannot be zero');
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	const sign = den < 0n ? -1n : 1n;
	const signedNum = num * sign;
	const positiveDen = den * sign;
	const g = gcdBigInt(signedNum, positiveDen);
	return {
		num: signedNum / g,
		den: positiveDen / g,
	};
}

/**
 * Multiplies two normalized exact rationals and returns the normalized product.
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n };
	}
	const g1 = gcdBigInt(a.num, b.den);
	const g2 = gcdBigInt(b.num, a.den);
	const num = (a.num / g1) * (b.num / g2);
	const den = (a.den / g2) * (b.den / g1);
	return normalizeRational(num, den);
}

/**
 * Validates and converts input into a non-negative BigInt integer.
 * Accepts a non-negative safe integer number, a non-negative BigInt, or
 * an exact rational `{ num: bigint, den: bigint }` equal to a non-negative integer.
 * @param {number | bigint | { num: bigint, den: bigint }} input
 * @returns {bigint}
 */
function parseNonNegativeInteger(input) {
	if (typeof input === 'number') {
		if (!Number.isSafeInteger(input) || input < 0) {
			throw new RangeError('Input must be a non-negative safe integer');
		}
		return BigInt(input);
	}
	if (typeof input === 'bigint') {
		if (input < 0n) {
			throw new RangeError('Input must be a non-negative integer');
		}
		return input;
	}
	if (
		input !== null &&
		typeof input === 'object' &&
		!Array.isArray(input) &&
		'num' in input &&
		'den' in input
	) {
		const rational = normalizeRational(input.num, input.den);
		if (rational.den !== 1n || rational.num < 0n) {
			throw new RangeError('Rational input must represent a non-negative integer');
		}
		return rational.num;
	}
	throw new TypeError(
		'Input must be a non-negative integer (number, BigInt, or { num: BigInt, den: BigInt })',
	);
}

/**
 * Computes the product of exact rationals (lo/1) * ((lo+1)/1) * ... * (hi/1)
 * using recursive divide-and-conquer binary splitting.
 * @param {bigint} lo
 * @param {bigint} hi
 * @returns {{ num: bigint, den: bigint }}
 */
function productRangeRational(lo, hi) {
	if (lo > hi) {
		return { num: 1n, den: 1n };
	}
	if (lo === hi) {
		return normalizeRational(lo, 1n);
	}
	if (hi - lo === 1n) {
		return mulRational(normalizeRational(lo, 1n), normalizeRational(hi, 1n));
	}
	const mid = lo + ((hi - lo) >> 1n);
	const left = productRangeRational(lo, mid);
	const right = productRangeRational(mid + 1n, hi);
	return mulRational(left, right);
}

/**
 * Computes the discrete factorial n! over exact rationals using a recursive
 * divide-and-conquer (binary splitting) implementation.
 *
 * Returns a normalized exact rational `{ num: BigInt, den: BigInt }` in lowest
 * terms with `den > 0n`.
 *
 * @param {number | bigint | { num: bigint, den: bigint }} n - Non-negative integer (as a safe number, BigInt, or exact rational representing a non-negative integer).
 * @returns {{ num: bigint, den: bigint }} Normalized exact rational `{ num, den }` equal to n! / 1.
 * @throws {TypeError} If `n` is not a number, BigInt, or rational object with BigInt `num` and `den`.
 * @throws {RangeError} If `n` is negative, non-integer, non-finite, unsafe, or has a zero denominator.
 */
export function factorialRationalRecursive(n) {
	const value = parseNonNegativeInteger(n);
	if (value <= 1n) {
		return { num: 1n, den: 1n };
	}
	return productRangeRational(2n, value);
}
