/**
 * @fileoverview Element-wise cosine over Float64Array inputs using
 * range reduction and Maclaurin series evaluation (zero dependencies).
 */

/**
 * Exact 24-bit Cody-Waite decomposition of pi/2:
 *   pi/2 = PIO2_1 + PIO2_2 + PIO2_3 + PIO2_4 + O(2^-96)
 * Each term has at most 24 significant mantissa bits, so k * PIO2_i is exact
 * in IEEE-754 float64 for |k| < 2^29 (~5.36e8).
 */
const PIO2_1 = 1.5707963705062866
const PIO2_2 = -4.371138828673793e-8
const PIO2_3 = -1.7151245100058819e-15
const PIO2_4 = 1.056299898220315e-23

/** High and low parts of pi/2 for scaling Payne-Hanek fractional remainders. */
const PIO2_HI = 1.5707963267948966
const PIO2_LO = 6.123233995736766e-17

/** Reciprocal of pi/2 (2 / pi) in float64 for fast quadrant estimation. */
const INV_PIO2 = 0.6366197723675814

/** Threshold above which exact BigInt Payne-Hanek reduction is used. */
const LARGE_ANGLE_THRESHOLD = 1e7

/**
 * 1280 fractional binary bits of 2/pi for exact Payne-Hanek range reduction
 * across all finite IEEE-754 float64 magnitudes (up to Number.MAX_VALUE).
 */
const TWO_OVER_PI_BITS = 1280
const TWO_OVER_PI_BIGINT = BigInt(
	'0x' +
		'a2f9836e4e441529fc2757d1f534ddc0db6295993c439041fe5163abdebbc561' +
		'b7246e3a424dd2e006492eea09d1921cfe1deb1cb129a73ee88235f52ebb4484' +
		'e99c7026b45f7e413991d639835339f49c845f8bbdf9283b1ff897ffde05980f' +
		'ef2f118b5a0a6d1f6d367ecf27cb09b74f463f669e5fea2d7527bac7ebe5f17b' +
		'3d0739f78a5292ea6bfb5fb11f8d5d0856033046fc7b6babf0cfbc209af4361d'
)

const FRAC_BITS = 128n
const FRAC_HALF = 1n << (FRAC_BITS - 1n)
const INV_2_128 = 2 ** -128

/** Reusable 8-byte scratch view for extracting IEEE-754 float64 bit fields. */
const _scratchBuf = new ArrayBuffer(8)
const _scratchF64 = new Float64Array(_scratchBuf)
const _scratchU64 = new BigUint64Array(_scratchBuf)

/**
 * Maclaurin series coefficients for cos(r) = 1 + sum_{n=1}^{10} (-1)^n r^(2n) / (2n)!
 * Converges to < 1e-20 on |r| <= pi/4.
 */
const C1 = -1 / 2
const C2 = 1 / 24
const C3 = -1 / 720
const C4 = 1 / 40320
const C5 = -1 / 3628800
const C6 = 1 / 479001600
const C7 = -1 / 87178291200
const C8 = 1 / 20922789888000
const C9 = -1 / 6402373705728000
const C10 = 1 / 2432902008176640000

/**
 * Maclaurin series coefficients for sin(r) = r * (1 + sum_{n=1}^{9} (-1)^n r^(2n) / (2n+1)!)
 * Converges to < 1e-19 on |r| <= pi/4.
 */
const S1 = -1 / 6
const S2 = 1 / 120
const S3 = -1 / 5040
const S4 = 1 / 362880
const S5 = -1 / 39916800
const S6 = 1 / 6227020800
const S7 = -1 / 1307674368000
const S8 = 1 / 355687428096000
const S9 = -1 / 121645100408832000

/**
 * Evaluate cos(r) via Horner-form degree-20 Maclaurin polynomial on |r| <= pi/4.
 * @param {number} r - Reduced angle in radians, |r| <= pi/4.
 * @returns {number}
 */
function cosMaclaurin(r) {
	const r2 = r * r
	return (
		1 +
		r2 *
			(C1 +
				r2 *
					(C2 +
						r2 *
							(C3 +
								r2 *
									(C4 +
										r2 *
											(C5 +
												r2 *
													(C6 +
														r2 *
															(C7 +
																r2 *
																	(C8 + r2 * (C9 + r2 * C10)))))))))
	)
}

/**
 * Evaluate sin(r) via Horner-form degree-19 Maclaurin polynomial on |r| <= pi/4.
 * @param {number} r - Reduced angle in radians, |r| <= pi/4.
 * @returns {number}
 */
function sinMaclaurin(r) {
	const r2 = r * r
	return (
		r *
		(1 +
			r2 *
				(S1 +
					r2 *
						(S2 +
							r2 *
								(S3 +
									r2 *
										(S4 +
											r2 *
												(S5 +
													r2 *
														(S6 +
															r2 *
																(S7 + r2 * (S8 + r2 * S9)))))))))
	)
}

/**
 * Exact Payne-Hanek range reduction modulo pi/2 for large positive finite angles.
 * Computes quadrant q in {0, 1, 2, 3} and reduced angle r in [-pi/4, pi/4].
 * @param {number} ax - Positive finite angle >= LARGE_ANGLE_THRESHOLD.
 * @returns {{ q: number, r: number }}
 */
function reduceLargeAngle(ax) {
	_scratchF64[0] = ax
	const bits = _scratchU64[0]
	const biasedExp = Number((bits >> 52n) & 0x7ffn)
	const mantissa = (1n << 52n) | (bits & 0xfffffffffffffn)
	const exp = biasedExp - 1023 - 52

	// prod / 2^shift === ax * (2 / pi), with shift >= 309 for all finite float64
	const shift = BigInt(TWO_OVER_PI_BITS - exp)
	const prod = mantissa * TWO_OVER_PI_BIGINT
	const scaled = prod >> (shift - FRAC_BITS)
	const rounded = (scaled + FRAC_HALF) >> FRAC_BITS
	const fracInt = scaled - (rounded << FRAC_BITS)

	const frac = Number(fracInt) * INV_2_128
	const r = frac * PIO2_HI + frac * PIO2_LO
	return { q: Number(rounded & 3n), r }
}

/**
 * Compute cosine of a single scalar angle using range reduction + Maclaurin series.
 * @param {number} x - Angle in radians.
 * @returns {number} cos(x)
 */
function cosScalar(x) {
	if (!Number.isFinite(x)) {
		return Number.NaN
	}

	// Cosine is an even function: cos(-x) === cos(x)
	const ax = x < 0 ? -x : x

	let q
	let r
	if (ax < LARGE_ANGLE_THRESHOLD) {
		const k = Math.round(ax * INV_PIO2)
		q = k & 3
		r = ((ax - k * PIO2_1) - k * PIO2_2) - k * PIO2_3 - k * PIO2_4
	} else {
		const reduced = reduceLargeAngle(ax)
		q = reduced.q
		r = reduced.r
	}

	let res
	if (q === 0) {
		res = cosMaclaurin(r)
	} else if (q === 1) {
		res = -sinMaclaurin(r)
	} else if (q === 2) {
		res = -cosMaclaurin(r)
	} else {
		res = sinMaclaurin(r)
	}

	return res === 0 ? 0 : res
}

/**
 * Computes the trigonometric cosine element-wise over a Float64Array using
 * Cody-Waite / Payne-Hanek range reduction to [-pi/4, pi/4] and Horner-form
 * Maclaurin series evaluation (without calling Math.cos or Math.sin).
 *
 * @param {Float64Array} input - Input angles in radians. Must be a Float64Array.
 * @returns {Float64Array} A new Float64Array containing cos(input[i]) for each element.
 * @throws {TypeError} If `input` is not an instance of Float64Array.
 */
export function cosTypedSeries(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('cosTypedSeries expects a Float64Array input')
	}

	const len = input.length
	const output = new Float64Array(len)
	for (let i = 0; i < len; i++) {
		output[i] = cosScalar(input[i])
	}
	return output
}
