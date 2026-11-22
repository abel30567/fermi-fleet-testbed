/**
 * @fileoverview Trigonometric tangent (`tan`) over IEEE-754 float64 Numbers
 * using a recursive divide-and-conquer double-angle algorithm with high-precision
 * range reduction.
 */

// 3-part Cody-Waite decomposition of pi/2 with 24-bit leading chunks so that
// k * PIO2_HI and k * PIO2_MID are exact in IEEE-754 float64 for |k| <= 2^26.
const PIO2_HI = 1.570796251296997
const PIO2_MID = 7.549789415861596e-8
const PIO2_LO = 5.390302858158119e-15
const INV_PIO2_FLOAT = 2 / Math.PI

// Threshold below which Cody-Waite fast-path reduction is used (unless the
// reduced remainder falls very close to a pole at k * pi/2).
const FAST_REDUCE_LIMIT = 1048576 // 2^20
const NEAR_POLE_THRESHOLD = 9.5367431640625e-7 // 2^-20

// Recursive divide-and-conquer base-case threshold (2^-7 = 0.0078125).
// For |x| <= 2^-7, the degree-9 Maclaurin polynomial for tan(x) has truncation
// error < 1.5e-24 << float64 machine epsilon * |x|.
const RECURSION_BASE_THRESHOLD = 0.0078125

// Maclaurin series coefficients for tan(x) = x + c3*x^3 + c5*x^5 + c7*x^7 + c9*x^9
const TAN_C3 = 1 / 3
const TAN_C5 = 2 / 15
const TAN_C7 = 17 / 315
const TAN_C9 = 62 / 2835

// High-precision constants for Payne-Hanek BigInt range reduction (lazily built).
const BIG_PREC_BITS = 1280n
const BIG_REM_BITS = 192n
const BIG_PIO2_BITS = 128n
const BIG_PROD_SHIFT = BIG_REM_BITS + BIG_PIO2_BITS // 320n

const floatBuf = new ArrayBuffer(8)
const floatView = new DataView(floatBuf)

let cachedBigConstants = null

/**
 * Computes `floor(arctan(1 / invN) * 2^bits)` using BigInt integer arithmetic.
 *
 * @param {bigint} invN - Positive integer denominator (> 1).
 * @param {bigint} bits - Number of fractional binary digits.
 * @returns {bigint} Scaled arctan value.
 */
function arctanInvBigInt(invN, bits) {
	const one = 1n << bits
	const nn = invN * invN
	let term = one / invN
	let sum = term
	let k = 1n
	while (term !== 0n) {
		term = term / nn
		const delta = term / (2n * k + 1n)
		if (delta === 0n) break
		sum = (k & 1n) === 1n ? sum - delta : sum + delta
		k += 1n
	}
	return sum
}

/**
 * Lazily computes `floor((2/pi) * 2^1280)` and `floor((pi/2) * 2^128)` via
 * Machin's formula: pi/4 = 4*arctan(1/5) - arctan(1/239).
 *
 * @returns {{ invPio2: bigint, pio2Scaled: bigint }}
 */
function getBigReductionConstants() {
	if (cachedBigConstants !== null) {
		return cachedBigConstants
	}
	const guard = 64n
	const workBits = BIG_PREC_BITS + guard
	const piOver4 = 4n * arctanInvBigInt(5n, workBits) - arctanInvBigInt(239n, workBits)
	const pio2Work = piOver4 << 1n
	const invPio2 = ((1n << (workBits + BIG_PREC_BITS)) / pio2Work)
	const pio2Scaled = pio2Work >> (workBits - BIG_PIO2_BITS)
	cachedBigConstants = { invPio2, pio2Scaled }
	return cachedBigConstants
}

/**
 * Converts a signed BigInt representing `value * 2^scaleBits` to the nearest
 * IEEE-754 float64 Number (round-to-nearest-even).
 *
 * @param {bigint} scaled - Signed fixed-point value.
 * @param {number} scaleBits - Number of fractional bits in `scaled`.
 * @returns {number} Rounded float64 Number.
 */
function bigIntFixedToFloat64(scaled, scaleBits) {
	if (scaled === 0n) return 0
	const neg = scaled < 0n
	const absVal = neg ? -scaled : scaled
	const bitLen = absVal.toString(2).length

	let mantissa
	let expShift
	if (bitLen <= 53) {
		mantissa = Number(absVal)
		expShift = -scaleBits
	} else {
		const drop = BigInt(bitLen - 53)
		let top = absVal >> drop
		const rem = absVal & ((1n << drop) - 1n)
		const half = 1n << (drop - 1n)
		if (rem > half || (rem === half && (top & 1n) === 1n)) {
			top += 1n
		}
		mantissa = Number(top)
		expShift = bitLen - 53 - scaleBits
	}

	const result = mantissa * Math.pow(2, expShift)
	return neg ? -result : result
}

/**
 * Performs exact Payne-Hanek range reduction modulo pi/2 for any finite non-zero
 * IEEE-754 float64 number `x`, returning `{ r, isOddQuadrant }` such that
 * `x = k * (pi/2) + r` with `r` in `[-pi/4, pi/4]` and `isOddQuadrant = (k & 1) === 1`.
 *
 * @param {number} x - Finite non-zero IEEE-754 float64 angle in radians.
 * @returns {{ r: number, isOddQuadrant: boolean }}
 */
function reduceModPiOver2Exact(x) {
	const { invPio2, pio2Scaled } = getBigReductionConstants()
	const neg = x < 0
	const absX = neg ? -x : x

	floatView.setFloat64(0, absX, false)
	const bits = floatView.getBigUint64(0, false)
	const rawExp = Number((bits >> 52n) & 0x7ffn)
	const rawFrac = bits & 0xfffffffffffffn

	let mantissa
	let exp
	if (rawExp === 0) {
		// Subnormal number: value = rawFrac * 2^-1074
		mantissa = rawFrac
		exp = -1074
	} else {
		// Normal number: value = (2^52 + rawFrac) * 2^(rawExp - 1023 - 52)
		mantissa = (1n << 52n) | rawFrac
		exp = rawExp - 1075
	}

	// |x| * (2/pi) * 2^F = mantissa * invPio2, where F = 1280 - exp >= 309
	const fracBits = BIG_PREC_BITS - BigInt(exp)
	const prod = mantissa * invPio2
	const mask = (1n << fracBits) - 1n

	let q = prod >> fracBits
	let rem = prod & mask
	const half = 1n << (fracBits - 1n)

	if (rem >= half) {
		q += 1n
		rem -= 1n << fracBits
	}

	// Retain 192 fractional bits of rem (enough even when |rem| ~ 2^-61 near a pole)
	const remShift = fracBits - BIG_REM_BITS
	const rem192 = rem >= 0n ? rem >> remShift : -((-rem) >> remShift)
	const rScaled = rem192 * pio2Scaled

	let r = bigIntFixedToFloat64(rScaled, Number(BIG_PROD_SHIFT))
	if (neg) {
		r = -r
	}
	return { r, isOddQuadrant: (q & 1n) === 1n }
}

/**
 * Reduces a finite angle `x` into `[-pi/4, pi/4]` modulo `pi/2`.
 * Uses a fast 3-part Cody-Waite reduction for moderate angles away from poles,
 * and falls back to exact Payne-Hanek BigInt reduction for large or near-pole angles.
 *
 * @param {number} x - Finite non-zero angle in radians.
 * @returns {{ r: number, isOddQuadrant: boolean }}
 */
function reduceModPiOver2(x) {
	const absX = x < 0 ? -x : x
	if (absX <= Math.PI / 4) {
		return { r: x, isOddQuadrant: false }
	}
	if (absX <= FAST_REDUCE_LIMIT) {
		const k = Math.round(x * INV_PIO2_FLOAT)
		const r = ((x - k * PIO2_HI) - k * PIO2_MID) - k * PIO2_LO
		if ((r < 0 ? -r : r) >= NEAR_POLE_THRESHOLD) {
			return { r, isOddQuadrant: (k & 1) !== 0 }
		}
	}
	return reduceModPiOver2Exact(x)
}

/**
 * Computes `tan(x)` for `|x| <= pi/4` using a recursive divide-and-conquer
 * double-angle algorithm:
 *
 *   tan(x) = 2 * tan(x / 2) / (1 - tan(x / 2)^2)
 *
 * Halving `x` in binary floating point is exact (exponent decrement) and for
 * `|x| <= pi/4`, every intermediate `t = tan(x / 2)` satisfies `|t| <= sqrt(2) - 1`,
 * keeping `1 - t^2 >= 0.8284` free of catastrophic cancellation.
 *
 * @param {number} x - Reduced angle in `[-pi/4, pi/4]`.
 * @returns {number} Tangent of `x`.
 */
function tanDivideAndConquer(x) {
	const absX = x < 0 ? -x : x
	if (absX <= RECURSION_BASE_THRESHOLD) {
		if (x === 0) {
			return x
		}
		const x2 = x * x
		// Horner evaluation of x + c3*x^3 + c5*x^5 + c7*x^7 + c9*x^9
		return x + x * x2 * (TAN_C3 + x2 * (TAN_C5 + x2 * (TAN_C7 + x2 * TAN_C9)))
	}

	const halfTan = tanDivideAndConquer(x * 0.5)
	return (2 * halfTan) / (1 - halfTan * halfTan)
}

/**
 * Computes the trigonometric tangent of an angle `x` (in radians) over IEEE-754
 * float64 Numbers using range reduction modulo `pi/2` and a recursive
 * divide-and-conquer double-angle identity (`tan(x) = 2*tan(x/2) / (1 - tan(x/2)^2)`).
 *
 * Special IEEE-754 float64 behavior:
 * - `tanFloatRecursive(NaN)` returns `NaN`.
 * - `tanFloatRecursive(±Infinity)` returns `NaN`.
 * - `tanFloatRecursive(+0)` returns `+0` and `tanFloatRecursive(-0)` returns `-0`.
 *
 * @param {number} x - Angle in radians (must be an IEEE-754 `number`).
 * @returns {number} The tangent of `x` as an IEEE-754 float64 Number.
 * @throws {TypeError} If `x` is not of type `'number'`.
 */
export function tanFloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`tanFloatRecursive expected a number, got ${x === null ? 'null' : typeof x}`)
	}

	if (Number.isNaN(x) || !Number.isFinite(x)) {
		return Number.NaN
	}

	if (x === 0) {
		return x
	}

	const { r, isOddQuadrant } = reduceModPiOver2(x)
	const tanR = tanDivideAndConquer(r)

	return isOddQuadrant ? -1 / tanR : tanR
}
