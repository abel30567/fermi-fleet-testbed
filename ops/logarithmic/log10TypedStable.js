/**
 * Numerically robust element-wise base-10 logarithm over Float64Array inputs.
 *
 * Uses exact IEEE 754 binary64 exponent/mantissa extraction with subnormal
 * normalization (2^54 scaling), centered range reduction to m in [sqrt(2)/2, sqrt(2)],
 * double-double (compensated) arithmetic via Knuth TwoSum and Veltkamp-Dekker TwoProd,
 * and an odd-power atanh series for ln(m) scaled by ~113-bit constants for log10(e)
 * and log10(2). This avoids catastrophic cancellation near 1, underflow on subnormals,
 * and rounding drift on powers of 10 that affect naive `Math.log(x) / Math.LN10`.
 *
 * @module ops/logarithmic/log10TypedStable
 */

const SPLIT = 134217729 // 2^27 + 1 (Veltkamp splitting constant for binary64)
const TWO_POW_54 = 18014398509481984 // 2^54 for exact subnormal normalization
const SQRT2 = Math.SQRT2

// High-precision double-double constants (error < 1e-33):
// log10(2) = LOG10_2_HI + LOG10_2_LO
const LOG10_2_HI = 0.3010299956639812
const LOG10_2_LO = -2.8037281277851704e-18

// log10(e) = 1 / ln(10) = LOG10E_HI + LOG10E_LO
const LOG10E_HI = 0.4342944819032518
const LOG10E_LO = 1.098319650216765e-17

// Reusable 8-byte buffer for endian-agnostic IEEE 754 binary64 bit inspection
const scratchBuffer = new ArrayBuffer(8)
const scratchView = new DataView(scratchBuffer)

// Precomputed double-double reciprocals 1 / (2k + 1) for k = 0..21
const SERIES_TERMS = 22
const INV_ODD_HI = new Float64Array(SERIES_TERMS)
const INV_ODD_LO = new Float64Array(SERIES_TERMS)

// Module-level scratch outputs for non-allocating double-double ops
let _hi = 0
let _lo = 0

/**
 * Error-free product a * b = _hi + _lo using Veltkamp-Dekker splitting.
 * Safe from overflow for all bounded operands used during range-reduced log10.
 *
 * @param {number} a
 * @param {number} b
 */
function twoProd(a, b) {
	const p = a * b
	const ca = SPLIT * a
	const ah = ca - (ca - a)
	const al = a - ah
	const cb = SPLIT * b
	const bh = cb - (cb - b)
	const bl = b - bh
	const err = ((ah * bh - p) + ah * bl + al * bh) + al * bl
	_hi = p
	_lo = err
}

/**
 * Accurate IEEE double-double addition: (ah, al) + (bh, bl) -> (_hi, _lo).
 *
 * @param {number} ah
 * @param {number} al
 * @param {number} bh
 * @param {number} bl
 */
function ddAdd(ah, al, bh, bl) {
	const s1 = ah + bh
	const v1 = s1 - ah
	const e1 = (ah - (s1 - v1)) + (bh - v1)

	const s2 = al + bl
	const v2 = s2 - al
	const e2 = (al - (s2 - v2)) + (bl - v2)

	const t1 = e1 + s2
	const r1 = s1 + t1
	const r2 = t1 - (r1 - s1)
	const t2 = e2 + r2
	const hi = r1 + t2
	_hi = hi
	_lo = t2 - (hi - r1)
}

/**
 * Accurate double-double multiplication: (ah, al) * (bh, bl) -> (_hi, _lo).
 *
 * @param {number} ah
 * @param {number} al
 * @param {number} bh
 * @param {number} bl
 */
function ddMul(ah, al, bh, bl) {
	twoProd(ah, bh)
	const p = _hi
	const e = _lo + ah * bl + al * bh
	const hi = p + e
	_hi = hi
	_lo = e - (hi - p)
}

/**
 * Accurate double-double division: (ah, al) / (bh, bl) -> (_hi, _lo).
 *
 * @param {number} ah
 * @param {number} al
 * @param {number} bh
 * @param {number} bl
 */
function ddDiv(ah, al, bh, bl) {
	const q1 = ah / bh
	ddMul(q1, 0, bh, bl)
	ddAdd(ah, al, -_hi, -_lo)
	const rh = _hi
	const rl = _lo

	const q2 = rh / bh
	ddMul(q2, 0, bh, bl)
	ddAdd(rh, rl, -_hi, -_lo)
	const q3 = _hi / bh

	// QuickTwoSum(q1, q2) + q3
	const s1 = q1 + q2
	const e1 = q2 - (s1 - q1)
	ddAdd(s1, e1, q3, 0)
}

// Initialize double-double table for 1 / (2k + 1)
for (let k = 0; k < SERIES_TERMS; k++) {
	ddDiv(1, 0, 2 * k + 1, 0)
	INV_ODD_HI[k] = _hi
	INV_ODD_LO[k] = _lo
}

/**
 * Numerically robust scalar log10(x) for a single IEEE 754 binary64 value.
 *
 * @param {number} x
 * @returns {number}
 */
function log10ScalarStable(x) {
	if (Number.isNaN(x) || x < 0) return Number.NaN
	if (x === 0) return -Infinity
	if (x === Infinity) return Infinity
	if (x === 1) return 0

	// Extract IEEE 754 binary64 exponent and mantissa m in [1, 2)
	scratchView.setFloat64(0, x, false)
	let hi32 = scratchView.getUint32(0, false)
	let exp = ((hi32 >>> 20) & 0x7ff) - 1023

	// Normalize positive subnormals via exact 2^54 scaling
	if (exp === -1023) {
		scratchView.setFloat64(0, x * TWO_POW_54, false)
		hi32 = scratchView.getUint32(0, false)
		exp = ((hi32 >>> 20) & 0x7ff) - 1023 - 54
	}

	// Set biased exponent to 1023 (0x3ff) so m lies in [1, 2)
	scratchView.setUint32(0, (hi32 & 0x000fffff) | 0x3ff00000, false)
	let m = scratchView.getFloat64(0, false)

	// Center m in [sqrt(2)/2, sqrt(2)] so |u| <= 3 - 2*sqrt(2) ~= 0.171573
	// and |log10(m)| <= 0.5 * log10(2), preventing cancellation with exp * log10(2)
	if (m > SQRT2) {
		m *= 0.5
		exp += 1
	}

	// Exact power of 2 shortcut: m === 1 => log10(2^exp) = exp * log10(2)
	if (m === 1) {
		twoProd(exp, LOG10_2_HI)
		const p = _hi
		const lo = _lo + exp * LOG10_2_LO
		return p + lo
	}

	// Compute u = (m - 1) / (m + 1) in double-double precision
	// TwoSum(m, -1)
	const numHi = m - 1
	const nv = numHi - m
	const numLo = (m - (numHi - nv)) + (-1 - nv)

	// TwoSum(m, 1)
	const denHi = m + 1
	const dv = denHi - m
	const denLo = (m - (denHi - dv)) + (1 - dv)

	ddDiv(numHi, numLo, denHi, denLo)
	const uHi = _hi
	const uLo = _lo

	// w = u^2 <= (3 - 2*sqrt(2))^2 ~= 0.029437
	ddMul(uHi, uLo, uHi, uLo)
	const wHi = _hi
	const wLo = _lo

	// Evaluate sum_{k=0}^{21} w^k / (2k + 1) via double-double Horner's method
	// Truncation error at k = 22 is < 2e-35
	let sumHi = INV_ODD_HI[SERIES_TERMS - 1]
	let sumLo = INV_ODD_LO[SERIES_TERMS - 1]
	for (let k = SERIES_TERMS - 2; k >= 0; k--) {
		ddMul(sumHi, sumLo, wHi, wLo)
		ddAdd(_hi, _lo, INV_ODD_HI[k], INV_ODD_LO[k])
		sumHi = _hi
		sumLo = _lo
	}

	// ln(m) = 2 * u * sum
	ddMul(uHi, uLo, sumHi, sumLo)
	const lnHi = 2 * _hi
	const lnLo = 2 * _lo

	// log10(m) = ln(m) * log10(e)
	ddMul(lnHi, lnLo, LOG10E_HI, LOG10E_LO)
	const log10mHi = _hi
	const log10mLo = _lo

	if (exp === 0) {
		return log10mHi + log10mLo
	}

	// Combine exp * log10(2) + log10(m) in double-double precision
	twoProd(exp, LOG10_2_HI)
	const eHi = _hi
	const eLo = _lo + exp * LOG10_2_LO
	const expSumHi = eHi + eLo
	const expSumLo = eLo - (expSumHi - eHi)

	ddAdd(expSumHi, expSumLo, log10mHi, log10mLo)
	return _hi + _lo
}

/**
 * Computes the base-10 logarithm element-wise over a Float64Array using a
 * numerically robust double-double range-reduced algorithm.
 *
 * @param {Float64Array} input - Input values (IEEE 754 double precision).
 * @param {Float64Array} [out] - Optional preallocated output Float64Array of the same length.
 *   May alias `input` for in-place computation.
 * @returns {Float64Array} A Float64Array containing `log10(input[i])` for each index `i`.
 * @throws {TypeError} If `input` is not a Float64Array, or if `out` is provided and not a Float64Array.
 * @throws {RangeError} If `out` is provided and its length does not match `input.length`.
 */
export function log10TypedStable(input, out) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	const len = input.length
	let result
	if (out === undefined) {
		result = new Float64Array(len)
	} else {
		if (!(out instanceof Float64Array)) {
			throw new TypeError('Expected out to be a Float64Array')
		}
		if (out.length !== len) {
			throw new RangeError(
				`Output Float64Array length (${out.length}) must match input length (${len})`
			)
		}
		result = out
	}

	for (let i = 0; i < len; i++) {
		result[i] = log10ScalarStable(input[i])
	}

	return result
}
