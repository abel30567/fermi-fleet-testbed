/**
 * Element-wise multiplication over two {@link Float64Array} inputs using the
 * Dekker/Veltkamp splitting identity with Knuth TwoSum recombination.
 *
 * For each pair of finite non-zero IEEE-754 binary64 values `(a, b)`, both
 * operands are losslessly power-of-two scaled into a safe exponent window
 * `[2^-256, 2^256]` so that Veltkamp's splitting factor `C = 2^27 + 1` splits
 * each 53-bit significand into two exact 26-bit halves:
 *
 *   a = a_hi + a_lo,   b = b_hi + b_lo
 *
 * By the algebraic identity:
 *
 *   a * b = (a_hi * b_hi) + (a_hi * b_lo) + (a_lo * b_hi) + (a_lo * b_lo)
 *
 * all four partial products are exact in binary64 (<= 52 significant bits)
 * without intermediate overflow or subnormal underflow, and are recombined via
 * error-free TwoSum before power-of-two rescaling.
 *
 * @module ops/arithmetic/multiplyTypedSeries
 */

/** Veltkamp splitting constant for IEEE-754 binary64: 2^27 + 1. */
const VELTKAMP_SPLIT = 134217729

/** Upper magnitude threshold before power-of-two scaling down. */
const SCALE_UPPER = 2 ** 256

/** Lower magnitude threshold before power-of-two scaling up. */
const SCALE_LOWER = 2 ** -256

/** Exact power-of-two scale step (lossless exponent shift). */
const SCALE_UP = 2 ** 512
const SCALE_DOWN = 2 ** -512

/**
 * Error-free transformation computing `s + e = x + y` exactly in binary64
 * (Knuth's TwoSum algorithm).
 *
 * @param {number} x
 * @param {number} y
 * @returns {[number, number]} Exact pair `[sum, error]`.
 */
function twoSum(x, y) {
	const s = x + y
	const v = s - x
	const e = (x - (s - v)) + (y - v)
	return [s, e]
}

/**
 * Veltkamp split of a safe-range binary64 number into two exact halves
 * `x = hi + lo`, each with at most 26 significant bits.
 *
 * @param {number} x
 * @returns {[number, number]} Exact pair `[hi, lo]`.
 */
function veltkampSplit(x) {
	const c = VELTKAMP_SPLIT * x
	const hi = c - (c - x)
	const lo = x - hi
	return [hi, lo]
}

/**
 * Multiply two IEEE-754 binary64 scalars using the Dekker/Veltkamp splitting
 * identity with exact power-of-two exponent scaling and TwoSum recombination.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function dekkerMultiply(a, b) {
	if (Number.isNaN(a) || Number.isNaN(b)) {
		return NaN
	}

	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		if (a === 0 || b === 0) {
			return NaN
		}
		const negative = (a < 0) !== (b < 0)
		return negative ? -Infinity : Infinity
	}

	if (a === 0 || b === 0) {
		const negA = a < 0 || Object.is(a, -0)
		const negB = b < 0 || Object.is(b, -0)
		return negA !== negB ? -0 : 0
	}

	// Scale operands by exact powers of 2 into [2^-256, 2^256] so that
	// Veltkamp splitting and all four partial products are exact with no
	// intermediate overflow or subnormal underflow.
	let sa = a
	let sb = b
	let scaleSteps = 0

	while (Math.abs(sa) > SCALE_UPPER) {
		sa *= SCALE_DOWN
		scaleSteps += 1
	}
	while (Math.abs(sa) < SCALE_LOWER) {
		sa *= SCALE_UP
		scaleSteps -= 1
	}
	while (Math.abs(sb) > SCALE_UPPER) {
		sb *= SCALE_DOWN
		scaleSteps += 1
	}
	while (Math.abs(sb) < SCALE_LOWER) {
		sb *= SCALE_UP
		scaleSteps -= 1
	}

	const [aHi, aLo] = veltkampSplit(sa)
	const [bHi, bLo] = veltkampSplit(sb)

	// Four exact partial products in binary64 (each <= 52 significand bits).
	const pHH = aHi * bHi
	const pHL = aHi * bLo
	const pLH = aLo * bHi
	const pLL = aLo * bLo

	// Error-free TwoSum recombination of the four exact partial products.
	const [midSum, midErr] = twoSum(pHL, pLH)
	const [lowSum, lowErr] = twoSum(midSum, pLL)
	const [hiSum, hiErr] = twoSum(pHH, lowSum)
	let result = hiSum + (hiErr + (lowErr + midErr))

	// Apply inverse exact power-of-two scaling.
	while (scaleSteps > 0) {
		result *= SCALE_UP
		scaleSteps -= 1
	}
	while (scaleSteps < 0) {
		result *= SCALE_DOWN
		scaleSteps += 1
	}

	return result
}

/**
 * Performs element-wise arithmetic multiplication over two `Float64Array`
 * series using the Dekker/Veltkamp splitting identity.
 *
 * Neither input array is mutated; a new `Float64Array` of the same length is
 * returned. IEEE-754 special values (`NaN`, `±Infinity`, `±0`) follow standard
 * binary64 multiplication semantics.
 *
 * @param {Float64Array} a - First input series.
 * @param {Float64Array} b - Second input series (must match `a.length`).
 * @returns {Float64Array} Element-wise product series where `out[i] = a[i] * b[i]`.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a.length !== b.length`.
 */
export function multiplyTypedSeries(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Expected first argument "a" to be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Expected second argument "b" to be a Float64Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Float64Array length mismatch: ${a.length} !== ${b.length}`,
		)
	}

	const len = a.length
	const out = new Float64Array(len)
	for (let i = 0; i < len; i += 1) {
		out[i] = dekkerMultiply(a[i], b[i])
	}
	return out
}
