/**
 * Computes the principal cube root of a complex number using a recursive,
 * divide-and-conquer algorithm.
 *
 * Conventions:
 * - Complex numbers are represented as plain objects `{ re, im }` with finite
 *   real components. Signed zero (`-0`) is normalized to `+0` on input and output.
 * - Uses the principal branch of the complex cube root:
 *     `cbrt(r * exp(i * theta)) = r^(1/3) * exp(i * theta / 3)`
 *   where `r = |z| >= 0` and `theta = Arg(z) in (-pi, pi]`.
 * - Consequently, `Arg(cbrt(z)) in (-pi/3, pi/3]` for all `z !== 0`, with the
 *   branch cut along the negative real axis `(-Infinity, 0)` where
 *   `cbrt(-r + 0i) = r^(1/3) * (1/2 + i * sqrt(3)/2)`.
 * - For `z = 0 + 0i`, returns `{ re: 0, im: 0 }`.
 *
 * Algorithm:
 * 1. Divide-and-conquer scaling: Recursively scales `z` by an exact power of
 *    `2^(-3k)` (splitting large binary exponents in half so intermediate powers
 *    of 2 never overflow or underflow, supporting the full IEEE-754 range from
 *    subnormals up to `Number.MAX_VALUE`) so that `max(|re'|, |im'|) in [1, 8)`.
 * 2. Recursive contraction seeding: Lets `u = sqrt(z')` (principal square root,
 *    `Arg(u) in (-pi/2, pi/2]`) and recursively applies the self-similar
 *    contraction `T(w) = sqrt(u * sqrt(w))`, derived from
 *    `1/3 = 1/4 + 1/16 + 1/64 + ...`. Every intermediate argument remains within
 *    `[-3*pi/4, 3*pi/4]` (strictly away from the branch cut), placing the seed
 *    deep inside the immediate basin of attraction of the principal cube root.
 * 3. Recursive Halley refinement: Recursively applies Halley's cubically
 *    convergent method in residual form,
 *      `w_{n+1} = w_n - w_n * (w_n^3 - z') / (2 * w_n^3 + z')`,
 *    using Smith's numerically stable complex division until full IEEE-754
 *    precision is reached, then rescales by `2^k`.
 *
 * @param {{ re: number, im: number }} z - Complex number input.
 * @returns {{ re: number, im: number }} The principal cube root of `z`.
 * @throws {TypeError} If `z` is not a non-null object or if `z.re` / `z.im` are not numbers.
 * @throws {RangeError} If `z.re` or `z.im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
export function cbrtComplexRecursive(z) {
	validateComplex(z)

	const re = normalizeZero(z.re)
	const im = normalizeZero(z.im)

	if (re === 0 && im === 0) {
		return { re: 0, im: 0 }
	}

	// Exploit conjugate symmetry for the strict lower half-plane (im < 0):
	// cbrt(re + i*im) = conj(cbrt(re - i*im)). This preserves the exact branch
	// sign even when |im| << |re| and scaled.im underflows to 0 for re < 0.
	if (im < 0) {
		const conjRoot = cbrtComplexRecursive({ re, im: -im })
		return {
			re: conjRoot.re,
			im: normalizeZero(-conjRoot.im),
		}
	}

	// Step 1: Exact binary scaling by 2^(-3k) via divide-and-conquer exponent splitting
	const maxAbs = Math.max(Math.abs(re), Math.abs(im))
	const k = Math.floor(Math.log2(maxAbs) / 3)
	const scaled = {
		re: scaleByPow2(re, -3 * k),
		im: scaleByPow2(im, -3 * k),
	}

	// Step 2: Recursive contraction seed into the principal root's cubic basin
	const u = principalSqrt(scaled)
	const seed = contractSeedRecursive(u, u, 4)

	// Step 3: Recursive Halley refinement to machine precision
	const rootScaled = halleyRefineRecursive(scaled, seed, Infinity, 0)

	// Step 4: Exact rescaling by 2^k and signed-zero normalization
	return {
		re: normalizeZero(scaleByPow2(rootScaled.re, k)),
		im: normalizeZero(scaleByPow2(rootScaled.im, k)),
	}
}

/**
 * Validates that the input is a complex number `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} z
 */
function validateComplex(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected a complex number object { re, im }')
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('Complex number components re and im must be numbers')
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('Complex number components re and im must be finite numbers')
	}
}

/**
 * Normalizes `-0` to `0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Scales a finite number by `2^exp` using divide-and-conquer exponent splitting
 * so that intermediate powers of 2 stay well within IEEE-754 normal range.
 *
 * @param {number} value
 * @param {number} exp - Integer binary exponent.
 * @returns {number}
 */
function scaleByPow2(value, exp) {
	if (value === 0 || exp === 0) {
		return value
	}
	if (Math.abs(exp) <= 512) {
		return value * 2 ** exp
	}
	const half = Math.trunc(exp / 2)
	return scaleByPow2(scaleByPow2(value, half), exp - half)
}

/**
 * Complex multiplication `(a + bi)(c + di)`.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Numerically stable complex division `a / b` using Smith's algorithm.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function divComplex(a, b) {
	if (Math.abs(b.re) >= Math.abs(b.im)) {
		const t = b.im / b.re
		const denom = b.re + b.im * t
		return {
			re: (a.re + a.im * t) / denom,
			im: (a.im - a.re * t) / denom,
		}
	}
	const t = b.re / b.im
	const denom = b.im + b.re * t
	return {
		re: (a.re * t + a.im) / denom,
		im: (a.im * t - a.re) / denom,
	}
}

/**
 * Numerically stable principal complex square root with branch cut on `(-Infinity, 0)`
 * and `Arg(sqrt(z)) in (-pi/2, pi/2]`.
 *
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function principalSqrt(z) {
	const r = Math.hypot(z.re, z.im)
	if (r === 0) {
		return { re: 0, im: 0 }
	}
	if (z.re >= 0) {
		const x = Math.sqrt((r + z.re) / 2)
		const y = z.im === 0 ? 0 : z.im / (2 * x)
		return { re: x, im: y }
	}
	// z.re < 0: when z.im === 0, principal argument is +pi so sqrt lies on +i axis
	const absY = Math.sqrt((r - z.re) / 2)
	const y = z.im < 0 ? -absY : absY
	const x = z.im === 0 ? 0 : z.im / (2 * y)
	return { re: x, im: y }
}

/**
 * Recursively applies the contraction mapping `T(w) = sqrt(u * sqrt(w))`,
 * where `u = sqrt(z)`, reducing the exponent error by a factor of 4 per call.
 *
 * @param {{ re: number, im: number }} u - Principal square root of `z`.
 * @param {{ re: number, im: number }} w - Current iterate.
 * @param {number} remainingSteps - Number of recursive contraction steps left.
 * @returns {{ re: number, im: number }}
 */
function contractSeedRecursive(u, w, remainingSteps) {
	if (remainingSteps <= 0) {
		return w
	}
	const next = principalSqrt(mulComplex(u, principalSqrt(w)))
	return contractSeedRecursive(u, next, remainingSteps - 1)
}

/**
 * Recursively refines a cube root estimate using Halley's cubically convergent
 * method in residual form: `w_{n+1} = w_n - w_n * (w_n^3 - z) / (2 * w_n^3 + z)`.
 *
 * @param {{ re: number, im: number }} z - Target normalized complex number.
 * @param {{ re: number, im: number }} w - Current cube root approximation.
 * @param {number} prevStepNorm - Norm of the previous Halley step for stagnation detection.
 * @param {number} depth - Current recursion depth.
 * @returns {{ re: number, im: number }}
 */
function halleyRefineRecursive(z, w, prevStepNorm, depth) {
	const MAX_DEPTH = 16
	const w2 = mulComplex(w, w)
	const w3 = mulComplex(w2, w)

	const residual = {
		re: w3.re - z.re,
		im: w3.im - z.im,
	}
	const denom = {
		re: 2 * w3.re + z.re,
		im: 2 * w3.im + z.im,
	}

	const ratio = divComplex(residual, denom)
	const delta = mulComplex(w, ratio)
	const next = {
		re: w.re - delta.re,
		im: w.im - delta.im,
	}

	const stepNorm = Math.hypot(delta.re, delta.im)
	const wNorm = Math.hypot(next.re, next.im)

	if (
		stepNorm === 0 ||
		(next.re === w.re && next.im === w.im) ||
		stepNorm <= 2 * Number.EPSILON * wNorm ||
		depth >= MAX_DEPTH
	) {
		return next
	}

	// Guard against 1-ULP oscillation once already near machine epsilon
	if (stepNorm >= prevStepNorm && prevStepNorm <= 1e-12 * wNorm) {
		return w
	}

	return halleyRefineRecursive(z, next, stepNorm, depth + 1)
}
