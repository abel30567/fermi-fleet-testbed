/**
 * Computes the trigonometric sine of an IEEE-754 float64 angle (in radians)
 * using a recursive divide-and-conquer angle-halving algorithm.
 *
 * After reducing the angle modulo pi/2 to the principal interval [-pi/4, pi/4],
 * the core recursion evaluates both sin(u) and versin(u) = 1 - cos(u) by
 * repeatedly halving the angle:
 *
 *   sin(u)    = 2 * sin(u / 2) * (1 - versin(u / 2))
 *   versin(u) = 2 * sin(u / 2)^2
 *
 * Because halving by 0.5 is exact in IEEE-754 binary floating point and
 * versin avoids catastrophic cancellation near cos(0) = 1, the recursion
 * maintains full float64 precision across the entire finite domain.
 *
 * @module ops/trigonometric/sinFloatRecursive
 */

const PI_OVER_4 = Math.PI / 4
const TWO_OVER_PI = 2 / Math.PI

// Base-case threshold for recursive angle halving: for |u| <= 2^-14,
// u^4 / 120 < 1.2e-19 << Number.EPSILON, so two-term base approximations
// are exact to within < 1e-3 ULP.
const BASE_THRESHOLD = 2 ** -14

// 3-part Cody-Waite splitting of pi/2 (each high part has 33 significant bits,
// ensuring exact products k * PIO2_1 and k * PIO2_2 for |k| < 2^20).
const PIO2_1 = 1.57079632673412561417e0
const PIO2_2 = 6.0771005063039659766e-11
const PIO2_3 = 2.02226624879595063154e-21
const CODY_WAITE_LIMIT = 2 ** 19

// Exact 1200-bit fixed-point value of floor((2 / pi) * 2^1200) and
// 128-bit fixed-point value of floor((pi / 2) * 2^128) for Payne-Hanek
// range reduction of large float64 inputs (|x| >= 2^19).
const TWO_OVER_PI_1200 = BigInt(
	'0xa2f9836e4e441529fc2757d1f534ddc0db6295993c439041fe5163abdebbc561' +
		'b7246e3a424dd2e006492eea09d1921cfe1deb1cb129a73ee88235f52ebb4484' +
		'e99c7026b45f7e413991d639835339f49c845f8bbdf9283b1ff897ffde05980f' +
		'ef2f118b5a0a6d1f6d367ecf27cb09b74f463f669e5fea2d7527bac7ebe5f17b' +
		'3d0739f78a5292ea6bfb5fb11f8d5d0856033046fc7b'
)
const PI_OVER_2_128 = 0x1921fb54442d18469898cc51701b839a2n
const FRAC_BITS = 128n
const ONE_128 = 1n << FRAC_BITS
const HALF_128 = 1n << (FRAC_BITS - 1n)
const QUAD_MASK = (1n << (FRAC_BITS + 2n)) - 1n
const FOUR_128 = 4n << FRAC_BITS

const FLOAT_BUF = new ArrayBuffer(8)
const FLOAT_VIEW = new Float64Array(FLOAT_BUF)
const UINT64_VIEW = new BigUint64Array(FLOAT_BUF)

/**
 * Converts a signed 256-bit fixed-point BigInt (value * 2^256) to the nearest
 * IEEE-754 float64 number using round-to-nearest-even.
 *
 * @param {bigint} val
 * @returns {number}
 */
function fixed256ToFloat64(val) {
	if (val === 0n) return 0
	const neg = val < 0n
	const absVal = neg ? -val : val
	const bitLen = absVal.toString(2).length
	const shift = bitLen - 53

	let num
	if (shift > 0) {
		const shiftBig = BigInt(shift)
		const half = 1n << (shiftBig - 1n)
		const rem = absVal & ((1n << shiftBig) - 1n)
		let mant = absVal >> shiftBig
		if (rem > half || (rem === half && (mant & 1n) === 1n)) {
			mant += 1n
		}
		num = Number(mant) * 2 ** (shift - 256)
	} else {
		num = Number(absVal) * 2 ** -256
	}

	return neg ? -num : num
}

/**
 * Performs exact Payne-Hanek range reduction modulo pi/2 for positive finite
 * float64 values ax >= 2^19, returning { quad, r } with quad in {0, 1, 2, 3}
 * and |r| <= pi/4.
 *
 * @param {number} ax
 * @returns {{ quad: number, r: number }}
 */
function reduceLargeAngle(ax) {
	FLOAT_VIEW[0] = ax
	const bits = UINT64_VIEW[0]
	const expBits = Number((bits >> 52n) & 0x7ffn)
	const mantissa = (bits & 0xfffffffffffffn) | 0x10000000000000n
	const exp = expBits - 1023 - 52 // ax = mantissa * 2^exp

	const rightShift = BigInt(1200 - exp - 128)
	const fracAndQuad = ((mantissa * TWO_OVER_PI_1200) >> rightShift) & QUAD_MASK
	const rounded = (fracAndQuad + HALF_128) & QUAD_MASK
	const quad = Number(rounded >> FRAC_BITS)

	let frac = fracAndQuad - (BigInt(quad) << FRAC_BITS)
	if (quad === 0 && frac >= 3n * ONE_128) {
		frac -= FOUR_128
	}

	const r = fixed256ToFloat64(frac * PI_OVER_2_128)
	return { quad, r }
}

/**
 * Recursively computes [sin(u), 1 - cos(u)] for |u| <= pi/4 using
 * divide-and-conquer angle-halving identities.
 *
 * @param {number} u - Angle in radians with |u| <= pi/4.
 * @returns {[number, number]} Tuple of [sin(u), 1 - cos(u)].
 */
function sinVersinRecursive(u) {
	if (Math.abs(u) <= BASE_THRESHOLD) {
		const u2 = u * u
		return [u * (1 - u2 / 6), 0.5 * u2 * (1 - u2 / 12)]
	}

	const [s, v] = sinVersinRecursive(u * 0.5)
	return [2 * s * (1 - v), 2 * s * s]
}

/**
 * Computes the trigonometric sine of an IEEE-754 float64 number using a
 * recursive divide-and-conquer angle-halving algorithm.
 *
 * @param {number} x - Angle in radians.
 * @returns {number} Sine of x in [-1, 1], or NaN for NaN / +-Infinity.
 * @throws {TypeError} If x is not a number.
 */
export function sinFloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, got ${typeof x}`)
	}

	if (Number.isNaN(x) || !Number.isFinite(x)) {
		return Number.NaN
	}

	// Preserve signed zero (+0 -> +0, -0 -> -0)
	if (x === 0) {
		return x
	}

	const sign = x < 0 ? -1 : 1
	const ax = Math.abs(x)

	if (ax <= PI_OVER_4) {
		const [s] = sinVersinRecursive(ax)
		return sign * s
	}

	let quad
	let r
	if (ax < CODY_WAITE_LIMIT) {
		const k = Math.round(ax * TWO_OVER_PI)
		r = ax - k * PIO2_1 - k * PIO2_2 - k * PIO2_3
		quad = k & 3
	} else {
		const reduced = reduceLargeAngle(ax)
		quad = reduced.quad
		r = reduced.r
	}

	const [s, v] = sinVersinRecursive(r)
	let value
	switch (quad) {
		case 0:
			value = s
			break
		case 1:
			value = 1 - v
			break
		case 2:
			value = -s
			break
		default:
			value = -(1 - v)
			break
	}

	return sign * value
}
