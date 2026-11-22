/**
 * Complex natural logarithm computed via recursive argument reduction and
 * divide-and-conquer binary-splitting series evaluation.
 *
 * Conventions:
 * - Complex numbers are represented as objects `{ re, im }` with finite real numbers.
 * - Returns the principal value `Ln(z) = ln|z| + i * Arg(z)` with `Arg(z) in (-pi, pi]`.
 * - On the negative real axis (`re < 0, im === 0`, including `-0`), `Arg(z) = +pi`.
 * - `-0` components are normalized to `0`.
 *
 * Algorithm:
 * 1. Recursive dyadic scaling factors `z = 2^e * m` using exact power-of-two shifts
 *    so that `max(|m.re|, |m.im|) in [0.5, 2)` without overflow or underflow across
 *    the entire IEEE-754 float64 range (while leaving values already in `[0.5, 2)`
 *    unscaled to avoid catastrophic cancellation near `z = 1`).
 * 2. Recursive square-root argument reduction computes `Ln(1 + u) = 2 * Ln(1 + v)`
 *    where `v = u / (1 + sqrt(1 + u))` (cancellation-free), halving the complex
 *    argument and shrinking `|u|` until `|u| <= 0.125`.
 * 3. In the base case `|u| <= 0.125`, `Ln(1 + u) = 2 * atanh(w)` with `w = u / (2 + u)`
 *    is evaluated via divide-and-conquer binary splitting of the odd series
 *    `sum_{k=0}^{N-1} (w^2)^k / (2k + 1)` (8 terms suffice for >66 bits of accuracy).
 * 4. Finally, `Ln(z) = e * Ln(2) + Ln(m)`, where `Ln(2)` is computed by the same
 *    recursive algorithm.
 */

const REDUCTION_THRESHOLD = 0.125
const SERIES_TERMS = 8

/**
 * Normalize `-0` to `0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Overflow/underflow-safe Euclidean norm `sqrt(a^2 + b^2)`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function hypot2(a, b) {
	const ax = Math.abs(a)
	const ay = Math.abs(b)
	const max = ax > ay ? ax : ay
	if (max === 0) return 0
	const min = ax > ay ? ay : ax
	const ratio = min / max
	return max * Math.sqrt(1 + ratio * ratio)
}

/**
 * Complex multiplication `a * b`.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Complex addition `a + b`.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function complexAdd(a, b) {
	return {
		re: a.re + b.re,
		im: a.im + b.im,
	}
}

/**
 * Complex division `a / b` using Smith's scaling formula for numerical stability.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function complexDiv(a, b) {
	if (Math.abs(b.re) >= Math.abs(b.im)) {
		const r = b.im / b.re
		const denom = b.re + b.im * r
		return {
			re: (a.re + a.im * r) / denom,
			im: (a.im - a.re * r) / denom,
		}
	}
	const r = b.re / b.im
	const denom = b.im + b.re * r
	return {
		re: (a.re * r + a.im) / denom,
		im: (a.im * r - a.re) / denom,
	}
}

/**
 * Principal complex square root `sqrt(z)` with `Re(sqrt(z)) >= 0`.
 * For negative real numbers (`re < 0, im === 0`), returns `{ re: 0, im: sqrt(-re) }`.
 *
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function complexSqrt(z) {
	const r = hypot2(z.re, z.im)
	if (r === 0) {
		return { re: 0, im: 0 }
	}
	if (z.re >= 0) {
		const re = Math.sqrt(0.5 * (r + z.re))
		const im = re === 0 ? 0 : z.im / (2 * re)
		return { re, im }
	}
	const t = Math.sqrt(0.5 * (r - z.re))
	const im = z.im < 0 ? -t : t
	const re = Math.abs(z.im) / (2 * t)
	return { re, im }
}

/**
 * Recursively scale down a complex number with `max(|re|, |im|) >= 2` by exact
 * powers of 2 until `max(|re|, |im|) in [1, 2)`.
 *
 * @param {number} re
 * @param {number} im
 * @param {number} step
 * @param {number} exp
 * @returns {{ re: number, im: number, exp: number }}
 */
function scaleDownRecursive(re, im, step, exp) {
	if (step < 1) {
		return { re, im, exp }
	}
	const max = Math.max(Math.abs(re), Math.abs(im))
	const threshold = 2 ** step
	if (max >= threshold) {
		const invScale = 2 ** -step
		return scaleDownRecursive(re * invScale, im * invScale, step / 2, exp + step)
	}
	return scaleDownRecursive(re, im, step / 2, exp)
}

/**
 * Recursively scale up a complex number with `0 < max(|re|, |im|) < 0.5` by exact
 * powers of 2 until `max(|re|, |im|) in [0.5, 1)`.
 *
 * @param {number} re
 * @param {number} im
 * @param {number} step
 * @param {number} exp
 * @returns {{ re: number, im: number, exp: number }}
 */
function scaleUpRecursive(re, im, step, exp) {
	if (step < 1) {
		return { re, im, exp }
	}
	const max = Math.max(Math.abs(re), Math.abs(im))
	const threshold = 2 ** -step
	if (max < threshold) {
		const scale = 2 ** step
		// Subnormal numbers (down to 2^-1074) may need two 2^512 shifts.
		const nextStep = step === 512 && max * scale < threshold ? 512 : step / 2
		return scaleUpRecursive(re * scale, im * scale, nextStep, exp - step)
	}
	return scaleUpRecursive(re, im, step / 2, exp)
}

/**
 * Factor `z = 2^exp * { re, im }` with `max(|re|, |im|) in [0.5, 2)`.
 * Values already in `[0.5, 2)` are left unscaled (`exp = 0`).
 *
 * @param {number} re
 * @param {number} im
 * @returns {{ re: number, im: number, exp: number }}
 */
function dyadicScale(re, im) {
	const max = Math.max(Math.abs(re), Math.abs(im))
	if (max >= 2) {
		return scaleDownRecursive(re, im, 512, 0)
	}
	if (max < 0.5) {
		return scaleUpRecursive(re, im, 512, 0)
	}
	return { re, im, exp: 0 }
}

/**
 * Divide-and-conquer binary-splitting evaluation of the odd atanh series:
 * `sum_{k=lo}^{hi-1} q^(k - lo) / (2k + 1)` together with `pow = q^(hi - lo)`.
 *
 * @param {{ re: number, im: number }} q
 * @param {number} lo
 * @param {number} hi
 * @returns {{ sum: { re: number, im: number }, pow: { re: number, im: number } }}
 */
function binarySplitAtanhSeries(q, lo, hi) {
	if (hi - lo === 1) {
		return {
			sum: { re: 1 / (2 * lo + 1), im: 0 },
			pow: q,
		}
	}
	const mid = (lo + hi) >>> 1
	const left = binarySplitAtanhSeries(q, lo, mid)
	const right = binarySplitAtanhSeries(q, mid, hi)
	return {
		sum: complexAdd(left.sum, complexMul(left.pow, right.sum)),
		pow: complexMul(left.pow, right.pow),
	}
}

/**
 * Recursively compute `Ln(1 + u)` using square-root argument reduction:
 *   `Ln(1 + u) = 2 * Ln(1 + v)`, where `v = u / (1 + sqrt(1 + u))`
 * until `|u| <= REDUCTION_THRESHOLD`, then evaluate `2 * atanh(u / (2 + u))`
 * using divide-and-conquer binary splitting.
 *
 * @param {{ re: number, im: number }} u
 * @returns {{ re: number, im: number }}
 */
function lnOnePlusRecursive(u) {
	if (hypot2(u.re, u.im) <= REDUCTION_THRESHOLD) {
		if (u.re === 0 && u.im === 0) {
			return { re: 0, im: 0 }
		}
		const w = complexDiv(u, { re: 2 + u.re, im: u.im })
		const q = complexMul(w, w)
		const { sum } = binarySplitAtanhSeries(q, 0, SERIES_TERMS)
		const half = complexMul(w, sum)
		return { re: 2 * half.re, im: 2 * half.im }
	}

	const root = complexSqrt({ re: 1 + u.re, im: u.im })
	const nextU = complexDiv(u, { re: 1 + root.re, im: root.im })
	const halfLn = lnOnePlusRecursive(nextU)
	return { re: 2 * halfLn.re, im: 2 * halfLn.im }
}

// Compute ln(2) using the same recursive algorithm for dyadic exponent reconstruction.
const LN2 = lnOnePlusRecursive({ re: 1, im: 0 }).re

/**
 * Compute the principal natural logarithm `Ln(z)` of a nonzero complex number `z = { re, im }`
 * using recursive dyadic scaling, recursive square-root argument reduction, and
 * divide-and-conquer binary-splitting series evaluation.
 *
 * @param {{ re: number, im: number }} z - Nonzero complex number with finite `re` and `im`.
 * @returns {{ re: number, im: number }} The principal value `ln|z| + i * Arg(z)` with `Arg(z) in (-pi, pi]`.
 * @throws {TypeError} If `z` is not a plain-like object with numeric `re` and `im` properties.
 * @throws {RangeError} If `z.re` or `z.im` is non-finite (`NaN`, `Infinity`, `-Infinity`), or if `z` is `0 + 0i`.
 */
export function lnComplexRecursive(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('z must be an object with finite numeric re and im properties')
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('z.re and z.im must be numbers')
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('z.re and z.im must be finite numbers')
	}

	const re = normalizeZero(z.re)
	const im = normalizeZero(z.im)

	if (re === 0 && im === 0) {
		throw new RangeError('Complex logarithm is undefined at 0 + 0i')
	}

	const { re: scaledRe, im: scaledIm, exp } = dyadicScale(re, im)
	const reduced = lnOnePlusRecursive({ re: scaledRe - 1, im: scaledIm })

	return {
		re: normalizeZero(reduced.re + exp * LN2),
		im: normalizeZero(reduced.im),
	}
}
