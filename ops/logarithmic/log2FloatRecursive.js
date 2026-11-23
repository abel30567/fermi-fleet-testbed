/**
 * @module ops/logarithmic/log2FloatRecursive
 * Recursive / divide-and-conquer IEEE-754 float64 base-2 logarithm.
 */

const SQRT2 = 1.4142135623730951;
const POW2_512 = 2 ** 512;
const POW2_NEG_512 = 2 ** -512;
const DEKKER_SPLIT = 134217729; // 2^27 + 1
const SIGNIFICAND_BITS = 58;

/**
 * Error-free addition (Knuth TwoSum): returns [s, e] such that a + b = s + e exactly.
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoSum(a, b) {
	const s = a + b;
	const v = s - a;
	return [s, (a - (s - v)) + (b - v)];
}

/**
 * Error-free squaring (Dekker TwoSqr): returns [p, e] such that a * a = p + e exactly.
 *
 * @param {number} a
 * @returns {[number, number]}
 */
function twoSqr(a) {
	const p = a * a;
	const c = DEKKER_SPLIT * a;
	const ahi = c - (c - a);
	const alo = a - ahi;
	return [p, ((ahi * ahi - p) + 2 * ahi * alo) + alo * alo];
}

/**
 * Computes (1 + u)^2 - 1 = 2u + u^2 in double-double precision where u = hi + lo.
 *
 * @param {number} hi
 * @param {number} lo
 * @returns {[number, number]}
 */
function squareOffsetDD(hi, lo) {
	const [sqHi, sqLo] = twoSqr(hi);
	const [sHi, sLo] = twoSum(2 * hi, sqHi);
	return twoSum(sHi, sLo + sqLo + 2 * lo + 2 * hi * lo);
}

/**
 * Divide-and-conquer range reduction for x >= 2 into [1, 2) by binary powers of two.
 *
 * @param {number} x
 * @param {number} step Power-of-two exponent step (512, 256, ..., 1).
 * @returns {[number, number]} Tuple [mantissa, exponent] with x = mantissa * 2^exponent.
 */
function reduceAboveTwo(x, step) {
	if (step < 1) {
		return [x, 0];
	}
	const factor = 2 ** step;
	if (x >= factor) {
		const [mantissa, exp] = reduceAboveTwo(x / factor, step * 0.5);
		return [mantissa, exp + step];
	}
	return reduceAboveTwo(x, step * 0.5);
}

/**
 * Divide-and-conquer range reduction for 0 < x < 1 into [1, 2) by binary powers of two.
 * Handles IEEE-754 subnormals down to Number.MIN_VALUE (2^-1074) without precision loss.
 *
 * @param {number} x
 * @param {number} step Power-of-two exponent step (512, 256, ..., 1).
 * @returns {[number, number]} Tuple [mantissa, exponent] with x = mantissa * 2^exponent.
 */
function reduceBelowOne(x, step) {
	if (x < POW2_NEG_512) {
		const [mantissa, exp] = reduceBelowOne(x * POW2_512, step);
		return [mantissa, exp - 512];
	}
	if (step < 1) {
		return [x, 0];
	}
	const factor = 2 ** step;
	if (x * factor < 2) {
		const [mantissa, exp] = reduceBelowOne(x * factor, step * 0.5);
		return [mantissa, exp - step];
	}
	return reduceBelowOne(x, step * 0.5);
}

/**
 * Recursively computes log2(1 + u) for u = hi + lo in [0, 1) using repeated squaring:
 *   log2(m) = (1/2) * log2(m^2)
 * When m^2 >= 2 (i.e. v = m^2 - 1 >= 1), emits +weight and recurses on (v - 1) / 2.
 *
 * @param {number} hi High part of offset u = m - 1.
 * @param {number} lo Low part of offset u = m - 1.
 * @param {number} weight Current fractional bit weight (2^-k).
 * @param {number} bitsLeft Remaining significand bits after first set bit, or -1 before.
 * @returns {number}
 */
function log2FracPositive(hi, lo, weight, bitsLeft) {
	if ((hi === 0 && lo === 0) || bitsLeft === 0 || weight === 0) {
		return 0;
	}
	const [vHi, vLo] = squareOffsetDD(hi, lo);
	if (vHi > 1 || (vHi === 1 && vLo >= 0)) {
		const [nHi, nLo] = twoSum(vHi - 1, vLo);
		const nextBits = bitsLeft < 0 ? SIGNIFICAND_BITS : bitsLeft - 1;
		return weight + log2FracPositive(nHi * 0.5, nLo * 0.5, weight * 0.5, nextBits);
	}
	const nextBits = bitsLeft < 0 ? -1 : bitsLeft - 1;
	return log2FracPositive(vHi, vLo, weight * 0.5, nextBits);
}

/**
 * Recursively computes log2(1 + u) for u = hi + lo in [-0.5, 0) using repeated squaring:
 *   log2(m) = (1/2) * log2(m^2)
 * When m^2 <= 1/2 (i.e. v = m^2 - 1 <= -0.5), emits -weight and recurses on 2v + 1.
 *
 * @param {number} hi High part of offset u = m - 1.
 * @param {number} lo Low part of offset u = m - 1.
 * @param {number} weight Current fractional bit weight (2^-k).
 * @param {number} bitsLeft Remaining significand bits after first set bit, or -1 before.
 * @returns {number}
 */
function log2FracNegative(hi, lo, weight, bitsLeft) {
	if ((hi === 0 && lo === 0) || bitsLeft === 0 || weight === 0) {
		return 0;
	}
	const [vHi, vLo] = squareOffsetDD(hi, lo);
	if (vHi < -0.5 || (vHi === -0.5 && vLo <= 0)) {
		const [nHi, nLo] = twoSum(2 * vHi + 1, 2 * vLo);
		const nextBits = bitsLeft < 0 ? SIGNIFICAND_BITS : bitsLeft - 1;
		return -weight + log2FracNegative(nHi, nLo, weight * 0.5, nextBits);
	}
	const nextBits = bitsLeft < 0 ? -1 : bitsLeft - 1;
	return log2FracNegative(vHi, vLo, weight * 0.5, nextBits);
}

/**
 * Computes the base-2 logarithm of an IEEE-754 float64 number using a recursive
 * divide-and-conquer algorithm:
 * 1. Binary-exponent divide-and-conquer range reduction to [1/sqrt(2), sqrt(2)].
 * 2. Recursive repeated-squaring fractional bit extraction over the offset u = m - 1
 *    in double-double arithmetic to preserve full float64 precision (including near 1).
 *
 * Follows IEEE-754 / ECMAScript special-value semantics:
 * - NaN or x < 0 -> NaN
 * - +0 or -0 -> -Infinity
 * - +Infinity -> +Infinity
 * - 1 -> +0
 *
 * @param {number} x Input IEEE-754 float64 number.
 * @returns {number} Base-2 logarithm of x.
 * @throws {TypeError} If x is not of type 'number'.
 */
export function log2FloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, received ${typeof x}`);
	}
	if (Number.isNaN(x) || x < 0) {
		return Number.NaN;
	}
	if (x === 0) {
		return -Infinity;
	}
	if (x === Infinity) {
		return Infinity;
	}
	if (x === 1) {
		return 0;
	}

	let mantissa;
	let exponent;
	if (x >= 2) {
		[mantissa, exponent] = reduceAboveTwo(x, 512);
	} else if (x < 1) {
		[mantissa, exponent] = reduceBelowOne(x, 512);
	} else {
		mantissa = x;
		exponent = 0;
	}

	// Center mantissa into (1/sqrt(2), sqrt(2)] so exponent + frac never cancels near 1.
	if (mantissa > SQRT2) {
		mantissa *= 0.5;
		exponent += 1;
	}

	const u = mantissa - 1;
	const frac = u >= 0
		? log2FracPositive(u, 0, 0.5, -1)
		: log2FracNegative(u, 0, 0.5, -1);

	return exponent + frac;
}
