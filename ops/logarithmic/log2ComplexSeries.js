/**
 * Complex base-2 logarithm using principal branch and series/identity-based computation.
 *
 * For a nonzero complex number z = re + i*im:
 *   log2(z) = ln(z) / ln(2) = log2(|z|) + i * (arg(z) / ln(2))
 * where arg(z) in (-pi, pi] is the principal argument.
 *
 * Magnitude logarithm is computed via IEEE-754 binary range reduction combined
 * with the rapidly converging hyperbolic arctangent series:
 *   ln(f) = 2 * sum_{n=0}^{\infty} t^(2n+1) / (2n + 1),  t = (f - 1) / (f + 1).
 * Near the unit circle, ln(|z|) = 0.5 * ln(1 + s) = atanh(s / (2 + s)) avoids
 * catastrophic cancellation.
 */

const _f64 = new Float64Array(1)
const _u64 = new BigUint64Array(_f64.buffer)
const MIN_NORMAL_F64 = 2.2250738585072014e-308
const TWO_POW_54 = 18014398509481984 // 2^54

/**
 * Evaluates atanh(t) = sum_{n=0}^{\infty} t^(2n+1) / (2n + 1) for |t| < 1.
 *
 * @param {number} t - Real argument with |t| < 1 (typically |t| <= 1/3).
 * @returns {number} Value of atanh(t).
 */
function atanhSeries(t) {
	if (t === 0) return 0
	const t2 = t * t
	let term = t
	let sum = t
	for (let k = 3; k < 200; k += 2) {
		term *= t2
		const next = sum + term / k
		if (next === sum) break
		sum = next
	}
	return sum
}

/** Natural logarithm of 2 computed via ln(2) = 2 * atanh(1/3). */
const LN2 = 2 * atanhSeries(1 / 3)

/**
 * Decomposes a positive finite IEEE-754 double x into x = mantissa * 2^exponent
 * with mantissa in [1/sqrt(2), sqrt(2)].
 *
 * @param {number} x - Positive finite number.
 * @returns {{ mantissa: number, exponent: number }}
 */
function decomposeBinary(x) {
	let expOffset = 0
	let v = x
	if (v < MIN_NORMAL_F64) {
		v *= TWO_POW_54
		expOffset = -54
	}
	_f64[0] = v
	const bits = _u64[0]
	const rawExp = Number((bits >> 52n) & 0x7ffn)
	let exponent = rawExp - 1023 + expOffset
	_u64[0] = (bits & 0x800fffffffffffffn) | (1023n << 52n)
	let mantissa = _f64[0]
	if (mantissa > Math.SQRT2) {
		mantissa *= 0.5
		exponent += 1
	}
	return { mantissa, exponent }
}

/**
 * Computes log2(|re + i*im|) accurately without overflow, underflow,
 * or catastrophic cancellation near the unit circle.
 *
 * @param {number} re - Real part (finite).
 * @param {number} im - Imaginary part (finite).
 * @returns {number} Base-2 logarithm of the modulus.
 */
function log2Modulus(re, im) {
	const absRe = Math.abs(re)
	const absIm = Math.abs(im)
	const hi = absRe >= absIm ? absRe : absIm
	const lo = absRe >= absIm ? absIm : absRe

	// Cancellation-free path near the unit circle: |z|^2 = 1 + s
	if (hi >= 0.7 && hi <= 1.3) {
		const s = (hi - 1) * (hi + 1) + lo * lo
		if (Math.abs(s) <= 0.5) {
			if (s === 0) return 0
			return atanhSeries(s / (2 + s)) / LN2
		}
	}

	// Overflow/underflow-safe scaling: |z| = hi * sqrt(1 + (lo/hi)^2)
	const { mantissa, exponent } = decomposeBinary(hi)
	const lnMantissa = 2 * atanhSeries((mantissa - 1) / (mantissa + 1))

	const ratio = lo / hi
	const r2 = ratio * ratio
	const lnScale = r2 === 0 ? 0 : atanhSeries(r2 / (2 + r2))

	return exponent + (lnMantissa + lnScale) / LN2
}

/**
 * Computes the principal value of the base-2 logarithm of a complex number.
 *
 * @param {{ re: number, im: number }} z - Nonzero complex number with finite real and imaginary parts.
 * @returns {{ re: number, im: number }} Principal value of log2(z) with im in (-pi/ln(2), pi/ln(2)].
 * @throws {TypeError} If z is not a plain complex object or re/im are not numbers.
 * @throws {RangeError} If re/im are non-finite or z is complex zero (0 + 0i).
 */
export function log2ComplexSeries(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('log2ComplexSeries: input must be an object { re, im }')
	}
	const { re: rawRe, im: rawIm } = z
	if (typeof rawRe !== 'number' || typeof rawIm !== 'number') {
		throw new TypeError('log2ComplexSeries: re and im must be numbers')
	}
	if (!Number.isFinite(rawRe) || !Number.isFinite(rawIm)) {
		throw new RangeError('log2ComplexSeries: re and im must be finite numbers')
	}
	if (rawRe === 0 && rawIm === 0) {
		throw new RangeError('log2ComplexSeries: complex zero (0 + 0i) is undefined')
	}

	// Normalize -0 to +0 so negative real axis stays on the principal branch arg(z) = +pi
	const re = rawRe === 0 ? 0 : rawRe
	const im = rawIm === 0 ? 0 : rawIm

	const outRe = log2Modulus(re, im)
	const outIm = Math.atan2(im, re) / LN2

	return {
		re: outRe === 0 ? 0 : outRe,
		im: outIm === 0 ? 0 : outIm,
	}
}
