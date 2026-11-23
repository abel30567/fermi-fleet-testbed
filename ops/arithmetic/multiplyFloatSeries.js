/**
 * IEEE-754 binary64 (float64) multiplication implemented via a finite
 * radix-2^18 Cauchy product series and the quarter-square (polarization)
 * algebraic identity:
 *
 *   x * y = ((x + y)^2 - (x - y)^2) / 4
 *
 * Each finite non-zero float64 operand is decomposed into its IEEE-754 sign,
 * unbiased exponent, and normalized 53-bit integer significand M in [2^52, 2^53).
 * Each significand is represented as a 3-term radix-2^18 series:
 *
 *   M = d0 + d1 * 2^18 + d2 * 2^36,   0 <= di < 2^18
 *
 * Because every limb is strictly less than 2^18, (di + dj)^2 < 2^38 < 2^53,
 * making every quarter-square evaluation and Cauchy convolution coefficient
 * exact in IEEE-754 float64 without overflow, underflow, or cancellation.
 * The exact 106-bit significand product is then rounded with IEEE-754
 * round-to-nearest-even semantics (handling normals, subnormals, signed zeros,
 * infinities, and NaN identically to IEEE-754 binary64 multiplication).
 */

const f64View = new Float64Array(1);
const u64View = new BigUint64Array(f64View.buffer);

const SIGN_SHIFT = 63n;
const EXP_SHIFT = 52n;
const EXP_MASK = 0x7ffn;
const FRAC_MASK = (1n << 52n) - 1n;
const IMPLICIT_BIT = 1n << 52n;
const CARRY_BIT = 1n << 53n;
const LIMB_MASK = (1n << 18n) - 1n;
const HIGH_PRODUCT_BIT = 1n << 105n;
const EXP_BIAS = 1023;
const MAX_BIASED_EXP = 2047;

/**
 * Computes the exact integer product of two non-negative integers x, y < 2^18
 * using the quarter-square (polarization) identity.
 *
 * @param {number} x - First 18-bit limb (0 <= x < 2^18).
 * @param {number} y - Second 18-bit limb (0 <= y < 2^18).
 * @returns {number} Exact integer product x * y.
 */
function quarterSquareProduct(x, y) {
	const sum = x + y;
	const diff = x - y;
	return (sum ** 2 - diff ** 2) / 4;
}

/**
 * Unpacks an IEEE-754 float64 into its raw bit fields.
 *
 * @param {number} value - A JavaScript number (IEEE-754 float64).
 * @returns {{ sign: number, biasedExp: number, frac: bigint }} Raw fields.
 */
function unpackFloat64(value) {
	f64View[0] = value;
	const bits = u64View[0];
	return {
		sign: Number(bits >> SIGN_SHIFT),
		biasedExp: Number((bits >> EXP_SHIFT) & EXP_MASK),
		frac: bits & FRAC_MASK,
	};
}

/**
 * Packs IEEE-754 sign, biased exponent, and 52-bit fraction into a float64.
 *
 * @param {number} sign - Sign bit (0 or 1).
 * @param {number} biasedExp - Biased 11-bit exponent (0..2047).
 * @param {bigint} frac - 52-bit fraction field.
 * @returns {number} Reconstructed IEEE-754 float64 number.
 */
function packFloat64(sign, biasedExp, frac) {
	u64View[0] =
		(BigInt(sign) << SIGN_SHIFT) |
		(BigInt(biasedExp) << EXP_SHIFT) |
		(frac & FRAC_MASK);
	return f64View[0];
}

/**
 * Normalizes a non-zero finite float64's significand to [2^52, 2^53) and
 * returns its integer significand and base-2 exponent such that
 * |value| = sig * 2^exp.
 *
 * @param {number} biasedExp - Raw biased exponent (0..2046).
 * @param {bigint} frac - Raw 52-bit fraction.
 * @returns {{ sig: bigint, exp: number }} Normalized significand and exponent.
 */
function normalizeFinite(biasedExp, frac) {
	if (biasedExp !== 0) {
		return {
			sig: IMPLICIT_BIT | frac,
			exp: biasedExp - EXP_BIAS - 52,
		};
	}

	let sig = frac;
	let exp = 1 - EXP_BIAS - 52; // -1074
	while (sig < IMPLICIT_BIT) {
		sig <<= 1n;
		exp -= 1;
	}
	return { sig, exp };
}

/**
 * Rounds a positive integer right-shifted by `shift` bits (>= 1) using
 * IEEE-754 round-to-nearest, ties-to-even.
 *
 * @param {bigint} value - Non-negative integer to shift and round.
 * @param {number} shift - Number of low bits to shift out (shift >= 1).
 * @returns {bigint} Rounded quotient.
 */
function shiftRightRoundToNearestEven(value, shift) {
	const shiftBig = BigInt(shift);
	const quotient = value >> shiftBig;
	const mask = (1n << shiftBig) - 1n;
	const remainder = value & mask;
	const halfway = 1n << (shiftBig - 1n);

	if (remainder > halfway || (remainder === halfway && (quotient & 1n) === 1n)) {
		return quotient + 1n;
	}
	return quotient;
}

/**
 * Multiplies two IEEE-754 float64 Numbers using a finite radix-2^18 Cauchy
 * product series whose elementary terms are evaluated via the quarter-square
 * (polarization) algebraic identity.
 *
 * @param {number} a - First IEEE-754 float64 operand.
 * @param {number} b - Second IEEE-754 float64 operand.
 * @returns {number} The IEEE-754 float64 product of `a` and `b`.
 * @throws {TypeError} If either operand is not a JavaScript `number` primitive.
 */
export function multiplyFloatSeries(a, b) {
	if (typeof a !== "number") {
		throw new TypeError(
			`multiplyFloatSeries: expected first argument to be a number, received ${a === null ? "null" : typeof a}`,
		);
	}
	if (typeof b !== "number") {
		throw new TypeError(
			`multiplyFloatSeries: expected second argument to be a number, received ${b === null ? "null" : typeof b}`,
		);
	}

	const ua = unpackFloat64(a);
	const ub = unpackFloat64(b);
	const sign = ua.sign ^ ub.sign;

	const aIsNaN = ua.biasedExp === MAX_BIASED_EXP && ua.frac !== 0n;
	const bIsNaN = ub.biasedExp === MAX_BIASED_EXP && ub.frac !== 0n;
	if (aIsNaN || bIsNaN) {
		return Number.NaN;
	}

	const aIsInf = ua.biasedExp === MAX_BIASED_EXP;
	const bIsInf = ub.biasedExp === MAX_BIASED_EXP;
	const aIsZero = ua.biasedExp === 0 && ua.frac === 0n;
	const bIsZero = ub.biasedExp === 0 && ub.frac === 0n;

	if (aIsInf || bIsInf) {
		if (aIsZero || bIsZero) {
			return Number.NaN;
		}
		return sign ? -Infinity : Infinity;
	}

	if (aIsZero || bIsZero) {
		return sign ? -0 : 0;
	}

	const na = normalizeFinite(ua.biasedExp, ua.frac);
	const nb = normalizeFinite(ub.biasedExp, ub.frac);

	// Represent each 53-bit significand as a 3-term radix-2^18 series.
	const a0 = Number(na.sig & LIMB_MASK);
	const a1 = Number((na.sig >> 18n) & LIMB_MASK);
	const a2 = Number(na.sig >> 36n);

	const b0 = Number(nb.sig & LIMB_MASK);
	const b1 = Number((nb.sig >> 18n) & LIMB_MASK);
	const b2 = Number(nb.sig >> 36n);

	// Cauchy product coefficients using the quarter-square identity.
	const c0 = quarterSquareProduct(a0, b0);
	const c1 = quarterSquareProduct(a0, b1) + quarterSquareProduct(a1, b0);
	const c2 =
		quarterSquareProduct(a0, b2) +
		quarterSquareProduct(a1, b1) +
		quarterSquareProduct(a2, b0);
	const c3 = quarterSquareProduct(a1, b2) + quarterSquareProduct(a2, b1);
	const c4 = quarterSquareProduct(a2, b2);

	const product =
		BigInt(c0) +
		(BigInt(c1) << 18n) +
		(BigInt(c2) << 36n) +
		(BigInt(c3) << 54n) +
		(BigInt(c4) << 72n);

	const msb = product >= HIGH_PRODUCT_BIT ? 105 : 104;
	let biasedExp = na.exp + nb.exp + msb + EXP_BIAS;

	if (biasedExp >= MAX_BIASED_EXP) {
		return sign ? -Infinity : Infinity;
	}

	if (biasedExp >= 1) {
		const shift = msb - 52;
		let roundedSig = shiftRightRoundToNearestEven(product, shift);
		if (roundedSig === CARRY_BIT) {
			roundedSig >>= 1n;
			biasedExp += 1;
			if (biasedExp >= MAX_BIASED_EXP) {
				return sign ? -Infinity : Infinity;
			}
		}
		return packFloat64(sign, biasedExp, roundedSig);
	}

	// Subnormal or underflow region (biasedExp <= 0).
	const shift = msb - 52 + (1 - biasedExp);
	if (shift > msb + 1) {
		return sign ? -0 : 0;
	}

	const roundedSig = shiftRightRoundToNearestEven(product, shift);
	if (roundedSig === 0n) {
		return sign ? -0 : 0;
	}
	if (roundedSig === IMPLICIT_BIT) {
		return packFloat64(sign, 1, 0n);
	}
	return packFloat64(sign, 0, roundedSig);
}
