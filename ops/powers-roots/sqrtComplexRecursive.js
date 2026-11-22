/**
 * Computes the principal square root of a complex number using a recursive
 * divide-and-conquer algorithm combining binary dyadic scaling with recursive
 * complex Newton-Raphson (Babylonian) iteration.
 *
 * Algorithm:
 * 1. **Divide-and-conquer dyadic scaling**: Uses the exact scaling identity
 *    `sqrt(z) = 2^k * sqrt(z * 4^(-k))` with power-of-two exponent halving
 *    (bounded by `k <= 256` per step) to reduce any finite nonzero complex
 *    number into the well-conditioned annulus `max(|re|, |im|) in [0.25, 4]`.
 *    Because scaling by powers of 2 is exact in IEEE 754 binary64 arithmetic,
 *    this introduces zero rounding error and prevents overflow/underflow across
 *    the entire representable floating-point range (from `Number.MIN_VALUE` to
 *    `Number.MAX_VALUE`).
 * 2. **Recursive complex Newton-Raphson iteration**: Inside the annulus,
 *    recursively refines `w_{n+1} = 0.5 * (w_n + z / w_n)` starting from a
 *    quadrant-matched initial guess `w_0` whose Cayley error satisfies
 *    `|u_0| = |(w_0 - r)/(w_0 + r)| < 0.47`, guaranteeing quadratic convergence
 *    to full 53-bit precision in at most 6-7 recursive steps.
 * 3. **Cancellation-free minor-component recovery**: Reconstructs the minor
 *    component via the exact identity `2 * re(w) * im(w) = im(z)`, preserving
 *    full relative precision even arbitrarily close to the negative real axis
 *    (e.g., `z = -1 ± 1e-300i`) or under extreme component aspect ratios.
 *
 * Branch cut convention:
 * - Principal branch with `arg(z) in (-pi, pi]`, branch cut along `(-inf, 0)`.
 * - Always returns `re >= 0`.
 * - For negative real inputs (`re < 0, im = 0`, including `-0`), returns
 *   `{ re: 0, im: sqrt(-re) }`.
 * - For `z = 0`, returns `{ re: 0, im: 0 }`.
 * - Negative zeros (`-0`) are normalized to `0`.
 *
 * @param {{ re: number, im: number }} z - Finite complex number `{ re, im }`.
 * @returns {{ re: number, im: number }} Principal square root `{ re, im }` of `z`.
 * @throws {TypeError} If `z` is not a plain complex object `{ re, im }` or if
 *   `z.re` / `z.im` are not numbers.
 * @throws {RangeError} If `z.re` or `z.im` is not a finite number (`NaN`, `±Infinity`).
 */

const MAX_SCALE_STEP_EXP = 256
const MAX_NEWTON_DEPTH = 32
const CONVERGENCE_TOL = 1e-14

/**
 * Normalizes `-0` to `0`.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Returns the largest power of 2 not exceeding `Math.min(n, MAX_SCALE_STEP_EXP)`.
 * Requires `n >= 1`.
 * @param {number} n
 * @returns {number}
 */
function largestPowerOfTwoAtMost(n) {
	const clamped = Math.min(n, MAX_SCALE_STEP_EXP)
	return 1 << (31 - Math.clz32(clamped))
}

/**
 * Selects an initial guess in the same octant/quadrant as the principal root
 * so the Cayley transform ratio `|(w0 - r) / (w0 + r)|` is strictly `< 0.47`.
 *
 * @param {number} re - Scaled real part.
 * @param {number} im - Scaled imaginary part.
 * @param {boolean} imNegative - Whether the original (unscaled) imaginary part is strictly `< 0`.
 * @returns {{ re: number, im: number }}
 */
function initialGuess(re, im, imNegative) {
	if (re >= 0) {
		if (im === 0) return { re: 1, im: 0 }
		return { re: 1, im: im > 0 ? 0.5 : -0.5 }
	}
	if (im === 0) {
		return { re: 0, im: imNegative ? -1 : 1 }
	}
	return { re: 0.5, im: im > 0 ? 1 : -1 }
}

/**
 * Recursive complex Newton-Raphson solver for `w^2 = re + i*im` inside the
 * well-conditioned annulus `max(|re|, |im|) in [0.25, 4]`.
 *
 * @param {number} re
 * @param {number} im
 * @param {number} wRe
 * @param {number} wIm
 * @param {number} depth
 * @returns {{ re: number, im: number }}
 */
function newtonRecursive(re, im, wRe, wIm, depth) {
	const denom = wRe * wRe + wIm * wIm
	const qRe = (re * wRe + im * wIm) / denom
	const qIm = (im * wRe - re * wIm) / denom
	const nextRe = 0.5 * (wRe + qRe)
	const nextIm = 0.5 * (wIm + qIm)

	if (
		depth >= MAX_NEWTON_DEPTH ||
		(Math.abs(nextRe - wRe) <= CONVERGENCE_TOL &&
			Math.abs(nextIm - wIm) <= CONVERGENCE_TOL)
	) {
		return { re: nextRe, im: nextIm }
	}

	return newtonRecursive(re, im, nextRe, nextIm, depth + 1)
}

/**
 * Divide-and-conquer dyadic scaling solver using `sqrt(z) = 2^k * sqrt(z * 4^(-k))`.
 *
 * @param {number} re
 * @param {number} im
 * @param {boolean} imNegative
 * @returns {{ re: number, im: number }}
 */
function solveWithDyadicScaling(re, im, imNegative) {
	const maxAbs = Math.max(Math.abs(re), Math.abs(im))

	if (maxAbs > 4) {
		const exp2 = Math.floor(Math.log2(maxAbs))
		const k = largestPowerOfTwoAtMost(Math.max(1, Math.floor(exp2 / 2)))
		const invScale = 2 ** (-2 * k)
		const sub = solveWithDyadicScaling(re * invScale, im * invScale, imNegative)
		const factor = 2 ** k
		return { re: sub.re * factor, im: sub.im * factor }
	}

	if (maxAbs < 0.25) {
		const negExp2 = Math.floor(-Math.log2(maxAbs))
		const k = largestPowerOfTwoAtMost(Math.max(1, Math.floor(negExp2 / 2)))
		const scale = 2 ** (2 * k)
		const sub = solveWithDyadicScaling(re * scale, im * scale, imNegative)
		const factor = 2 ** (-k)
		return { re: sub.re * factor, im: sub.im * factor }
	}

	const w0 = initialGuess(re, im, imNegative)
	return newtonRecursive(re, im, w0.re, w0.im, 0)
}

export function sqrtComplexRecursive(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected a complex number object { re, im }')
	}

	const { re, im } = z
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Complex number components "re" and "im" must be numbers')
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex number components "re" and "im" must be finite numbers')
	}

	const a = normalizeZero(re)
	const b = normalizeZero(im)

	if (a === 0 && b === 0) {
		return { re: 0, im: 0 }
	}

	const raw = solveWithDyadicScaling(a, b, b < 0)

	let outRe = raw.re
	let outIm = raw.im

	// Cancellation-free minor-component recovery via 2 * u * v = b.
	// The dominant component is guaranteed to be normal and full-precision,
	// so `2 * dominant` never overflows or underflows for any finite nonzero input.
	if (b !== 0) {
		if (a >= 0) {
			outIm = b / (2 * outRe)
		} else {
			outRe = b / (2 * outIm)
		}
	} else if (a > 0) {
		outIm = 0
	} else {
		outRe = 0
	}

	return {
		re: normalizeZero(outRe),
		im: normalizeZero(outIm),
	}
}
