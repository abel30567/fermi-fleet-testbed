const SQRT2 = Math.SQRT2
const SQRT1_2 = Math.SQRT1_2

// High/low split of ln(2) where LN2_HI has its lowest 21 mantissa bits zeroed,
// making k * LN2_HI exact for every integer k in [-1074, 1024].
const LN2_HI = 0.6931471803691238
const LN2_LO = 1.9082149292705877e-10

// Highest term index for the atanh tail series on [SQRT1_2, SQRT2].
// Since |s| <= 3 - 2*sqrt(2) ~= 0.17157, s^2 <= 0.02944 and
// (s^2)^12 / 25 < 2e-20 << 2^-53.
const MAX_SERIES_TERM = 12

/**
 * Recursively scales a positive float64 `m > SQRT2` down into `(SQRT1_2, SQRT2]`
 * using divide-and-conquer binary exponent halving (`512 -> 256 -> ... -> 1`).
 * Each multiplication by an exact power of two preserves all mantissa bits.
 *
 * @param {number} m - Positive finite float64 value > SQRT2.
 * @param {number} step - Current power-of-two exponent step.
 * @returns {{ m: number, k: number }} Reduced mantissa `m` and base-2 exponent `k` with `input = m * 2^k`.
 */
function reduceLargeRecursive(m, step) {
	if (step === 0) {
		return m > SQRT2 ? { m: m * 0.5, k: 1 } : { m, k: 0 }
	}
	const threshold = 2 ** step
	if (m >= threshold) {
		const scaled = m * (2 ** -step)
		const nextStep = scaled >= threshold ? step : step >> 1
		const res = reduceLargeRecursive(scaled, nextStep)
		return { m: res.m, k: res.k + step }
	}
	return reduceLargeRecursive(m, step >> 1)
}

/**
 * Recursively scales a positive float64 `0 < m < SQRT1_2` up into `[SQRT1_2, SQRT2)`
 * using divide-and-conquer binary exponent halving (`512 -> 256 -> ... -> 1`).
 * Handles IEEE-754 subnormals down to `Number.MIN_VALUE` without losing mantissa bits.
 *
 * @param {number} m - Positive finite float64 value < SQRT1_2.
 * @param {number} step - Current power-of-two exponent step.
 * @returns {{ m: number, k: number }} Reduced mantissa `m` and base-2 exponent `k` with `input = m * 2^k`.
 */
function reduceSmallRecursive(m, step) {
	if (step === 0) {
		return m < SQRT1_2 ? { m: m * 2, k: -1 } : { m, k: 0 }
	}
	const threshold = 2 ** -step
	if (m < threshold) {
		const scaled = m * (2 ** step)
		const nextStep = scaled < threshold ? step : step >> 1
		const res = reduceSmallRecursive(scaled, nextStep)
		return { m: res.m, k: res.k - step }
	}
	return reduceSmallRecursive(m, step >> 1)
}

/**
 * Recursively decomposes a positive finite float64 `x` into `m * 2^k`
 * where `m` is in `[SQRT1_2, SQRT2]` and `k` is an integer.
 *
 * @param {number} x - Positive finite float64 value.
 * @returns {{ m: number, k: number }} Exact mantissa and exponent decomposition.
 */
function reduceRangeRecursive(x) {
	if (x > SQRT2) {
		return reduceLargeRecursive(x, 512)
	}
	if (x < SQRT1_2) {
		return reduceSmallRecursive(x, 512)
	}
	return { m: x, k: 0 }
}

/**
 * Recursively evaluates the shifted atanh tail series over `[lo, hi]` via
 * divide-and-conquer binary splitting:
 *
 *   sum = sum_{n=lo}^{hi} (s2^(n - lo)) / (2n + 1)
 *   pow = s2^(hi - lo + 1)
 *
 * @param {number} s2 - Squared transformed argument `s^2`.
 * @param {number} lo - Inclusive lower term index (`>= 1`).
 * @param {number} hi - Inclusive upper term index (`>= lo`).
 * @returns {{ sum: number, pow: number }} Partial shifted sum and span power of `s2`.
 */
function sumAtanhTailRecursive(s2, lo, hi) {
	if (lo === hi) {
		return { sum: 1 / (2 * lo + 1), pow: s2 }
	}
	const mid = (lo + hi) >> 1
	const left = sumAtanhTailRecursive(s2, lo, mid)
	const right = sumAtanhTailRecursive(s2, mid + 1, hi)
	return {
		sum: left.sum + left.pow * right.sum,
		pow: left.pow * right.pow,
	}
}

/**
 * Computes the natural logarithm `ln(x)` over IEEE-754 float64 numbers using a
 * recursive divide-and-conquer algorithm:
 *
 * 1. Recursive binary-step range reduction decomposes `x = m * 2^k` with
 *    `m` in `[SQRT1_2, SQRT2]`.
 * 2. Setting `f = m - 1` (exact by Sterbenz's lemma) and `s = f / (2 + f)`,
 *    the identity `ln(1 + f) = f - s * (f - 2 * s^2 * sum_{n>=1} s^(2n-2)/(2n+1))`
 *    is evaluated via recursive divide-and-conquer summation of the tail series.
 * 3. Reconstructs `ln(x) = k * LN2_HI + (lnM + k * LN2_LO)` using a high/low
 *    split of `ln(2)` to preserve full IEEE-754 float64 accuracy.
 *
 * Special IEEE-754 values follow standard semantics:
 * - `NaN` or `x < 0` -> `NaN`
 * - `0` or `-0` -> `-Infinity`
 * - `1` -> `+0`
 * - `+Infinity` -> `+Infinity`
 *
 * @param {number} x - Input IEEE-754 float64 number.
 * @returns {number} Natural logarithm of `x`.
 * @throws {TypeError} If `x` is not a JavaScript `number`.
 */
export function lnFloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`lnFloatRecursive expected a number, got ${x === null ? 'null' : typeof x}`)
	}

	if (Number.isNaN(x) || x < 0) {
		return NaN
	}
	if (x === 0) {
		return -Infinity
	}
	if (x === Infinity) {
		return Infinity
	}
	if (x === 1) {
		return 0
	}

	const { m, k } = reduceRangeRecursive(x)
	const f = m - 1
	const s = f / (2 + f)
	const s2 = s * s
	const tail = sumAtanhTailRecursive(s2, 1, MAX_SERIES_TERM).sum
	const lnM = f - s * (f - 2 * s2 * tail)

	if (k === 0) {
		return lnM
	}
	return k * LN2_HI + (lnM + k * LN2_LO)
}
