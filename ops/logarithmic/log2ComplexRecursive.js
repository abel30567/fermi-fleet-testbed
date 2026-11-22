/**
 * Base-2 complex logarithm using a recursive divide-and-conquer algorithm.
 *
 * Computes the principal value of log2(z) for a nonzero finite complex number
 * z = { re, im }:
 *
 *   log2(z) = ln(z) / ln(2) = log2(|z|) + i * (Arg(z) / ln(2))
 *
 * Principal branch convention:
 * - Arg(z) lies in (-pi, pi], with the branch cut along the negative real axis
 *   (-Infinity, 0), where Arg(-r + 0i) = +pi for r > 0.
 * - Signed zero (-0) in inputs and outputs is normalized to +0.
 *
 * Algorithm (three-stage recursive divide-and-conquer):
 * 1. Recursive binary exponent scaling: extracts an exact integer power-of-2
 *    scale k by recursively halving exponent steps (512, 256, ..., 1) so that
 *    w = 2^(-k) * z avoids overflow/underflow across the full IEEE-754 range
 *    (including subnormals and near-MAX_VALUE inputs), followed by octave
 *    adjustment so |w| lies in [2^(-1/2), 2^(1/2)).
 * 2. Recursive complex square-root argument/magnitude halving:
 *    - While Re(w) < |Im(w)| (i.e. |Arg(w)| > pi/4), recursively applies
 *      ln(w) = 2 * ln(sqrt(w)) using the numerically stable principal complex
 *      square root (at most 2 steps).
 *    - Switches to the cancellation-free displacement d = w - 1 and recursively
 *      applies ln(1 + d) = 2 * ln(1 + d / (sqrt(1 + d) + 1)) until |d| <= 1/16.
 * 3. Divide-and-conquer artanh series evaluation: for u = d / (2 + d), computes
 *    2 * u * sum_{n=0}^{7} (u^2)^n / (2n + 1) via recursive binary splitting
 *    of the summation range [lo, hi), achieving full IEEE-754 double precision.
 *
 * Finally, log2(z) = { re: k + Re(ln(w)) / ln(2), im: Im(ln(w)) / ln(2) }.
 *
 * @param {{ re: number, im: number }} z - Nonzero finite complex number.
 * @returns {{ re: number, im: number }} Principal value of log2(z).
 * @throws {TypeError} If z is not a non-null plain object with numeric re and im properties.
 * @throws {RangeError} If re or im is non-finite (NaN, Infinity, -Infinity), or if z is 0 + 0i.
 */

const LN2 = Math.LN2
const SQRT2 = Math.SQRT2
const SQRT1_2 = Math.SQRT1_2
const MAX_D_SQ = 1 / 256 // |d| <= 1/16 => |u| <= 1/31 => |u^2|^8 / 17 < 1e-25
const SERIES_TERMS = 8

/**
 * Normalize -0 to +0.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Multiply two complex numbers.
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
 * Divide complex number a by b (safe for well-scaled b with |b| around O(1)).
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function complexDiv(a, b) {
	const denom = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom,
	}
}

/**
 * Numerically stable principal complex square root of a well-scaled complex number.
 * Assumes z is scaled so |z| is O(1) (no overflow or underflow in hypot).
 * Branch convention: Re(sqrt(z)) >= 0; for negative reals (im === 0, re < 0),
 * returns { re: 0, im: sqrt(-re) }.
 *
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function complexSqrtPrincipal(z) {
	const r = Math.hypot(z.re, z.im)
	if (r === 0) {
		return { re: 0, im: 0 }
	}
	if (z.re >= 0) {
		const re = Math.sqrt(0.5 * (r + z.re))
		const im = z.im === 0 ? 0 : z.im / (2 * re)
		return { re, im }
	}
	const imMag = Math.sqrt(0.5 * (r - z.re))
	const im = z.im < 0 ? -imMag : imMag
	const re = z.im === 0 ? 0 : Math.abs(z.im) / (2 * imMag)
	return { re, im }
}

/**
 * Stage 1a: Recursively scale (re, im) by exact powers of 2 until
 * max(|re|, |im|) lies in [0.5, 2), using divide-and-conquer step halving.
 *
 * @param {number} re
 * @param {number} im
 * @param {number} step - Current power-of-2 exponent step (starts at 512).
 * @param {number} k - Accumulated integer binary exponent.
 * @returns {{ re: number, im: number, k: number }}
 */
function scaleByPowerOfTwoRecursive(re, im, step, k) {
	if (step === 0) {
		return { re, im, k }
	}
	const maxAbs = Math.max(Math.abs(re), Math.abs(im))
	const hiThreshold = 2 ** step
	const loThreshold = 2 ** -step

	if (maxAbs >= hiThreshold) {
		return scaleByPowerOfTwoRecursive(
			re * loThreshold,
			im * loThreshold,
			step,
			k + step,
		)
	}
	if (maxAbs < loThreshold) {
		return scaleByPowerOfTwoRecursive(
			re * hiThreshold,
			im * hiThreshold,
			step,
			k - step,
		)
	}
	return scaleByPowerOfTwoRecursive(re, im, step >> 1, k)
}

/**
 * Stage 1b: Recursively adjust a well-scaled complex number by factors of 2
 * so that its modulus |w| lies in [2^(-1/2), 2^(1/2)).
 * This guarantees |Re(log2(w))| <= 0.5 and eliminates cancellation with k.
 *
 * @param {number} re
 * @param {number} im
 * @param {number} k
 * @returns {{ re: number, im: number, k: number }}
 */
function adjustToUnitOctaveRecursive(re, im, k) {
	const r = Math.hypot(re, im)
	if (r >= SQRT2) {
		return adjustToUnitOctaveRecursive(re * 0.5, im * 0.5, k + 1)
	}
	if (r < SQRT1_2) {
		return adjustToUnitOctaveRecursive(re * 2, im * 2, k - 1)
	}
	return { re, im, k }
}

/**
 * Stage 3: Divide-and-conquer evaluation of the partial artanh series:
 *   S(lo, hi) = sum_{n=lo}^{hi-1} (u2)^(n - lo) / (2n + 1)
 * along with pow = (u2)^(hi - lo).
 *
 * @param {{ re: number, im: number }} u2 - Square of u = d / (2 + d).
 * @param {number} lo - Inclusive start term index.
 * @param {number} hi - Exclusive end term index.
 * @returns {{ sum: { re: number, im: number }, pow: { re: number, im: number } }}
 */
function evalArtanhSeriesDivideAndConquer(u2, lo, hi) {
	if (hi - lo === 1) {
		return {
			sum: { re: 1 / (2 * lo + 1), im: 0 },
			pow: u2,
		}
	}
	const mid = (lo + hi) >> 1
	const left = evalArtanhSeriesDivideAndConquer(u2, lo, mid)
	const right = evalArtanhSeriesDivideAndConquer(u2, mid, hi)
	const shiftedRight = complexMul(left.pow, right.sum)
	return {
		sum: {
			re: left.sum.re + shiftedRight.re,
			im: left.sum.im + shiftedRight.im,
		},
		pow: complexMul(left.pow, right.pow),
	}
}

/**
 * Stage 2b: Cancellation-free recursive natural logarithm of (1 + d)
 * where Re(1 + d) > 0 and |Arg(1 + d)| <= pi/4.
 *
 * Uses ln(1 + d) = 2 * ln(1 + d / (sqrt(1 + d) + 1)) until |d| <= 1/16,
 * then evaluates 2 * artanh(d / (2 + d)) via divide-and-conquer series.
 *
 * @param {{ re: number, im: number }} d
 * @returns {{ re: number, im: number }}
 */
function ln1pRecursive(d) {
	const dSq = d.re * d.re + d.im * d.im
	if (dSq <= MAX_D_SQ) {
		if (dSq === 0) {
			return { re: 0, im: 0 }
		}
		const u = complexDiv(d, { re: 2 + d.re, im: d.im })
		const u2 = complexMul(u, u)
		const { sum } = evalArtanhSeriesDivideAndConquer(u2, 0, SERIES_TERMS)
		const prod = complexMul(u, sum)
		return { re: 2 * prod.re, im: 2 * prod.im }
	}

	const root = complexSqrtPrincipal({ re: 1 + d.re, im: d.im })
	const nextD = complexDiv(d, { re: 1 + root.re, im: root.im })
	const half = ln1pRecursive(nextD)
	return { re: 2 * half.re, im: 2 * half.im }
}

/**
 * Stage 2a: Recursive natural logarithm of a unit-octave complex number w.
 * Applies ln(w) = 2 * ln(sqrt(w)) until Re(w) >= |Im(w)| (|Arg(w)| <= pi/4),
 * then delegates to cancellation-free ln1pRecursive(w - 1).
 *
 * @param {{ re: number, im: number }} w
 * @returns {{ re: number, im: number }}
 */
function lnScaledRecursive(w) {
	if (w.re < Math.abs(w.im)) {
		const half = lnScaledRecursive(complexSqrtPrincipal(w))
		return { re: 2 * half.re, im: 2 * half.im }
	}
	return ln1pRecursive({ re: w.re - 1, im: w.im })
}

/**
 * Validate input z is a nonzero finite complex number object { re, im }.
 *
 * @param {unknown} z
 * @returns {{ re: number, im: number }}
 */
function validateComplexInput(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected a complex number object with numeric { re, im } properties')
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('Complex number components re and im must be numbers')
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('Complex number components re and im must be finite numbers')
	}
	const re = normalizeZero(z.re)
	const im = normalizeZero(z.im)
	if (re === 0 && im === 0) {
		throw new RangeError('log2ComplexRecursive is undefined for zero (0 + 0i)')
	}
	return { re, im }
}

/**
 * Compute the principal base-2 logarithm of a nonzero complex number { re, im }
 * using a recursive divide-and-conquer algorithm.
 *
 * @param {{ re: number, im: number }} z - Nonzero finite complex number.
 * @returns {{ re: number, im: number }} Principal value of log2(z).
 * @throws {TypeError} If z is not a valid complex object { re, im } with numeric fields.
 * @throws {RangeError} If re or im is non-finite, or if z is 0 + 0i.
 */
export function log2ComplexRecursive(z) {
	const { re, im } = validateComplexInput(z)

	const coarse = scaleByPowerOfTwoRecursive(re, im, 512, 0)
	const scaled = adjustToUnitOctaveRecursive(coarse.re, coarse.im, coarse.k)

	const lnW = lnScaledRecursive({ re: scaled.re, im: scaled.im })

	return {
		re: normalizeZero(scaled.k + lnW.re / LN2),
		im: normalizeZero(lnW.im / LN2),
	}
}
