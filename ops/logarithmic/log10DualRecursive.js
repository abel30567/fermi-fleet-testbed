/**
 * @fileoverview Base-10 logarithm over dual numbers `{ v, d }` using a
 * recursive / divide-and-conquer algorithm (zero dependencies).
 *
 * For a dual number `x = v + d·ε` (with `ε² = 0` and `v > 0`), the base-10
 * logarithm is:
 *   log10(v + d·ε) = log10(v) + (d / (v · ln(10)))·ε
 *
 * Algorithm:
 *   1. Recursive divide-and-conquer power-of-10 range reduction (binary-step
 *      halving over exponents 256, 128, ..., 1) decomposing `v = m · 10^e10`
 *      with `m ∈ (0.1, 10)`.
 *   2. Recursive power-of-2 range reduction decomposing `m = r · 2^e2` with
 *      `r ∈ [1/√2, √2]`.
 *   3. Recursive divide-and-conquer binary-splitting (Estrin tree) evaluation
 *      of the hyperbolic arctangent series over dual numbers:
 *        ln(r + ε) = 2·u · Σ_{k=0}^{N-1} u^(2k) / (2k + 1)
 *      where `u = (r - 1) / (r + 1) + (2 / (r + 1)²)·ε`, yielding both `ln(r)`
 *      and its forward-mode derivative `1 / r`.
 *   4. Self-contained evaluation of `ln(2)` and `ln(10) = 3·ln(2) + ln(5/4)`
 *      via the same recursive divide-and-conquer series.
 *   5. Overflow/underflow-safe recursive scaling of the derivative component
 *      by `10^(-e10) · 2^(-e2)`.
 */

/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (must be finite and strictly positive for input).
 * @property {number} d - Forward-mode derivative component (must be finite for input).
 */

/**
 * Binary-step powers of 10 for recursive divide-and-conquer range reduction.
 * Covers the full IEEE-754 double positive range (5e-324 to ~1.797e308).
 * @type {ReadonlyArray<{ exp: number, val: number }>}
 */
const POW10_STEPS = Object.freeze([
	{ exp: 256, val: 1e256 },
	{ exp: 128, val: 1e128 },
	{ exp: 64, val: 1e64 },
	{ exp: 32, val: 1e32 },
	{ exp: 16, val: 1e16 },
	{ exp: 8, val: 1e8 },
	{ exp: 4, val: 1e4 },
	{ exp: 2, val: 1e2 },
	{ exp: 1, val: 1e1 },
])

/** Number of odd-power terms in the atanh series (error < 1e-20 for |u| <= 1/3). */
const SERIES_LAST_INDEX = 19

/**
 * Add two dual numbers.
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualAdd(a, b) {
	return { v: a.v + b.v, d: a.d + b.d }
}

/**
 * Multiply two dual numbers.
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualMul(a, b) {
	return { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
}

/**
 * Recursive divide-and-conquer (binary-splitting / Estrin tree) evaluation of:
 *   S(lo, hi, w) = Σ_{k=lo}^{hi} w^(k - lo) / (2k + 1)
 * over dual numbers, returning both the partial sum and `w^(hi - lo + 1)`.
 *
 * @param {number} lo - Inclusive lower term index.
 * @param {number} hi - Inclusive upper term index.
 * @param {DualNumber} w - Dual number representing `u²`.
 * @returns {{ sum: DualNumber, power: DualNumber }}
 */
function sumAtanhSeriesDual(lo, hi, w) {
	if (lo === hi) {
		return {
			sum: { v: 1 / (2 * lo + 1), d: 0 },
			power: w,
		}
	}
	const mid = (lo + hi) >> 1
	const left = sumAtanhSeriesDual(lo, mid, w)
	const right = sumAtanhSeriesDual(mid + 1, hi, w)
	return {
		sum: dualAdd(left.sum, dualMul(left.power, right.sum)),
		power: dualMul(left.power, right.power),
	}
}

/**
 * Compute `ln(r + ε)` for `r` near 1 via recursive divide-and-conquer atanh series.
 *
 * @param {number} r - Positive number close to 1.
 * @returns {DualNumber} `{ v: ln(r), d: 1 / r }`
 */
function lnUnitSeedDual(r) {
	const denom = r + 1
	/** @type {DualNumber} */
	const u = {
		v: (r - 1) / denom,
		d: 2 / (denom * denom),
	}
	const u2 = dualMul(u, u)
	const { sum } = sumAtanhSeriesDual(0, SERIES_LAST_INDEX, u2)
	const prod = dualMul(u, sum)
	return { v: 2 * prod.v, d: 2 * prod.d }
}

/** Natural logarithm of 2 computed via the recursive atanh series: 2·atanh(1/3). */
const LN2 = lnUnitSeedDual(2).v

/** Natural logarithm of 10 computed recursively via 3·ln(2) + ln(5/4). */
const LN10 = 3 * LN2 + lnUnitSeedDual(1.25).v

/**
 * Recursive divide-and-conquer range reduction by powers of 10.
 * Decomposes `v > 0` into `v = m · 10^e10` where `m ∈ (0.1, 10)`.
 *
 * @param {number} v - Positive finite value.
 * @param {number} idx - Current index into `POW10_STEPS`.
 * @returns {{ m: number, e10: number }}
 */
function reducePow10(v, idx) {
	if (idx >= POW10_STEPS.length) {
		return { m: v, e10: 0 }
	}
	const { exp, val } = POW10_STEPS[idx]
	if (v >= val) {
		const rest = reducePow10(v / val, idx + 1)
		return { m: rest.m, e10: exp + rest.e10 }
	}
	if (v < 1 && v * val <= 1) {
		const rest = reducePow10(v * val, idx + 1)
		return { m: rest.m, e10: -exp + rest.e10 }
	}
	return reducePow10(v, idx + 1)
}

/**
 * Recursive range reduction by powers of 2.
 * Decomposes `m ∈ (0.1, 10)` into `m = r · 2^e2` where `r ∈ [1/√2, √2]`.
 *
 * @param {number} m - Positive value in `(0.1, 10)`.
 * @returns {{ r: number, e2: number }}
 */
function reducePow2(m) {
	if (m >= Math.SQRT2) {
		const rest = reducePow2(m * 0.5)
		return { r: rest.r, e2: rest.e2 + 1 }
	}
	if (m < Math.SQRT1_2) {
		const rest = reducePow2(m * 2)
		return { r: rest.r, e2: rest.e2 - 1 }
	}
	return { r: m, e2: 0 }
}

/**
 * Recursively scale `val` by `10^exp` (for integer `exp`) using binary steps,
 * avoiding intermediate overflow/underflow for extreme exponents like ±323.
 *
 * @param {number} val
 * @param {number} exp - Integer exponent.
 * @param {number} idx - Current index into `POW10_STEPS`.
 * @returns {number}
 */
function scaleByPow10(val, exp, idx) {
	if (exp === 0 || idx >= POW10_STEPS.length) {
		return val
	}
	const step = POW10_STEPS[idx]
	if (exp >= step.exp) {
		return scaleByPow10(val * step.val, exp - step.exp, idx + 1)
	}
	if (exp <= -step.exp) {
		return scaleByPow10(val / step.val, exp + step.exp, idx + 1)
	}
	return scaleByPow10(val, exp, idx + 1)
}

/**
 * Recursively scale `val` by `2^exp` for small integer `exp`.
 *
 * @param {number} val
 * @param {number} exp
 * @returns {number}
 */
function scaleByPow2(val, exp) {
	if (exp === 0) {
		return val
	}
	if (exp > 0) {
		return scaleByPow2(val * 2, exp - 1)
	}
	return scaleByPow2(val * 0.5, exp + 1)
}

/**
 * Compute the base-10 logarithm of a dual number `{ v, d }` using a recursive
 * divide-and-conquer implementation.
 *
 * @param {DualNumber} x - Input dual number `{ v, d }` with finite `v > 0` and finite `d`.
 * @returns {DualNumber} Dual number `{ v: log10(x.v), d: x.d / (x.v * ln(10)) }`.
 * @throws {TypeError} If `x` is not a non-null object or `v`/`d` are not valid numbers.
 * @throws {RangeError} If `v <= 0`, `!Number.isFinite(v)`, or `!Number.isFinite(d)`.
 */
export function log10DualRecursive(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError(
			'log10DualRecursive: input must be a dual number object { v, d }',
		)
	}

	const { v, d } = x

	if (typeof v !== 'number' || Number.isNaN(v)) {
		throw new TypeError(
			'log10DualRecursive: primal value v must be a non-NaN number',
		)
	}
	if (typeof d !== 'number' || Number.isNaN(d)) {
		throw new TypeError(
			'log10DualRecursive: derivative d must be a non-NaN number',
		)
	}
	if (!Number.isFinite(v)) {
		throw new RangeError(
			'log10DualRecursive: primal value v must be finite',
		)
	}
	if (!Number.isFinite(d)) {
		throw new RangeError(
			'log10DualRecursive: derivative d must be finite',
		)
	}
	if (v <= 0) {
		throw new RangeError(
			'log10DualRecursive: primal value v must be strictly positive (v > 0)',
		)
	}

	// Stage 1: Recursive divide-and-conquer power-of-10 reduction: v = m * 10^e10
	const { m, e10 } = reducePow10(v, 0)

	// Stage 2: Recursive power-of-2 reduction: m = r * 2^e2, r in [1/sqrt(2), sqrt(2)]
	const { r, e2 } = reducePow2(m)

	// Stage 3: Recursive divide-and-conquer series evaluation on dual (r + 1*ε)
	const lnR = lnUnitSeedDual(r)

	// Combine primal value: log10(v) = e10 + (e2 * ln(2) + ln(r)) / ln(10)
	const primal = e10 + (e2 * LN2 + lnR.v) / LN10

	// Combine derivative safely without premature overflow/underflow:
	// d' = d * 10^(-e10) * 2^(-e2) * (lnR.d / ln(10))
	const factor = scaleByPow2(lnR.d / LN10, -e2)
	const absD = Math.abs(d)
	let derivative
	if (d === 0) {
		derivative = d * factor
	} else if (e10 < 0) {
		// Scaling up by 10^(-e10): multiply by factor first unless |d| is tiny
		derivative =
			absD >= 1e-100
				? scaleByPow10(d * factor, -e10, 0)
				: scaleByPow10(d, -e10, 0) * factor
	} else {
		// Scaling down by 10^(-e10): scale first when |d| is huge
		derivative =
			absD <= 1e100
				? scaleByPow10(d * factor, -e10, 0)
				: scaleByPow10(d, -e10, 0) * factor
	}

	return { v: primal, d: derivative }
}
