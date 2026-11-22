/**
 * @module ops/logarithmic/log10FloatSeries
 *
 * Base-10 logarithm (`log10`) over IEEE-754 binary64 Numbers using exact
 * floating-point range reduction, the inverse hyperbolic tangent (atanh)
 * power series, and the change-of-base identity `log10(x) = ln(x) / ln(10)`.
 *
 * Does not delegate to `Math.log`, `Math.log10`, `Math.log2`, or `Math.log1p`.
 */

const SQRT2 = Math.SQRT2
const TWO_54 = 18014398509481984 // 2^54, used to normalize IEEE-754 subnormals
const VELTKAMP_SPLIT = 134217729 // 2^27 + 1, for exact Dekker-Veltkamp TwoProd

// Reusable 8-byte buffer for IEEE-754 binary64 bit decomposition.
const floatBuf = new ArrayBuffer(8)
const floatView = new DataView(floatBuf)

/**
 * Knuth's error-free TwoSum transformation: returns `[s, e]` with `s + e = a + b` exactly.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoSum(a, b) {
	const s = a + b
	const v = s - a
	const e = (a - (s - v)) + (b - v)
	return [s, e]
}

/**
 * Dekker-Veltkamp error-free TwoProd transformation: returns `[p, e]` with `p + e = a * b` exactly.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoProd(a, b) {
	const p = a * b
	const ca = VELTKAMP_SPLIT * a
	const aHi = ca - (ca - a)
	const aLo = a - aHi
	const cb = VELTKAMP_SPLIT * b
	const bHi = cb - (cb - b)
	const bLo = b - bHi
	const e = ((aHi * bHi - p) + aHi * bLo + aLo * bHi) + aLo * bLo
	return [p, e]
}

/**
 * Adds two double-double values `(aHi, aLo)` and `(bHi, bLo)`.
 * @param {number} aHi
 * @param {number} aLo
 * @param {number} bHi
 * @param {number} bLo
 * @returns {[number, number]}
 */
function ddAdd(aHi, aLo, bHi, bLo) {
	const [sHi, sLo] = twoSum(aHi, bHi)
	const [tHi, tLo] = twoSum(aLo, bLo)
	const [cHi, cLo] = twoSum(sHi, sLo + tHi)
	return twoSum(cHi, cLo + tLo)
}

/**
 * Multiplies two double-double values `(aHi, aLo)` and `(bHi, bLo)`.
 * @param {number} aHi
 * @param {number} aLo
 * @param {number} bHi
 * @param {number} bLo
 * @returns {[number, number]}
 */
function ddMul(aHi, aLo, bHi, bLo) {
	const [pHi, pLo] = twoProd(aHi, bHi)
	return twoSum(pHi, pLo + (aHi * bLo + aLo * bHi))
}

/**
 * Divides two double-double values `(aHi, aLo) / (bHi, bLo)`.
 * @param {number} aHi
 * @param {number} aLo
 * @param {number} bHi
 * @param {number} bLo
 * @returns {[number, number]}
 */
function ddDiv(aHi, aLo, bHi, bLo) {
	const q1 = aHi / bHi
	const [pHi, pLo] = ddMul(q1, 0, bHi, bLo)
	const [rHi, rLo] = ddAdd(aHi, aLo, -pHi, -pLo)
	const q2 = rHi / bHi
	const [p2Hi, p2Lo] = ddMul(q2, 0, bHi, bLo)
	const [r2Hi, r2Lo] = ddAdd(rHi, rLo, -p2Hi, -p2Lo)
	const q3 = r2Hi / bHi
	const [sHi, sLo] = twoSum(q1, q2)
	return ddAdd(sHi, sLo, q3, 0)
}

/**
 * Computes `ln(p / q) = 2 * sum_{j=0}^{terms} t^(2j+1) / (2j+1)` in double-double precision,
 * where `t = (p - q) / (p + q)`.
 * @param {number} p - Positive numerator
 * @param {number} q - Positive denominator
 * @param {number} terms - Highest index `j` in the atanh series
 * @returns {[number, number]}
 */
function lnRationalDD(p, q, terms) {
	const [tHi, tLo] = ddDiv(p - q, 0, p + q, 0)
	const [t2Hi, t2Lo] = ddMul(tHi, tLo, tHi, tLo)

	// Sum smallest terms first using Horner's rule: 1 + t^2*(1/3 + t^2*(1/5 + ...))
	let [accHi, accLo] = ddDiv(1, 0, 2 * terms + 1, 0)
	for (let j = terms - 1; j >= 0; j--) {
		const [prodHi, prodLo] = ddMul(accHi, accLo, t2Hi, t2Lo)
		const [invHi, invLo] = ddDiv(1, 0, 2 * j + 1, 0)
		;[accHi, accLo] = ddAdd(invHi, invLo, prodHi, prodLo)
	}

	const [resHi, resLo] = ddMul(tHi, tLo, accHi, accLo)
	return [2 * resHi, 2 * resLo]
}

// Compute high-precision constants directly from the atanh series:
//   ln(2)  = 2 * atanh(1/3)                         (t = 1/3, t^2 = 1/9)
//   ln(10) = 3 * ln(2) + ln(5/4) = 3*ln(2) + 2*atanh(1/9)
const [LN2_HI, LN2_LO] = lnRationalDD(2, 1, 35)
const [LN_5_4_HI, LN_5_4_LO] = lnRationalDD(5, 4, 20)
const [THREE_LN2_HI, THREE_LN2_LO] = ddMul(3, 0, LN2_HI, LN2_LO)
const [LN10_HI, LN10_LO] = ddAdd(THREE_LN2_HI, THREE_LN2_LO, LN_5_4_HI, LN_5_4_LO)

/**
 * Decomposes a finite positive IEEE-754 binary64 number `x` into exact `(m, k)`
 * such that `x = m * 2^k` and `m` lies in `[sqrt(1/2), sqrt(2)]`.
 *
 * @param {number} x - Finite positive number.
 * @returns {{ m: number, k: number }}
 */
function decomposeFloat64(x) {
	floatView.setFloat64(0, x, false)
	let hi = floatView.getUint32(0, false)
	let biasedExp = (hi >>> 20) & 0x7ff
	let expOffset = 0

	// Normalize subnormal numbers (biased exponent === 0) by scaling by 2^54.
	if (biasedExp === 0) {
		floatView.setFloat64(0, x * TWO_54, false)
		hi = floatView.getUint32(0, false)
		biasedExp = (hi >>> 20) & 0x7ff
		expOffset = -54
	}

	let k = biasedExp - 1023 + expOffset

	// Replace exponent field with 1023 (2^0) to obtain exact mantissa m in [1, 2).
	floatView.setUint32(0, (hi & 0x000fffff) | 0x3ff00000, false)
	let m = floatView.getFloat64(0, false)

	// Shift m into [sqrt(1/2), sqrt(2)] so |t| = |(m-1)/(m+1)| <= 3 - 2*sqrt(2) ≈ 0.17157.
	if (m > SQRT2) {
		m *= 0.5
		k += 1
	}

	return { m, k }
}

/**
 * Evaluates `ln(m)` for `m` in `[sqrt(1/2), sqrt(2)]` using the atanh power series:
 *
 *   t = (m - 1) / (m + 1)
 *   ln(m) = 2 * sum_{j=0}^{N} t^(2j+1) / (2j + 1)
 *
 * Returns a double-double pair `[hi, lo]` so the subsequent addition with `k * ln(2)`
 * and division by `ln(10)` retain full IEEE-754 binary64 accuracy.
 *
 * @param {number} m - Reduced mantissa in `[sqrt(1/2), sqrt(2)]`.
 * @returns {[number, number]}
 */
function lnReducedAtanhDD(m) {
	if (m === 1) {
		return [0, 0]
	}

	// Exact numerator (m - 1) and denominator (m + 1) via TwoSum.
	const [numHi, numLo] = twoSum(m, -1)
	const [denHi, denLo] = twoSum(m, 1)
	const [tHi, tLo] = ddDiv(numHi, numLo, denHi, denLo)

	const t2 = tHi * tHi
	// For |t| <= 0.171573, t^2 <= 0.029437.
	// The tail starting at j = 2 has magnitude <= 0.029437^2 / 5 ≈ 1.7e-4.
	// Using Horner evaluation from j = 15 down to 2 gives full float64 precision
	// for the higher-order tail (at j = 15, (t^2)^15 / 31 ≈ 3.8e-25).
	let tail = 1 / 31
	for (let j = 14; j >= 2; j--) {
		tail = 1 / (2 * j + 1) + t2 * tail
	}

	// Keep the leading terms t + t^3/3 in double-double precision, then fold in t^5 * tail.
	const [t2Hi, t2Lo] = ddMul(tHi, tLo, tHi, tLo)
	const [t3Hi, t3Lo] = ddMul(t2Hi, t2Lo, tHi, tLo)
	const [term1Hi, term1Lo] = ddDiv(t3Hi, t3Lo, 3, 0)
	const [leadHi, leadLo] = ddAdd(tHi, tLo, term1Hi, term1Lo)

	const t5Tail = t3Hi * t2 * tail
	const [sumHi, sumLo] = ddAdd(leadHi, leadLo, t5Tail, 0)

	return [2 * sumHi, 2 * sumLo]
}

/**
 * Computes the base-10 logarithm (`log10(x)`) of a finite positive IEEE-754
 * binary64 floating-point number using exact binary range reduction, the atanh
 * power series, and the change-of-base identity `log10(x) = ln(x) / ln(10)`.
 *
 * Algorithm:
 * 1. Validate that `x` is a finite positive `number`.
 * 2. Decompose `x = m * 2^k` with `m` in `[sqrt(1/2), sqrt(2)]` via IEEE-754 bits.
 * 3. Compute `ln(m) = 2 * sum_{j=0}^{∞} t^(2j+1)/(2j+1)` where `t = (m - 1)/(m + 1)`.
 * 4. Combine `ln(x) = k * ln(2) + ln(m)` and apply `log10(x) = ln(x) / ln(10)`.
 *
 * @param {number} x - Finite positive IEEE-754 float64 number (`x > 0`).
 * @returns {number} Base-10 logarithm of `x`.
 * @throws {TypeError} If `x` is not of type `number`.
 * @throws {RangeError} If `x` is `NaN`, infinite, or `<= 0`.
 */
export function log10FloatSeries(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a finite positive number, received ${typeof x}`)
	}
	if (Number.isNaN(x)) {
		throw new RangeError('Expected a finite positive number, received NaN')
	}
	if (!Number.isFinite(x)) {
		throw new RangeError(`Expected a finite positive number, received ${x}`)
	}
	if (x <= 0) {
		throw new RangeError(`Expected a strictly positive number (> 0), received ${x}`)
	}

	if (x === 1) {
		return 0
	}

	const { m, k } = decomposeFloat64(x)
	const [lnMHi, lnMLo] = lnReducedAtanhDD(m)

	// ln(x) = k * ln(2) + ln(m)
	const [kLn2Hi, kLn2Lo] = ddMul(k, 0, LN2_HI, LN2_LO)
	const [lnXHi, lnXLo] = ddAdd(kLn2Hi, kLn2Lo, lnMHi, lnMLo)

	// log10(x) = ln(x) / ln(10)
	const [log10Hi, log10Lo] = ddDiv(lnXHi, lnXLo, LN10_HI, LN10_LO)
	return log10Hi + log10Lo
}
