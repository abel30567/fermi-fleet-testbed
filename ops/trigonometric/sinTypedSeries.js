/**
 * Element-wise sine over a Float64Array using range reduction to [-pi/4, pi/4],
 * quadrant symmetry identities, and Maclaurin series evaluation (no Math.sin).
 */

const INV_PIO2 = 2 / Math.PI

// 3-part Cody-Waite decomposition of pi/2.
// PIO2_1 and PIO2_2 each have 24-bit mantissas so k * PIO2_1 and k * PIO2_2
// are exact in IEEE-754 float64 for |k| < 2^29.
const PIO2_1 = 1.570796251296997
const PIO2_2 = 7.549789415861596e-8
const PIO2_3 = 5.390302858158119e-15

// Threshold above which Payne-Hanek BigInt range reduction is used.
const LARGE_ANGLE_THRESHOLD = 1048576 // 2^20

// floor((2 / pi) * 2^1200) for exact Payne-Hanek reduction on large finite float64 inputs.
const TWO_OVER_PI_1200 =
	0xa2f9836e4e441529fc2757d1f534ddc0db6295993c439041fe5163abdebbc561b7246e3a424dd2e006492eea09d1921cfe1deb1cb129a73ee88235f52ebb4484e99c7026b45f7e413991d639835339f49c845f8bbdf9283b1ff897ffde05980fef2f118b5a0a6d1f6d367ecf27cb09b74f463f669e5fea2d7527bac7ebe5f17b3d0739f78a5292ea6bfb5fb11f8d5d0856033046fc7bn

const FRAC_BITS = 128n
const HALF_FRAC = 1n << (FRAC_BITS - 1n)
const SCALE_INV_FRAC = 2 ** -128
const MANTISSA_MASK = (1n << 52n) - 1n
const IMPLICIT_BIT = 1n << 52n

// Reusable scratch buffers for IEEE-754 bit extraction on large angles.
const f64View = new Float64Array(1)
const u64View = new BigUint64Array(f64View.buffer)

// Maclaurin series coefficients for sin(r) on [-pi/4, pi/4]:
// sin(r) = r * (1 + S1*r^2 + S2*r^4 + ... + S9*r^18)
const S1 = -1 / 6
const S2 = 1 / 120
const S3 = -1 / 5040
const S4 = 1 / 362880
const S5 = -1 / 39916800
const S6 = 1 / 6227020800
const S7 = -1 / 1307674368000
const S8 = 1 / 355687428096000
const S9 = -1 / 121645100408832000

// Maclaurin series coefficients for cos(r) on [-pi/4, pi/4]:
// cos(r) = 1 + C1*r^2 + C2*r^4 + ... + C9*r^18
const C1 = -1 / 2
const C2 = 1 / 24
const C3 = -1 / 720
const C4 = 1 / 40320
const C5 = -1 / 3628800
const C6 = 1 / 479001600
const C7 = -1 / 87178291200
const C8 = 1 / 20922789888000
const C9 = -1 / 6402373705728000

/**
 * Evaluates sin(r) via Horner-form Maclaurin series for |r| <= pi/4.
 *
 * @param {number} r
 * @returns {number}
 */
function sinKernel(r) {
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
 * Evaluates cos(r) via Horner-form Maclaurin series for |r| <= pi/4.
 *
 * @param {number} r
 * @returns {number}
 */
function cosKernel(r) {
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
															(C7 + r2 * (C8 + r2 * C9))))))))
	)
}

/**
 * Evaluates sin(x) for a large finite float64 using Payne-Hanek BigInt reduction.
 *
 * @param {number} x
 * @returns {number}
 */
function sinLarge(x) {
	const negative = x < 0
	f64View[0] = negative ? -x : x
	const bits = u64View[0]
	const exp = Number((bits >> 52n) & 0x7ffn) - 1023
	const mantissa = IMPLICIT_BIT | (bits & MANTISSA_MASK)
	const shift = BigInt(1200 - (exp - 52)) - FRAC_BITS

	const scaled = (mantissa * TWO_OVER_PI_1200) >> shift
	const k = (scaled + HALF_FRAC) >> FRAC_BITS
	const fracBig = scaled - (k << FRAC_BITS)

	const r = Number(fracBig) * SCALE_INV_FRAC * (Math.PI / 2)
	const quadrant = Number(k & 3n)

	let val
	if (quadrant === 0) {
		val = sinKernel(r)
	} else if (quadrant === 1) {
		val = cosKernel(r)
	} else if (quadrant === 2) {
		val = -sinKernel(r)
	} else {
		val = -cosKernel(r)
	}

	return negative ? -val : val
}

/**
 * Evaluates sin(x) for a single scalar float64.
 *
 * @param {number} x
 * @returns {number}
 */
function sinScalar(x) {
	if (!Number.isFinite(x)) {
		return Number.NaN
	}
	if (x === 0) {
		// Preserve signed zero (+0 -> +0, -0 -> -0).
		return x
	}

	const absX = x < 0 ? -x : x
	if (absX >= LARGE_ANGLE_THRESHOLD) {
		return sinLarge(x)
	}

	// Cody-Waite range reduction: x = k * (pi/2) + r, with r in [-pi/4, pi/4].
	const k = Math.round(x * INV_PIO2)
	const r = x - k * PIO2_1 - k * PIO2_2 - k * PIO2_3
	const quadrant = ((k % 4) + 4) % 4

	if (quadrant === 0) {
		return sinKernel(r)
	}
	if (quadrant === 1) {
		return cosKernel(r)
	}
	if (quadrant === 2) {
		return -sinKernel(r)
	}
	return -cosKernel(r)
}

/**
 * Computes the trigonometric sine element-wise over a Float64Array using range
 * reduction to [-pi/4, pi/4], quadrant symmetry identities, and Maclaurin series.
 *
 * @param {Float64Array} input - Input angles in radians.
 * @returns {Float64Array} A new Float64Array containing sin(input[i]) for each element.
 * @throws {TypeError} If `input` is not a Float64Array.
 */
export function sinTypedSeries(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('sinTypedSeries expects a Float64Array input')
	}

	const len = input.length
	const output = new Float64Array(len)
	for (let i = 0; i < len; i++) {
		output[i] = sinScalar(input[i])
	}
	return output
}
