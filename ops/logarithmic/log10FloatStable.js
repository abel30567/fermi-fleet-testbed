/**
 * Numerically robust base-10 logarithm over IEEE-754 float64 numbers.
 *
 * Uses exact IEEE-754 binary decomposition (including subnormal scaling),
 * symmetric range reduction into [sqrt(2)/2, sqrt(2)], and double-double
 * (compensated error-free transformation) evaluation of the atanh series
 * and base-10 conversion to achieve near-correctly-rounded float64 accuracy
 * (~0.5 ULP) without catastrophic cancellation near 1 or overflow/underflow
 * on extreme exponents.
 *
 * @module ops/logarithmic/log10FloatStable
 */

// 2^27 + 1, used for Veltkamp splitting in Dekker's exact TwoProd.
const VELTKAMP_SPLIT = 134217729

// 2^54, used to normalize positive subnormal float64 values exactly.
const TWO_54 = 18014398509481984

// Range-reduction threshold sqrt(2) so reduced mantissa lies in [sqrt(2)/2, sqrt(2)].
const SQRT2 = 1.4142135623730951

// High/low double-double pairs for log10(2) and log10(e) = 1 / ln(10), >110 bits accurate.
const LOG10_2_HI = 0.3010299956639812
const LOG10_2_LO = -2.8037281277851704e-18

const LOG10E_HI = 0.4342944819032518
const LOG10E_LO = 1.098319650216765e-17

// Reusable single-slot buffers for zero-allocation IEEE-754 bit inspection.
const f64View = new Float64Array(1)
const u64View = new BigUint64Array(f64View.buffer)

/**
 * Error-free transformation: exact sum of two float64 numbers assuming |a| >= |b|.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function quickTwoSum(a, b) {
	const s = a + b
	const e = b - (s - a)
	return [s, e]
}

/**
 * Knuth's error-free transformation: exact sum of any two float64 numbers.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoSum(a, b) {
	const s = a + b
	const bb = s - a
	const e = (a - (s - bb)) + (b - bb)
	return [s, e]
}

/**
 * Dekker's error-free transformation: exact product of two float64 numbers
 * (overflow-safe for operands with magnitude well below 2^995).
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
 * IEEE-accurate double-double addition: (aHi + aLo) + (bHi + bLo).
 * @param {number} aHi
 * @param {number} aLo
 * @param {number} bHi
 * @param {number} bLo
 * @returns {[number, number]}
 */
function ddAdd(aHi, aLo, bHi, bLo) {
	const s1 = aHi + bHi
	const sb = s1 - aHi
	const s2 = (aHi - (s1 - sb)) + (bHi - sb)

	const t1 = aLo + bLo
	const tb = t1 - aLo
	const t2 = (aLo - (t1 - tb)) + (bLo - tb)

	const c = s2 + t1
	const vh = s1 + c
	const vl = c - (vh - s1)
	const w = t2 + vl
	const hi = vh + w
	const lo = w - (hi - vh)
	return [hi, lo]
}

/**
 * Double-double multiplication: (aHi + aLo) * (bHi + bLo).
 * @param {number} aHi
 * @param {number} aLo
 * @param {number} bHi
 * @param {number} bLo
 * @returns {[number, number]}
 */
function ddMul(aHi, aLo, bHi, bLo) {
	const [pHi, pLo] = twoProd(aHi, bHi)
	const lo = pLo + (aHi * bLo + aLo * bHi)
	return quickTwoSum(pHi, lo)
}

/**
 * Double-double division: (aHi + aLo) / (bHi + bLo), accurate to ~106 bits.
 * @param {number} aHi
 * @param {number} aLo
 * @param {number} bHi
 * @param {number} bLo
 * @returns {[number, number]}
 */
function ddDiv(aHi, aLo, bHi, bLo) {
	const q1 = aHi / bHi
	const [p1Hi, p1Lo] = ddMul(q1, 0, bHi, bLo)
	const [r1Hi, r1Lo] = ddAdd(aHi, aLo, -p1Hi, -p1Lo)

	const q2 = r1Hi / bHi
	const [p2Hi, p2Lo] = ddMul(q2, 0, bHi, bLo)
	const [r2Hi, r2Lo] = ddAdd(r1Hi, r1Lo, -p2Hi, -p2Lo)

	const q3 = r2Hi / bHi
	const [sHi, sLo] = quickTwoSum(q1, q2)
	return ddAdd(sHi, sLo, q3, 0)
}

// Precompute double-double reciprocals 1 / (2j + 1) for j = 1..20.
// Since |s|^2 <= (3 - 2*sqrt(2))^2 < 0.02944, term j = 20 satisfies
// (s^2)^20 / 41 < 6e-33 < 2^-107, achieving full double-double precision.
const MAX_SERIES_INDEX = 20
const RECIP_ODD_HI = new Float64Array(MAX_SERIES_INDEX + 1)
const RECIP_ODD_LO = new Float64Array(MAX_SERIES_INDEX + 1)
for (let j = 1; j <= MAX_SERIES_INDEX; j++) {
	const [hi, lo] = ddDiv(1, 0, 2 * j + 1, 0)
	RECIP_ODD_HI[j] = hi
	RECIP_ODD_LO[j] = lo
}

/**
 * Exact IEEE-754 binary decomposition of a positive finite float64 value x
 * into x = m * 2^k with m in [sqrt(2)/2, sqrt(2)] and integer k in [-1074, 1024].
 * @param {number} x Positive finite number.
 * @returns {[number, number]} Tuple [m, k].
 */
function decomposeNormalized(x) {
	f64View[0] = x
	let bits = u64View[0]
	let expBits = Number((bits >> 52n) & 0x7ffn)
	let k

	if (expBits === 0) {
		// Subnormal: scale into normal range exactly before extracting exponent.
		f64View[0] = x * TWO_54
		bits = u64View[0]
		expBits = Number((bits >> 52n) & 0x7ffn)
		k = expBits - 1023 - 54
	} else {
		k = expBits - 1023
	}

	// Reconstruct mantissa m in [1, 2) by setting biased exponent to 1023 (0x3ff).
	u64View[0] = (bits & 0x000fffffffffffffn) | 0x3ff0000000000000n
	let m = f64View[0]

	// Center m around 1 in [sqrt(2)/2, sqrt(2)] via exact power-of-2 scaling.
	if (m > SQRT2) {
		m *= 0.5
		k += 1
	}

	return [m, k]
}

/**
 * Computes the base-10 logarithm of an IEEE-754 float64 number using exact
 * binary range reduction and compensated double-double arithmetic.
 *
 * Follows IEEE-754 semantics for special values:
 * - `NaN` or `x < 0` (including `-Infinity`) returns `NaN`
 * - `+0` or `-0` returns `-Infinity`
 * - `+Infinity` returns `+Infinity`
 * - `1` returns `+0`
 *
 * @param {number} x Input IEEE-754 float64 number.
 * @returns {number} Base-10 logarithm of `x`.
 * @throws {TypeError} If `x` is not of type `number`.
 */
export function log10FloatStable(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`log10FloatStable expected a number, got ${typeof x}`)
	}

	if (Number.isNaN(x) || x < 0) {
		return Number.NaN
	}
	if (x === 0) {
		return -Number.POSITIVE_INFINITY
	}
	if (x === Number.POSITIVE_INFINITY) {
		return Number.POSITIVE_INFINITY
	}
	if (x === 1) {
		return 0
	}

	const [m, k] = decomposeNormalized(x)

	// Compute ln(m) in double-double precision using ln(m) = 2 * atanh((m - 1) / (m + 1)).
	// Because 0.5 <= m <= 2, f = m - 1 is exact (Sterbenz's lemma).
	let lnHi = 0
	let lnLo = 0
	const f = m - 1
	if (f !== 0) {
		const [sumHi, sumLo] = twoSum(m, 1)
		const [sHi, sLo] = ddDiv(f, 0, sumHi, sumLo)
		const [s2Hi, s2Lo] = ddMul(sHi, sLo, sHi, sLo)

		// Horner evaluation of sum_{j=1..MAX_SERIES_INDEX} (s^2)^(j-1) / (2j + 1).
		let pHi = RECIP_ODD_HI[MAX_SERIES_INDEX]
		let pLo = RECIP_ODD_LO[MAX_SERIES_INDEX]
		for (let j = MAX_SERIES_INDEX - 1; j >= 1; j--) {
			const [mHi, mLo] = ddMul(pHi, pLo, s2Hi, s2Lo)
			;[pHi, pLo] = ddAdd(mHi, mLo, RECIP_ODD_HI[j], RECIP_ODD_LO[j])
		}

		// tail = 2 * s^3 * P(s^2); note multiplying by 2 is exact in IEEE-754.
		const [s3Hi, s3Lo] = ddMul(sHi, sLo, s2Hi, s2Lo)
		const [tHi, tLo] = ddMul(2 * s3Hi, 2 * s3Lo, pHi, pLo)
		;[lnHi, lnLo] = ddAdd(2 * sHi, 2 * sLo, tHi, tLo)
	}

	// log10(x) = k * log10(2) + ln(m) * log10(e), accumulated in double-double.
	const [lnPartHi, lnPartLo] = ddMul(lnHi, lnLo, LOG10E_HI, LOG10E_LO)
	if (k === 0) {
		return lnPartHi + lnPartLo
	}

	const [kPartHi, kPartLo] = ddMul(k, 0, LOG10_2_HI, LOG10_2_LO)
	const [resHi, resLo] = ddAdd(kPartHi, kPartLo, lnPartHi, lnPartLo)
	return resHi + resLo
}
