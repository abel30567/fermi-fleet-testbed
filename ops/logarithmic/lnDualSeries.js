/**
 * Computes the natural logarithm of a dual number `{ v, d }` representing
 * `v + d * ε` (with `ε² = 0`), carrying forward-mode automatic differentiation.
 *
 * Uses IEEE-754 binary range reduction `v = m · 2^k` with `m ∈ [1/√2, √2]`
 * followed by the area hyperbolic tangent (Mercator) series:
 *
 *   ln(m) = 2 · atanh(t) = 2t · Σ_{n=0..∞} t^{2n} / (2n + 1),  t = (m - 1) / (m + 1)
 *
 * combined with high/low split `ln(2)` reconstruction and the exact dual-number
 * derivative identity `d/dv [ln(v)] = 1 / v`, giving `ln(v + dε) = ln(v) + (d / v)ε`.
 *
 * @param {{ v: number, d: number }} x - Dual number with strictly positive finite `v` and finite `d`.
 * @returns {{ v: number, d: number }} Dual number `{ v: ln(x.v), d: x.d / x.v }`.
 * @throws {TypeError} If `x` is not a non-null plain dual-number object with numeric `v` and `d`.
 * @throws {RangeError} If `x.v` or `x.d` is not finite, or if `x.v <= 0`.
 */

const LN2_HI = 6.9314718036912381649e-1 // Top 32 bits of ln(2), exact when multiplied by |k| <= 1074
const LN2_LO = 1.90821492927058770002e-10 // Remaining low bits of ln(2)
const MIN_NORMAL = 2.2250738585072014e-308 // 2^-1022
const TWO_POW_54 = 18014398509481984 // 2^54

const floatBuf = new ArrayBuffer(8)
const floatView = new DataView(floatBuf)

/**
 * Computes ln(v) for a positive finite IEEE-754 double using range reduction
 * and the atanh series.
 *
 * @param {number} v - Strictly positive finite number.
 * @returns {number} Natural logarithm of `v`.
 */
function lnSeriesScalar(v) {
	if (v === 1) {
		return 0
	}

	let x = v
	let k = 0

	// Normalize subnormal inputs before extracting exponent bits
	if (x < MIN_NORMAL) {
		x *= TWO_POW_54
		k -= 54
	}

	floatView.setFloat64(0, x, false)
	const hi = floatView.getUint32(0, false)
	const exp = ((hi >>> 20) & 0x7ff) - 1023
	k += exp

	// Set exponent to 0 (biased 1023) so m ∈ [1, 2)
	floatView.setUint32(0, (hi & 0x000fffff) | 0x3ff00000, false)
	let m = floatView.getFloat64(0, false)

	// Center m into [1/√2, √2] so |t| <= 3 - 2√2 ≈ 0.171573
	if (m > Math.SQRT2) {
		m *= 0.5
		k += 1
	}

	// ln(m) = 2t + 2t * Σ_{n=1..∞} t^{2n} / (2n + 1)
	const t = (m - 1) / (m + 1)
	const t2 = t * t
	let tail = 0
	let power = t2

	for (let denom = 3; denom <= 45; denom += 2) {
		const term = power / denom
		tail += term
		if (term <= Number.EPSILON * 0.25 * tail) {
			break
		}
		power *= t2
	}

	const lnM = 2 * t + 2 * t * tail
	const result = k * LN2_HI + (k * LN2_LO + lnM)
	return result === 0 ? 0 : result
}

export function lnDualSeries(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number components v and d must be finite numbers')
	}

	if (v <= 0) {
		throw new RangeError('Dual number primal value v must be strictly positive (v > 0)')
	}

	const primal = lnSeriesScalar(v)
	const derivative = d === 0 ? 0 : d / v

	return { v: primal, d: derivative }
}
