const f64View = new Float64Array(1)
const u64View = new BigUint64Array(f64View.buffer)

const SUBNORMAL_SCALE = 2 ** 54
const SUBNORMAL_SHIFT = 54
const EXP_BIAS = 1023
const MIN_NORMAL_EXP = -1022
const MAX_NORMAL_EXP = 1023
const MIN_SUBNORMAL_EXP = -1075
const EXP_MASK = 0x7ffn
const FRAC_MASK = 0xfffffffffffffn
const ONE_EXP_BITS = 0x3ff0000000000000n

// Optimal Chebyshev linear approximation constants for 1 / d on d in [0.5, 1):
// 48 / 17 and 32 / 17 expressed as float64 literals to avoid using '/'.
const NR_INIT_INTERCEPT = 2.823529411764706
const NR_INIT_SLOPE = 1.8823529411764706
const MAX_NR_ITERATIONS = 8

// Veltkamp-Dekker splitting constant (2^27 + 1) for exact float64 product error.
const DEKKER_SPLIT = 134217729

/**
 * Checks whether a number has the IEEE-754 negative sign bit set (including -0).
 *
 * @param {number} value - The float64 number to inspect.
 * @returns {boolean} True if value is negative or -0.
 */
function isNegativeNumber(value) {
	return value < 0 || Object.is(value, -0)
}

/**
 * Decomposes a positive finite float64 value into `mantissa * 2^exponent`
 * where `mantissa` is in `[1, 2)`.
 *
 * @param {number} value - A positive finite float64 number.
 * @returns {{ mantissa: number, exponent: number }} Normalized mantissa and base-2 exponent.
 */
function decomposePositiveFloat64(value) {
	let scaled = value
	let shift = 0

	f64View[0] = scaled
	let bits = u64View[0]
	let rawExp = Number((bits >> 52n) & EXP_MASK)

	if (rawExp === 0) {
		scaled *= SUBNORMAL_SCALE
		shift = SUBNORMAL_SHIFT
		f64View[0] = scaled
		bits = u64View[0]
		rawExp = Number((bits >> 52n) & EXP_MASK)
	}

	const exponent = rawExp - EXP_BIAS - shift
	u64View[0] = ONE_EXP_BITS | (bits & FRAC_MASK)
	const mantissa = f64View[0]

	return { mantissa, exponent }
}

/**
 * Computes the exact product `a * b = hi + lo` for moderate-magnitude float64 values
 * using Dekker's splitting algorithm.
 *
 * @param {number} a - First factor (magnitude near 1).
 * @param {number} b - Second factor (magnitude near 1).
 * @returns {{ hi: number, lo: number }} High and low components of `a * b`.
 */
function twoProduct(a, b) {
	const hi = a * b

	const ca = DEKKER_SPLIT * a
	const aHi = ca - (ca - a)
	const aLo = a - aHi

	const cb = DEKKER_SPLIT * b
	const bHi = cb - (cb - b)
	const bLo = b - bHi

	const lo = ((aHi * bHi - hi) + aHi * bLo + aLo * bHi) + aLo * bLo
	return { hi, lo }
}

/**
 * Scales a normalized float64 value in `[1, 2)` by `2^exponent` without
 * intermediate overflow or double-rounding on subnormal underflow.
 *
 * @param {number} value - Normalized positive float64 in `[1, 2)`.
 * @param {number} exponent - Integer base-2 exponent.
 * @returns {number} The scaled float64 value.
 */
function scaleByPowerOfTwo(value, exponent) {
	if (exponent > MAX_NORMAL_EXP) {
		return Infinity
	}
	if (exponent < MIN_SUBNORMAL_EXP) {
		return 0
	}
	if (exponent >= MIN_NORMAL_EXP) {
		return value * (2 ** exponent)
	}
	return (value * (2 ** MIN_NORMAL_EXP)) * (2 ** (exponent - MIN_NORMAL_EXP))
}

/**
 * Divides two IEEE-754 float64 numbers (`a / b`) using an iterative
 * Newton-Raphson reciprocal computation with IEEE-754 exponent scaling
 * and exact residual refinement.
 *
 * Special-value behavior:
 * - Throws `TypeError` if either `a` or `b` is not of type `number`.
 * - Returns `NaN` if either `a` or `b` is `NaN`, or if both are infinite.
 * - Throws `RangeError` if `b` is `0` or `-0`.
 * - Preserves IEEE-754 signed zeros and infinities for zero dividends and infinite operands.
 *
 * @param {number} a - The dividend (IEEE-754 float64 number).
 * @param {number} b - The non-zero divisor (IEEE-754 float64 number).
 * @returns {number} The quotient of `a` divided by `b`.
 * @throws {TypeError} If `a` or `b` is not a number.
 * @throws {RangeError} If `b` is zero (`0` or `-0`).
 */
export function divideFloatIterative(a, b) {
	if (typeof a !== 'number') {
		throw new TypeError(`Expected dividend "a" to be a number, received ${typeof a}`)
	}
	if (typeof b !== 'number') {
		throw new TypeError(`Expected divisor "b" to be a number, received ${typeof b}`)
	}

	if (Number.isNaN(a) || Number.isNaN(b)) {
		return NaN
	}

	if (b === 0) {
		throw new RangeError('Division by zero: divisor "b" must not be 0')
	}

	const sign = isNegativeNumber(a) !== isNegativeNumber(b) ? -1 : 1

	const aFinite = Number.isFinite(a)
	const bFinite = Number.isFinite(b)

	if (!aFinite && !bFinite) {
		return NaN
	}
	if (!aFinite) {
		return sign * Infinity
	}
	if (!bFinite || a === 0) {
		return sign * 0
	}

	const { mantissa: mA, exponent: eA } = decomposePositiveFloat64(Math.abs(a))
	const { mantissa: mB, exponent: eB } = decomposePositiveFloat64(Math.abs(b))

	// Scale divisor mantissa into [0.5, 1) so the Chebyshev linear seed converges quadratically.
	const d = mB * 0.5
	let reciprocal = NR_INIT_INTERCEPT - NR_INIT_SLOPE * d

	for (let iter = 0; iter < MAX_NR_ITERATIONS; iter += 1) {
		const residual = 1 - d * reciprocal
		const next = reciprocal + reciprocal * residual
		if (next === reciprocal) {
			break
		}
		reciprocal = next
	}

	const invMB = reciprocal * 0.5
	let quotient = mA * invMB

	// One exact residual refinement step to eliminate the rounding error from multiplying mA * invMB.
	const { hi, lo } = twoProduct(quotient, mB)
	const remainder = (mA - hi) - lo
	quotient += remainder * invMB

	let resultExp = eA - eB
	while (quotient >= 2) {
		quotient *= 0.5
		resultExp += 1
	}
	while (quotient < 1) {
		quotient *= 2
		resultExp -= 1
	}

	return sign * scaleByPowerOfTwo(quotient, resultExp)
}
