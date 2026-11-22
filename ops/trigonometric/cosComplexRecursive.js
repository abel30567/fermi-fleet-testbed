/**
 * Complex trigonometric cosine using recursive double-angle halving and
 * divide-and-conquer orthogonal decomposition.
 *
 * Mathematical definition:
 *   cos(z) = cos(x + i·y) = cos(x)·cosh(y) - i·sin(x)·sinh(y)
 *          = (e^(i·z) + e^(-i·z)) / 2
 *
 * Algorithm:
 *   1. Validate that `z` is a complex object `{ re, im }` with finite numbers.
 *   2. Decompose `z = (x + 0i) + (0 + iy)` using the complex cosine addition
 *      theorem:
 *        cos(x + iy) = cos(x + 0i)·cos(0 + iy) - sin(x + 0i)·sin(0 + iy)
 *   3. Reduce the real component `x` modulo pi/2 into [-pi/4, pi/4] (using
 *      3-part Cody-Waite reduction for |x| < 2^24 and exact BigInt Payne-Hanek
 *      reduction for |x| >= 2^24) so quadrant rotation preserves full 53-bit
 *      precision with zero cancellation near odd multiples of pi/2.
 *   4. Evaluate both `(cos(r) - 1, sin(r))` and `(cos(iy) - 1, sin(iy))` via
 *      the same complex recursive angle-halving function `cosSinComplexRecursive`:
 *        - Base case (|w| <= 2^-4): recursive Horner evaluation of the Taylor
 *          series for cosm1(w) = cos(w) - 1 and sin(w) (eliminating leading-1
 *          cancellation near w = 0).
 *        - Recursive step (|w| > 2^-4): compute the half-angle result for w/2
 *          and combine using the exact complex double-angle identities:
 *            cosm1(2w) = -2 · sin(w)^2
 *            sin(2w)   =  2 · sin(w) · (1 + cosm1(w))
 *   5. Recombine via complex cosine addition (using a factored half-angle
 *      recombination when 709 < |y| <= 711 to avoid premature overflow of
 *      cosh(y) when the final product is still finite), verify finiteness,
 *      and normalize `-0` to `0`.
 *
 * @param {{ re: number, im: number }} z - Complex input `{ re, im }` with finite real parts.
 * @returns {{ re: number, im: number }} Complex cosine `cos(z)` with finite `{ re, im }`.
 * @throws {TypeError} If `z` is not a plain-like object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is non-finite (NaN / ±Infinity), or if `cos(z)` overflows IEEE-754 double precision.
 */

const BASE_THRESHOLD = 0.0625 // 2^-4
const TAYLOR_MAX_INDEX = 6 // up to w^12/12! (cosm1) and w^13/13! (sin)
const HALF_PI = Math.PI / 2
const TWO_OVER_PI = 2 / Math.PI
const LARGE_REDUCTION_THRESHOLD = 16777216 // 2^24
const SAFE_IMAG_DIRECT = 709 // cosh(709) < 4.2e307 (safely finite)
const MAX_FINITE_IMAG = 711 // for |y| > 711, max(|cos x|, |sin x|) * cosh(y) > Number.MAX_VALUE

// 3-part Cody-Waite split of pi/2 = PI_HALF_1 + PI_HALF_2 + PI_HALF_3 (104 bits total)
const PI_HALF_1 = 1.5707963109016418 // top 26 bits of pi/2
const PI_HALF_2 = 1.5893254712295857e-8 // next 25 bits of pi/2
const PI_HALF_3 = 6.123233995736757e-17 // next 53 bits of pi/2

// Exact 1152-bit floor((2 / pi) * 2^1152) for BigInt Payne-Hanek range reduction
const TWO_OVER_PI_1152 = BigInt(
	'0xa2f9836e4e441529fc2757d1f534ddc0db6295993c439041fe5163abdebbc561' +
		'b7246e3a424dd2e006492eea09d1921cfe1deb1cb129a73ee88235f52ebb4484' +
		'e99c7026b45f7e413991d639835339f49c845f8bbdf9283b1ff897ffde05980f' +
		'ef2f118b5a0a6d1f6d367ecf27cb09b74f463f669e5fea2d7527bac7ebe5f17b' +
		'3d0739f78a5292ea6bfb5fb11f8d5d08',
)

const FRAC_BITS = 128n
const FRAC_MASK = (1n << FRAC_BITS) - 1n
const FRAC_HALF = 1n << (FRAC_BITS - 1n)
const FRAC_FULL = 1n << FRAC_BITS
const INV_2_128 = Math.pow(2, -128)

// Precomputed inverse factorials for recursive Horner Taylor base case
// COSM1_COEFFS[k] = (-1)^k / (2k)! for k = 1..TAYLOR_MAX_INDEX
const COSM1_COEFFS = [
	0,
	-1 / 2,
	1 / 24,
	-1 / 720,
	1 / 40320,
	-1 / 3628800,
	1 / 479001600,
]

// SIN_COEFFS[k] = (-1)^k / (2k+1)! for k = 0..TAYLOR_MAX_INDEX
const SIN_COEFFS = [
	1,
	-1 / 6,
	1 / 120,
	-1 / 5040,
	1 / 362880,
	-1 / 39916800,
	1 / 6227020800,
]

const float64Buf = new ArrayBuffer(8)
const float64View = new DataView(float64Buf)

function normalizeZero(x) {
	return x === 0 ? 0 : x
}

function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function complexSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im }
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexScale(a, s) {
	return { re: a.re * s, im: a.im * s }
}

function complexAbs(a) {
	return Math.hypot(a.re, a.im)
}

/**
 * Recursively evaluates the Horner polynomial sum_{j=k}^{M} c_j * (w^2)^(j-k).
 */
function evalSeriesHornerRecursive(w2, coeffs, k) {
	const term = { re: coeffs[k], im: 0 }
	if (k === TAYLOR_MAX_INDEX) {
		return term
	}
	const tail = evalSeriesHornerRecursive(w2, coeffs, k + 1)
	return complexAdd(term, complexMul(w2, tail))
}

/**
 * Recursively computes { cosm1: cos(w) - 1, sin: sin(w) } for a complex number w
 * via divide-and-conquer angle halving and exact complex double-angle identities.
 */
function cosSinComplexRecursive(w) {
	if (complexAbs(w) <= BASE_THRESHOLD) {
		const w2 = complexMul(w, w)
		const cosm1 = complexMul(w2, evalSeriesHornerRecursive(w2, COSM1_COEFFS, 1))
		const sin = complexMul(w, evalSeriesHornerRecursive(w2, SIN_COEFFS, 0))
		return { cosm1, sin }
	}

	const half = cosSinComplexRecursive({ re: w.re / 2, im: w.im / 2 })
	const sinHalf = half.sin
	const cosHalf = { re: 1 + half.cosm1.re, im: half.cosm1.im }

	// Exact complex double-angle identities:
	//   cos(2w) - 1 = -2 * sin(w)^2
	//   sin(2w)     =  2 * sin(w) * cos(w)
	const sinHalfSq = complexMul(sinHalf, sinHalf)
	const cosm1 = complexScale(sinHalfSq, -2)
	const sin = complexScale(complexMul(sinHalf, cosHalf), 2)
	return { cosm1, sin }
}

/**
 * Reduces a finite real angle x modulo pi/2 into { quadrant, r } with
 * quadrant in {0, 1, 2, 3} and r in [-pi/4, pi/4], satisfying
 * x === quadrant * (pi/2) + r (mod 2*pi).
 */
function reduceRealAngle(x) {
	if (Math.abs(x) < LARGE_REDUCTION_THRESHOLD) {
		const k = Math.round(x * TWO_OVER_PI)
		const r = ((x - k * PI_HALF_1) - k * PI_HALF_2) - k * PI_HALF_3
		const quadrant = ((k % 4) + 4) % 4
		return { quadrant, r }
	}

	// Exact BigInt Payne-Hanek range reduction for |x| >= 2^24
	float64View.setFloat64(0, x, false)
	const bits = float64View.getBigUint64(0, false)
	const isNeg = (bits >> 63n) === 1n
	const expBits = Number((bits >> 52n) & 0x7ffn)
	const fracBits = bits & ((1n << 52n) - 1n)
	const mantissa = (1n << 52n) | fracBits
	const exp = expBits - 1023 - 52
	const shift = 1152 - exp // in [181, 1180] for |x| >= 2^24

	const prod = mantissa * TWO_OVER_PI_1152
	let quadrant = Number((prod >> BigInt(shift)) & 3n)
	let frac = (prod >> (BigInt(shift) - FRAC_BITS)) & FRAC_MASK
	if (frac >= FRAC_HALF) {
		quadrant = (quadrant + 1) & 3
		frac -= FRAC_FULL
	}

	let r = Number(frac) * INV_2_128 * HALF_PI
	if (isNeg) {
		quadrant = (4 - quadrant) & 3
		r = -r
	}
	return { quadrant, r }
}

function validateComplex(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected a complex number object { re, im }')
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('Complex number properties re and im must be numbers')
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('Complex number properties re and im must be finite numbers')
	}
}

export function cosComplexRecursive(z) {
	validateComplex(z)

	const x = z.re
	const y = z.im

	if (Math.abs(y) > MAX_FINITE_IMAG) {
		throw new RangeError('cosComplexRecursive result overflows finite IEEE-754 range')
	}

	// 1. Reduce real component x into [-pi/4, pi/4] and compute (cos x, sin x) recursively
	const { quadrant, r } = reduceRealAngle(x)
	const realReduced = cosSinComplexRecursive({ re: r, im: 0 })
	const cr = 1 + realReduced.cosm1.re
	const sr = realReduced.sin.re

	let cosX
	let sinX
	if (quadrant === 0) {
		cosX = cr
		sinX = sr
	} else if (quadrant === 1) {
		cosX = -sr
		sinX = cr
	} else if (quadrant === 2) {
		cosX = -cr
		sinX = -sr
	} else {
		cosX = sr
		sinX = -cr
	}

	// 2. Compute imaginary component (cos(iy), sin(iy)) recursively and combine
	let result
	if (Math.abs(y) <= SAFE_IMAG_DIRECT) {
		const imagPart = cosSinComplexRecursive({ re: 0, im: y })
		const cosReal = { re: cosX, im: 0 }
		const sinReal = { re: sinX, im: 0 }
		const cosImag = { re: 1 + imagPart.cosm1.re, im: imagPart.cosm1.im }
		const sinImag = imagPart.sin

		// Complex cosine addition theorem:
		//   cos(x + iy) = cos(x + 0i)·cos(0 + iy) - sin(x + 0i)·sin(0 + iy)
		result = complexSub(complexMul(cosReal, cosImag), complexMul(sinReal, sinImag))
	} else {
		// Factored half-angle recombination for 709 < |y| <= 711 where cosh(y)
		// alone may exceed Number.MAX_VALUE while cos(x)·cosh(y) and
		// -sin(x)·sinh(y) can still be finite.
		const halfImag = cosSinComplexRecursive({ re: 0, im: y / 2 })
		const cHalf = 1 + halfImag.cosm1.re
		const sHalf = halfImag.sin.im
		result = {
			re: (cosX * sHalf) * (2 * sHalf) + cosX,
			im: -(sinX * sHalf) * (2 * cHalf),
		}
	}

	if (!Number.isFinite(result.re) || !Number.isFinite(result.im)) {
		throw new RangeError('cosComplexRecursive result overflows finite IEEE-754 range')
	}

	return {
		re: normalizeZero(result.re),
		im: normalizeZero(result.im),
	}
}
