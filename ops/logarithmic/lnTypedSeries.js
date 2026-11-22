/**
 * Natural logarithm over a Float64Array computed element-wise using
 * IEEE-754 binary range reduction and the hyperbolic arctangent series.
 *
 * For any positive finite x, x is decomposed into x = m * 2^k with
 * m in (sqrt(1/2), sqrt(2)], so that:
 *
 *   ln(x) = k * ln(2) + ln(m)
 *   ln(m) = 2 * (y + y^3/3 + y^5/5 + ...),  where y = (m - 1) / (m + 1)
 *
 * Because |y| <= (sqrt(2) - 1) / (sqrt(2) + 1) ~= 0.17157, the odd-power
 * series converges rapidly to full IEEE-754 double precision.
 *
 * @module ops/logarithmic/lnTypedSeries
 */

const SQRT2 = Math.SQRT2
const TWO_POW_54 = 18014398509481984 // 2^54, for normalizing subnormals
// High/low split of ln(2) (fdlibm): LN2_HI has 21 trailing zero mantissa bits
// so k * LN2_HI is exact for all valid binary64 exponents |k| <= 1075.
const LN2_HI = 6.9314718036912381649e-1
const LN2_LO = 1.90821492927058770002e-10

const scratchBuffer = new ArrayBuffer(8)
const scratchView = new DataView(scratchBuffer)

/**
 * Computes the natural logarithm of a single IEEE-754 double without
 * delegating to Math.log.
 *
 * @param {number} x
 * @returns {number}
 */
function lnScalar(x) {
	if (Number.isNaN(x) || x < 0) return Number.NaN
	if (x === 0) return Number.NEGATIVE_INFINITY
	if (x === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY
	if (x === 1) return 0

	let value = x
	let k = 0

	scratchView.setFloat64(0, value, false)
	let hi = scratchView.getUint32(0, false)
	let biasedExp = (hi >>> 20) & 0x7ff

	// Normalize subnormal positive values into normal range.
	if (biasedExp === 0) {
		value *= TWO_POW_54
		k -= 54
		scratchView.setFloat64(0, value, false)
		hi = scratchView.getUint32(0, false)
		biasedExp = (hi >>> 20) & 0x7ff
	}

	k += biasedExp - 1023

	// Extract mantissa m in [1, 2) by setting the exponent bits to 1023 (2^0).
	scratchView.setUint32(0, (hi & 0x000fffff) | 0x3ff00000, false)
	let m = scratchView.getFloat64(0, false)

	// Center m into (sqrt(1/2), sqrt(2)] so |y| <= 3 - 2*sqrt(2) ~= 0.17157.
	if (m > SQRT2) {
		m *= 0.5
		k += 1
	}

	const y = (m - 1) / (m + 1)
	const y2 = y * y

	let term = y * y2
	let tail = 0
	for (let denom = 3; denom <= 51; denom += 2) {
		const next = tail + term / denom
		if (next === tail) break
		tail = next
		term *= y2
	}

	const lnM = 2 * (y + tail)
	return k === 0 ? lnM : k * LN2_HI + (k * LN2_LO + lnM)
}

/**
 * Computes the natural logarithm element-wise over a Float64Array using
 * IEEE-754 range reduction and the atanh power series.
 *
 * @param {Float64Array} input - Input typed array of IEEE-754 float64 values.
 * @returns {Float64Array} A new Float64Array containing ln(input[i]) for each i.
 * @throws {TypeError} If `input` is not a Float64Array instance.
 */
export function lnTypedSeries(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError(
			`lnTypedSeries expects a Float64Array input, received ${input === null ? 'null' : typeof input === 'object' ? (input.constructor?.name ?? 'object') : typeof input}`
		)
	}

	const len = input.length
	const output = new Float64Array(len)

	for (let i = 0; i < len; i += 1) {
		output[i] = lnScalar(input[i])
	}

	return output
}
