/**
 * Base-2 logarithm over dual numbers `{ v, d }` using IEEE-754 range reduction,
 * an artanh odd-power Taylor series for the primal value, and first-order
 * dual-number series truncation for the forward-mode derivative.
 *
 * For a dual number `x = v + d·ε` (with `ε² = 0` and `v > 0`):
 *
 *   log2(v + d·ε) = log2(v) + log2(1 + (d / v)·ε)
 *                 = log2(v) + (d / (v · ln 2))·ε
 *
 * Where `v = m · 2^k` with `m ∈ [√(1/2), √2]` and `y = (m - 1) / (m + 1)`:
 *
 *   ln(m)   = 2y · (1 + y²/3 + y⁴/5 + ... + y²²/23)
 *   log2(v) = k + ln(m) · log2(e)
 */

const f64 = new Float64Array(1)
const u64 = new BigUint64Array(f64.buffer)

const MIN_NORMAL = 2.2250738585072014e-308 // 2^-1022
const SUBNORMAL_SCALE = 18014398509481984 // 2^54
const SUBNORMAL_SHIFT = 54
const MANTISSA_MASK = 0x000fffffffffffffn
const EXP_ZERO_BITS = 0x3ff0000000000000n // IEEE-754 biased exponent 1023 (2^0)

/**
 * Computes `log2(v)` for a finite positive number `v` via range reduction
 * and the artanh Taylor series.
 *
 * @param {number} v - Finite positive real number.
 * @returns {number} Base-2 logarithm of `v`.
 */
function log2SeriesPrimal(v) {
	let x = v
	let k = 0

	if (x < MIN_NORMAL) {
		x *= SUBNORMAL_SCALE
		k -= SUBNORMAL_SHIFT
	}

	f64[0] = x
	const bits = u64[0]
	const biasedExp = Number((bits >> 52n) & 0x7ffn)
	k += biasedExp - 1023

	u64[0] = (bits & MANTISSA_MASK) | EXP_ZERO_BITS
	let m = f64[0]

	if (m > Math.SQRT2) {
		m *= 0.5
		k += 1
	}

	const y = (m - 1) / (m + 1)
	const s = y * y

	// Horner evaluation of sum_{j=1}^{11} s^(j-1) / (2j + 1)
	// Since |y| <= (sqrt(2) - 1) / (sqrt(2) + 1) ≈ 0.17157, the remainder is < 1e-20.
	const tail =
		1 / 3 +
		s *
			(1 / 5 +
				s *
					(1 / 7 +
						s *
							(1 / 9 +
								s *
									(1 / 11 +
										s *
											(1 / 13 +
												s *
													(1 / 15 +
														s *
															(1 / 17 +
																s * (1 / 19 + s * (1 / 21 + s * (1 / 23))))))))))

	const lnM = 2 * y + 2 * y * s * tail
	const result = k + lnM * Math.LOG2E
	return result === 0 ? 0 : result
}

/**
 * Evaluates the base-2 logarithm of a dual number `{ v, d }`.
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite positive `v` and finite `d`.
 * @returns {{ v: number, d: number }} Resulting dual number `{ v: log2(x.v), d: x.d / (x.v * Math.LN2) }`.
 * @throws {TypeError} If `x` is not a plain-like object with numeric `v` and `d` properties.
 * @throws {RangeError} If `x.v` is not a finite positive number or `x.d` is not a finite number.
 */
export function log2DualSeries(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers')
	}

	if (!Number.isFinite(v) || v <= 0) {
		throw new RangeError('Dual number value v must be a finite positive number')
	}

	if (!Number.isFinite(d)) {
		throw new RangeError('Dual number derivative d must be a finite number')
	}

	const val = log2SeriesPrimal(v)
	const der = d === 0 ? 0 : (d / v) * Math.LOG2E

	return { v: val, d: der }
}
