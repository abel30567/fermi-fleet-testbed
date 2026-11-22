/**
 * Element-wise discrete product over one or more `Float64Array` inputs using
 * an identity- and series-based logarithmic-exponential algorithm.
 *
 * Mathematical identity:
 * For finite real inputs x_0, x_1, ..., x_{k-1} at index i:
 *   - Decompose each nonzero factor into sign s_j in {-1, +1}, base-2 exponent e_j in Z,
 *     and reduced significand m_j in [sqrt(2)/2, sqrt(2)].
 *   - Compute the product via the product-to-sum identity:
 *       prod_j x_j = (prod_j s_j) * 2^(sum_j e_j) * exp(sum_j ln(m_j))
 *   - Evaluate ln(m_j) via the hyperbolic-arctangent power series:
 *       ln(m) = 2 * sum_{n=0..inf} u^(2n+1) / (2n + 1),  where u = (m - 1) / (m + 1)
 *   - Accumulate sum_j ln(m_j) with Neumaier compensated summation.
 *   - Range-reduce y = q * ln(2) + r (|r| <= ln(2)/2) using a Cody-Waite split of ln(2),
 *     evaluate exp(r) via the Maclaurin series sum_{n=0..inf} r^n / n!, and scale by 2^(sum_j e_j + q).
 *
 * Separating the binary exponent sum avoids spurious intermediate overflow and
 * underflow when intermediate partial products exceed IEEE-754 double range
 * even though the final result is representable.
 */

const SQRT2 = Math.SQRT2
const INV_LN2 = Math.LOG2E
// Cody-Waite high/low split of ln(2): LN2_HI has 33 exact significand bits (bottom 20 bits zero),
// so k * LN2_HI is exact in IEEE-754 float64 for |k| <= 2^20.
const LN2_HI = 0.6931471803691238
const LN2_LO = 1.9082149292705877e-10
const POW2_54 = 2 ** 54
const POW2_1023 = 2 ** 1023
const POW2_NEG_1022 = 2 ** -1022
const SIGN_BIT = 1n << 63n
const EXP_MASK = 0x7ffn
const FRAC_MASK = 0xfffffffffffffn
const EXP_ZERO_BIAS = 1023n << 52n

const scratchF64 = new Float64Array(1)
const scratchU64 = new BigUint64Array(scratchF64.buffer)

/**
 * Evaluates ln(m) for m in [sqrt(2)/2, sqrt(2)] using the odd-power series
 *   ln(m) = 2 * sum_{n=0}^{inf} u^(2n+1) / (2n + 1),  u = (m - 1) / (m + 1).
 * Because |u| <= 3 - 2*sqrt(2) < 0.1716, the series reaches IEEE-754 float64
 * accuracy within ~12 terms.
 *
 * @param {number} m - Reduced significand in [sqrt(2)/2, sqrt(2)].
 * @returns {number} Natural logarithm of m.
 */
function logSeries(m) {
	if (m === 1) return 0
	const u = (m - 1) / (m + 1)
	const u2 = u * u
	let power = u
	let sum = u
	for (let denom = 3; denom < 64; denom += 2) {
		power *= u2
		const term = power / denom
		sum += term
		if (Math.abs(term) <= Math.abs(sum) * 1e-17) {
			break
		}
	}
	return 2 * sum
}

/**
 * Evaluates exp(r) for |r| <= ln(2)/2 using the Maclaurin series
 *   exp(r) = sum_{n=0}^{inf} r^n / n!.
 *
 * @param {number} r - Reduced exponent argument with |r| <= ln(2)/2.
 * @returns {number} Value of exp(r).
 */
function expSeries(r) {
	if (r === 0) return 1
	let sum = 1
	let term = 1
	for (let n = 1; n < 32; n++) {
		term = (term * r) / n
		sum += term
		if (Math.abs(term) <= Math.abs(sum) * 1e-17) {
			break
		}
	}
	return sum
}

/**
 * Scales a finite double `val` by 2^exp without premature intermediate overflow
 * or underflow, preserving subnormal results and IEEE-754 overflow semantics.
 *
 * @param {number} val - Finite significand value.
 * @param {number} exp - Integer base-2 exponent.
 * @returns {number} val * 2^exp.
 */
function scalePow2(val, exp) {
	if (val === 0 || exp === 0) return val
	let v = val
	let e = exp
	while (e > 1023) {
		v *= POW2_1023
		e -= 1023
		if (!Number.isFinite(v)) return v
	}
	while (e < -1022) {
		v *= POW2_NEG_1022
		e += 1022
		if (v === 0) return v
	}
	return v * 2 ** e
}

/**
 * Computes the element-wise discrete product across one or more `Float64Array`
 * inputs of equal length using a log-exp identity and power-series evaluation.
 *
 * @param {...Float64Array} arrays - One or more `Float64Array` instances of identical length,
 *   containing only finite numbers (no `NaN`, `Infinity`, or `-Infinity`).
 * @returns {Float64Array} A new `Float64Array` where element `i` is the product
 *   of `arrays[0][i] * arrays[1][i] * ... * arrays[k - 1][i]`.
 * @throws {TypeError} If no arguments are supplied or any argument is not a `Float64Array`.
 * @throws {RangeError} If input arrays differ in length or contain non-finite values.
 */
export function productTypedSeries(...arrays) {
	const count = arrays.length
	if (count === 0) {
		throw new TypeError('productTypedSeries requires at least one Float64Array input')
	}

	let expectedLength = -1
	for (let a = 0; a < count; a++) {
		const arr = arrays[a]
		if (!(arr instanceof Float64Array)) {
			throw new TypeError(`Argument at index ${a} must be a Float64Array`)
		}
		if (expectedLength === -1) {
			expectedLength = arr.length
		} else if (arr.length !== expectedLength) {
			throw new RangeError(
				`All Float64Array inputs must have the same length (expected ${expectedLength}, got ${arr.length} at index ${a})`
			)
		}
		for (let i = 0; i < arr.length; i++) {
			if (!Number.isFinite(arr[i])) {
				throw new RangeError(
					`Non-finite value ${arr[i]} at argument ${a}, index ${i}`
				)
			}
		}
	}

	const result = new Float64Array(expectedLength)

	for (let i = 0; i < expectedLength; i++) {
		let negative = false
		let hasZero = false
		let expSum = 0
		let logSum = 0
		let logComp = 0

		for (let a = 0; a < count; a++) {
			const x = arrays[a][i]
			scratchF64[0] = x
			const bits = scratchU64[0]

			if ((bits & SIGN_BIT) !== 0n) {
				negative = !negative
			}

			if (x === 0) {
				hasZero = true
				continue
			}

			if (hasZero) {
				// Still iterate remaining arrays to preserve IEEE-754 signed zero parity.
				continue
			}

			const magBits = bits & ~SIGN_BIT
			let biasedExp = Number((magBits >> 52n) & EXP_MASK)
			let exp
			let mantissa

			if (biasedExp === 0) {
				// Subnormal: normalize by multiplying by 2^54.
				scratchF64[0] = Math.abs(x) * POW2_54
				const normBits = scratchU64[0]
				biasedExp = Number((normBits >> 52n) & EXP_MASK)
				exp = biasedExp - 1023 - 54
				scratchU64[0] = EXP_ZERO_BIAS | (normBits & FRAC_MASK)
				mantissa = scratchF64[0]
			} else {
				exp = biasedExp - 1023
				scratchU64[0] = EXP_ZERO_BIAS | (magBits & FRAC_MASK)
				mantissa = scratchF64[0]
			}

			// Reduce mantissa from [1, 2) to [sqrt(2)/2, sqrt(2)] for rapid series convergence.
			if (mantissa > SQRT2) {
				mantissa *= 0.5
				exp += 1
			}

			expSum += exp

			// Neumaier compensated summation for ln(mantissa).
			const lnM = logSeries(mantissa)
			const t = logSum + lnM
			if (Math.abs(logSum) >= Math.abs(lnM)) {
				logComp += logSum - t + lnM
			} else {
				logComp += lnM - t + logSum
			}
			logSum = t
		}

		if (hasZero) {
			result[i] = negative ? -0 : 0
			continue
		}

		const totalLog = logSum + logComp
		const q = Math.round(totalLog * INV_LN2)
		const r = totalLog - q * LN2_HI - q * LN2_LO
		const scaled = scalePow2(expSeries(r), expSum + q)
		result[i] = negative ? -scaled : scaled
	}

	return result
}
