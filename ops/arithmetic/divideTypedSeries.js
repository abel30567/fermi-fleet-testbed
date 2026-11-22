/**
 * @fileoverview Element-wise division over a series of Float64Array inputs
 * using IEEE-754 binary64 mantissa/exponent range reduction and the Goldschmidt
 * multiplicative series (Euler product of the geometric series) with
 * Veltkamp-Dekker exact-residual refinement.
 */

// Reusable 8-byte scratch buffer for zero-allocation IEEE-754 bit inspection.
const _scratchBuf = new ArrayBuffer(8)
const _f64 = new Float64Array(_scratchBuf)
const _u64 = new BigUint64Array(_scratchBuf)

const SIGN_MASK = 0x8000000000000000n
const ABS_MASK = 0x7fffffffffffffffn
const EXP_MASK = 0x7ffn
const FRAC_MASK = 0x000fffffffffffffn
const HALF_EXP_BITS = 0x3fen << 52n // Biased exponent 1022 -> mantissa in [0.5, 1)

// Exact binary64 powers of two for subnormal normalization and two-step ldexp.
const TWO_POW_54 = 18014398509481984 // 2^54
const TWO_POW_512 = 1.3407807929942597e154 // 2^512
const TWO_POW_NEG_512 = 7.458340731200207e-155 // 2^-512

// Minimax linear initial reciprocal approximation on [0.5, 1):
//   f0(d) = 48/17 - (32/17) * d, guaranteeing |1 - d * f0(d)| <= 1/17.
const INIT_A = 2.823529411764706 // 48 / 17
const INIT_B = 1.8823529411764706 // 32 / 17

// Veltkamp splitting factor (2^27 + 1) for exact binary64 double-double products.
const VELTKAMP_SPLIT = 134217729

/**
 * Constructs an exact IEEE-754 binary64 power of two `2^exp` for
 * `-1022 <= exp <= 1023` directly from its exponent bits.
 *
 * @param {number} exp - Integer exponent in `[-1022, 1023]`.
 * @returns {number} Exact value `2^exp`.
 */
function pow2(exp) {
	_u64[0] = BigInt(exp + 1023) << 52n
	return _f64[0]
}

/**
 * Returns the IEEE-754 sign bit (`0n` for positive / `+0`, `1n` for negative / `-0`).
 *
 * @param {number} x - Any finite or infinite binary64 number.
 * @returns {bigint} `0n` or `1n`.
 */
function signBitOf(x) {
	_f64[0] = x
	return (_u64[0] & SIGN_MASK) >> 63n
}

/**
 * Decomposes a finite, non-zero positive binary64 number `absX` into `(m, exp)`
 * such that `absX = m * 2^exp` with `m` in `[0.5, 1)`, matching C's `frexp`.
 * Writes results into the module-level `_frexpM` / `_frexpE` slots to avoid
 * per-element object allocation.
 *
 * @param {number} absX - Positive finite binary64 value (`absX > 0`).
 */
let _frexpM = 0
let _frexpE = 0
function frexpPositive(absX) {
	_f64[0] = absX
	let bits = _u64[0] & ABS_MASK
	let expBits = Number((bits >> 52n) & EXP_MASK)
	let biasAdjust = 1022

	if (expBits === 0) {
		// Subnormal input: scale by 2^54 into the normal range without rounding.
		_f64[0] = absX * TWO_POW_54
		bits = _u64[0] & ABS_MASK
		expBits = Number((bits >> 52n) & EXP_MASK)
		biasAdjust = 1076 // 1022 + 54
	}

	_u64[0] = HALF_EXP_BITS | (bits & FRAC_MASK)
	_frexpM = _f64[0]
	_frexpE = expBits - biasAdjust
}

/**
 * Scales a normalized positive mantissa `q` in `[0.5, 2)` by `2^exp` with
 * single IEEE-754 rounding across the full normal and subnormal range,
 * avoiding double rounding and premature overflow/underflow.
 *
 * @param {number} q - Positive mantissa in `[0.5, 2)`.
 * @param {number} exp - Integer power-of-two exponent.
 * @returns {number} `q * 2^exp` (or `Infinity` on overflow, `0` on underflow).
 */
function ldexpNormalized(q, exp) {
	if (exp > 1024) {
		return Infinity
	}
	if (exp === 1024) {
		return (q * TWO_POW_512) * TWO_POW_512
	}
	if (exp >= -1022) {
		return q * pow2(exp)
	}
	if (exp >= -1075) {
		// First step stays strictly normal (zero rounding); second step rounds once.
		return (q * TWO_POW_NEG_512) * pow2(exp + 512)
	}
	return 0
}

/**
 * Computes `a / b` for finite non-zero divisor `b` (and finite or infinite `a`)
 * without using the native `/` operator.
 *
 * Algorithm:
 * 1. Extract IEEE-754 sign bits and handle `a === 0` or `±Infinity` directly,
 *    preserving signed zeros and infinities.
 * 2. Range-reduce `|a| = mA * 2^eA` and `|b| = mB * 2^eB` with `mA, mB ∈ [0.5, 1)`.
 * 3. Apply the Goldschmidt multiplicative series (the Euler product identity
 *    `1 / (1 - r) = ∏_{k=0}^∞ (1 + r^(2^k))`) initialized with the minimax
 *    linear seed `f0 = 48/17 - (32/17) * mB`, giving initial relative error
 *    `|e0| <= 1/17`. Four quadratic iterations reduce `|e4| <= (1/17)^16 < 2^-65`.
 * 4. Eliminate accumulated Goldschmidt rounding drift via one Veltkamp-Dekker
 *    exact double-double residual step:
 *    `q <- q + ((mA - hi(q * mB)) - lo(q * mB)) * invB`.
 * 5. Rescale by `2^(eA - eB)` via single-rounding `ldexpNormalized` and apply sign.
 *
 * @param {number} a - Dividend (finite or `±Infinity` from intermediate overflow).
 * @param {number} b - Finite, non-zero divisor.
 * @returns {number} Quotient `a / b` within ≤ 1 ULP of IEEE-754 binary64 division.
 */
function scalarDivide(a, b) {
	const neg = (signBitOf(a) ^ signBitOf(b)) === 1n

	if (a === 0) {
		return neg ? -0 : 0
	}
	if (!Number.isFinite(a)) {
		return neg ? -Infinity : Infinity
	}

	const absA = a < 0 ? -a : a
	const absB = b < 0 ? -b : b

	frexpPositive(absA)
	const mA = _frexpM
	const eA = _frexpE

	frexpPositive(absB)
	const mB = _frexpM
	const eB = _frexpE

	// Initial minimax linear factor f0 in (16/17, 32/17) with |1 - mB * f0| <= 1/17.
	let factor = INIT_A - INIT_B * mB
	let num = mA * factor
	let den = mB * factor
	let invB = factor

	// 4 Goldschmidt multiplicative iterations:
	//   den_{k+1} = den_k * (2 - den_k) = 1 - (1 - den_k)^2
	//   num_{k+1} = num_k * (2 - den_k)
	//   invB_{k+1} = invB_k * (2 - den_k)
	for (let iter = 0; iter < 4; iter++) {
		factor = 2 - den
		num *= factor
		den *= factor
		invB *= factor
	}

	// Exact residual correction using Veltkamp-Dekker TwoProd(num, mB) = p + err.
	// Since num ∈ [0.5, 2) and mB ∈ [0.5, 1), splitting cannot overflow and
	// (mA - p) is exact by Sterbenz's lemma.
	const p = num * mB
	const cn = VELTKAMP_SPLIT * num
	const nh = cn - (cn - num)
	const nl = num - nh
	const cb = VELTKAMP_SPLIT * mB
	const bh = cb - (cb - mB)
	const bl = mB - bh
	const err = ((nh * bh - p) + nh * bl + nl * bh) + nl * bl
	const rem = (mA - p) - err
	const q = num + rem * invB

	const scaled = ldexpNormalized(q, eA - eB)
	return neg ? -scaled : scaled
}

/**
 * Computes element-wise division over two or more equal-length `Float64Array`
 * inputs, folded left-to-right (`((s_0 / s_1) / s_2) ... / s_{k-1}`).
 *
 * Each scalar division is evaluated via IEEE-754 binary64 `frexp`/`ldexp`
 * range reduction and the Goldschmidt multiplicative series (equivalent to the
 * Euler product of the geometric series `1 / (1 - r) = ∏_{k≥0} (1 + r^(2^k))`),
 * followed by a Veltkamp-Dekker exact double-double residual refinement step
 * to achieve IEEE-754 machine accuracy (≤ 1 ULP) across normal and subnormal
 * values without using the native `/` operator.
 *
 * @param {...Float64Array} series - Two or more `Float64Array` instances of
 *   identical length. All elements must be finite; all divisor elements
 *   (`series[1..k-1]`) must be non-zero.
 * @returns {Float64Array} A newly allocated `Float64Array` containing the
 *   element-wise quotients.
 * @throws {RangeError} If fewer than two arguments are provided.
 * @throws {TypeError} If any argument is not a `Float64Array`.
 * @throws {RangeError} If the input arrays do not all have the same length.
 * @throws {RangeError} If any element is `NaN` or `±Infinity`.
 * @throws {RangeError} If any element in a divisor array (`series[1..]`) is `0` or `-0`.
 */
export function divideTypedSeries(...series) {
	if (series.length < 2) {
		throw new RangeError(
			`divideTypedSeries requires at least 2 Float64Array arguments, received ${series.length}`,
		)
	}

	for (let s = 0; s < series.length; s++) {
		if (!(series[s] instanceof Float64Array)) {
			throw new TypeError(
				`Argument at index ${s} must be a Float64Array`,
			)
		}
	}

	const len = series[0].length
	for (let s = 1; s < series.length; s++) {
		if (series[s].length !== len) {
			throw new RangeError(
				`Float64Array length mismatch at argument ${s}: expected ${len}, received ${series[s].length}`,
			)
		}
	}

	// Validate all elements upfront before computing output.
	const first = series[0]
	for (let i = 0; i < len; i++) {
		if (!Number.isFinite(first[i])) {
			throw new RangeError(
				`Non-finite value at series[0][${i}]: ${first[i]}`,
			)
		}
	}
	for (let s = 1; s < series.length; s++) {
		const divisor = series[s]
		for (let i = 0; i < len; i++) {
			const val = divisor[i]
			if (!Number.isFinite(val)) {
				throw new RangeError(
					`Non-finite value at series[${s}][${i}]: ${val}`,
				)
			}
			if (val === 0) {
				throw new RangeError(
					`Division by zero at series[${s}][${i}]`,
				)
			}
		}
	}

	const result = new Float64Array(len)
	for (let i = 0; i < len; i++) {
		let acc = first[i]
		for (let s = 1; s < series.length; s++) {
			acc = scalarDivide(acc, series[s][i])
		}
		result[i] = acc
	}

	return result
}
