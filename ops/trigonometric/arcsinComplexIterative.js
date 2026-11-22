/**
 * Iterative real square root via Babylonian (Newton-Raphson) method.
 * Scales input into [0.5, 2) so convergence to IEEE 754 precision takes <= 6 iterations
 * without overflow or underflow across the full finite non-negative range.
 *
 * @param {number} x - Finite non-negative real number.
 * @returns {number} Principal square root of x.
 */
function sqrtIterative(x) {
	if (x === 0) return 0

	let m = x
	let scale = 1
	while (m >= 2) {
		m *= 0.25
		scale *= 2
	}
	while (m < 0.5) {
		m *= 4
		scale *= 0.5
	}

	let g = 0.5 * (m + 1)
	for (let i = 0; i < 16; i++) {
		const next = 0.5 * (g + m / g)
		if (next === g || Math.abs(next - g) <= 1e-16 * next) {
			g = next
			break
		}
		g = next
	}
	return g * scale
}

/**
 * Iterative Euclidean norm sqrt(a^2 + b^2) with scaling to avoid overflow/underflow.
 *
 * @param {number} a - Finite real number.
 * @param {number} b - Finite real number.
 * @returns {number} Non-negative Euclidean norm.
 */
function hypotIterative(a, b) {
	const absA = Math.abs(a)
	const absB = Math.abs(b)
	const max = absA >= absB ? absA : absB
	if (max === 0) return 0
	const ra = absA / max
	const rb = absB / max
	return max * sqrtIterative(ra * ra + rb * rb)
}

/**
 * Iterative natural logarithm ln(1 + delta) for delta >= 0 using the
 * rapidly convergent atanh series after binary range reduction.
 * Preserves full precision when delta is very small (no 1 + delta cancellation).
 *
 * @param {number} delta - Finite non-negative real number.
 * @returns {number} Natural logarithm of (1 + delta).
 */
function ln1pIterative(delta) {
	if (delta === 0) return 0

	// When delta is small, use t = delta / (2 + delta) directly without forming 1 + delta
	if (delta <= 0.5) {
		const t = delta / (2 + delta)
		const t2 = t * t
		let term = t
		let sum = t
		for (let k = 3; k <= 51; k += 2) {
			term *= t2
			const contrib = term / k
			const next = sum + contrib
			if (next === sum) break
			sum = next
		}
		return 2 * sum
	}

	return lnIterative(1 + delta)
}

/**
 * Iterative natural logarithm ln(x) for x > 0 using binary range reduction
 * into [1/sqrt(2), sqrt(2)] followed by the iterative atanh power series.
 *
 * @param {number} x - Finite positive real number.
 * @returns {number} Natural logarithm of x.
 */
function lnIterative(x) {
	if (x === 1) return 0

	let m = x
	let exp = 0
	while (m >= Math.SQRT2) {
		m *= 0.5
		exp += 1
	}
	while (m < Math.SQRT1_2) {
		m *= 2
		exp -= 1
	}

	const t = (m - 1) / (m + 1)
	const t2 = t * t
	let term = t
	let sum = t
	for (let k = 3; k <= 51; k += 2) {
		term *= t2
		const contrib = term / k
		const next = sum + contrib
		if (next === sum) break
		sum = next
	}

	return 2 * sum + exp * Math.LN2
}

/**
 * Iterative arctangent atan(u) for u in [0, 1].
 * Applies iterative half-angle reduction u -> u / (1 + sqrt(1 + u^2))
 * until u <= 0.05, then evaluates the alternating Taylor series.
 *
 * @param {number} u - Real number in [0, 1].
 * @returns {number} Principal arctangent of u in [0, pi/4].
 */
function atanUnitIterative(u) {
	if (u === 0) return 0

	let v = u
	let halvings = 0
	while (v > 0.05) {
		v = v / (1 + sqrtIterative(1 + v * v))
		halvings += 1
	}

	const v2 = v * v
	let term = v
	let sum = v
	for (let k = 3; k <= 51; k += 2) {
		term *= -v2
		const contrib = term / k
		const next = sum + contrib
		if (next === sum) break
		sum = next
	}

	return sum * (1 << halvings)
}

/**
 * Iterative first-quadrant angle atan2(y, x) for y >= 0, x >= 0.
 *
 * @param {number} y - Non-negative real number.
 * @param {number} x - Non-negative real number.
 * @returns {number} Angle in [0, pi/2].
 */
function atanQ1Iterative(y, x) {
	if (y === 0) return 0
	if (x === 0) return Math.PI / 2
	if (y <= x) {
		return atanUnitIterative(y / x)
	}
	return Math.PI / 2 - atanUnitIterative(x / y)
}

/**
 * Complex principal square root for c = re + i*im where im <= 0 or im >= 0.
 * When `forceNegativeIm` is true and re < 0, im === 0, selects the limit
 * from the lower half-plane (0 - i*sqrt(-re)), matching continuity from Q1
 * for 1 - z^2.
 *
 * @param {number} re - Real part.
 * @param {number} im - Imaginary part.
 * @param {boolean} forceNegativeIm - Select negative imaginary root on negative real axis.
 * @returns {{ re: number, im: number }} Principal square root.
 */
function sqrtComplexIterative(re, im, forceNegativeIm) {
	const r = hypotIterative(re, im)
	if (r === 0) return { re: 0, im: 0 }

	if (re >= 0) {
		const sr = sqrtIterative(0.5 * (r + re))
		const si = sr === 0 ? 0 : im / (2 * sr)
		return { re: sr, im: si }
	}

	const siMag = sqrtIterative(0.5 * (r - re))
	const si = (im < 0 || (im === 0 && forceNegativeIm)) ? -siMag : siMag
	const sr = siMag === 0 ? 0 : Math.abs(im) / (2 * siMag)
	return { re: sr, im: si }
}

/**
 * Computes the principal value of the complex inverse sine (arcsin) over `{ re, im }`
 * using a straightforward iterative implementation of the formula
 * `arcsin(z) = -i * ln(i * z + sqrt(1 - z^2))`.
 *
 * Branch cuts lie on the real axis along `(-Infinity, -1)` and `(1, +Infinity)`,
 * with principal real part in `[-pi/2, pi/2]` and continuity from the upper
 * half-plane on both cuts (matching IEEE 754 / C99 `casin` and Python `cmath.asin`).
 *
 * To avoid catastrophic cancellation and intermediate overflow, the input is
 * reduced by symmetry to the first quadrant `z1 = |re| + i*|im|`, where
 * `sqrt(1 - z1^2) = sqrt(1 - z1) * sqrt(1 + z1)` has `sr >= 0, si <= 0`, and
 * `-i * ln(i*z1 + sqrt(1 - z1^2)) = i * ln(sqrt(1 - z1^2) - i*z1)`.
 * Square roots, logarithms, and arctangents are evaluated iteratively, followed
 * by guarded Newton-Raphson refinement on `sin(w) - z1 = 0` where well-conditioned.
 *
 * @param {{ re: number, im: number }} z - Complex number with finite real and imaginary parts.
 * @returns {{ re: number, im: number }} Principal complex arcsin(z) with `re` in `[-pi/2, pi/2]`.
 * @throws {TypeError} If `z` is not a non-null plain object with numeric `re` and `im` properties.
 * @throws {RangeError} If `z.re` or `z.im` is NaN or not finite (`±Infinity`).
 */
export function arcsinComplexIterative(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected z to be a complex number object { re, im }')
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('Expected z.re and z.im to be numbers')
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('Expected z.re and z.im to be finite numbers')
	}

	const a = Math.abs(z.re)
	const b = Math.abs(z.im)

	// Exact zero fast path
	if (a === 0 && b === 0) {
		return { re: 0, im: 0 }
	}

	let u
	let v

	// Asymptotic scaling for extreme magnitudes (> 1e150) to prevent overflow in w = s - i*z1
	const maxCoord = a >= b ? a : b
	if (maxCoord > 1e150) {
		// For |z1| >> 1, sqrt(1 - z1^2) = b - i*a + O(1/|z1|), so w = s - i*z1 = 2*(b - i*a)
		const sa = a / maxCoord
		const sb = b / maxCoord
		u = atanQ1Iterative(sa, sb)
		v = lnIterative(maxCoord) + lnIterative(2 * hypotIterative(sa, sb))
	} else {
		// Compute s = sqrt(1 - z1^2) = sqrt(1 + z1) * sqrt(1 - z1)
		// In Q1 (a >= 0, b >= 0): sr >= 0, si <= 0
		const p = sqrtComplexIterative(1 + a, b, false)
		const q = sqrtComplexIterative(1 - a, -b, true)

		// sr = p.re * q.re - p.im * q.im = p.re * q.re + p.im * |q.im| (cancellation-free)
		const sr = p.re * q.re - p.im * q.im
		// From 2*sr*si = -2*a*b: compute si without cancellation or overflow
		let si
		if (sr === 0) {
			// Only happens when b === 0 and a >= 1 (so p.im === 0, q.re === 0)
			si = p.re * q.im
		} else if (a >= b) {
			si = -(a / sr) * b
		} else {
			si = -a * (b / sr)
		}

		// w = s - i*z1 = (sr + b) + i*(si - a), with wRe >= 0 and wIm <= 0 (zero cancellation)
		const wRe = sr + b
		const wImNeg = a - si // = -wIm >= 0

		// Principal real part: -arg(w) = atan2(-wIm, wRe) in [0, pi/2]
		u = atanQ1Iterative(wImNeg, wRe)

		// Principal imaginary part: ln(|w|) >= 0
		// Use exact identity |w|^2 - 1 = 2 * (b^2 + si^2 + sr*b + |si|*a) when moderate
		// to preserve full precision even when b is tiny and 0 <= a <= 1.
		if (a <= 2 && b <= 2) {
			const delta = 2 * (b * b + si * si + sr * b + Math.abs(si) * a)
			v = 0.5 * ln1pIterative(delta)
		} else {
			v = lnIterative(hypotIterative(wRe, wImNeg))
		}

		// Guarded Newton-Raphson polishing on sin(u + i*v) = a + i*b when well-conditioned
		if (v < 100) {
			for (let iter = 0; iter < 2; iter++) {
				const sinU = Math.sin(u)
				const cosU = Math.cos(u)
				const sinhV = Math.sinh(v)
				const coshV = Math.cosh(v)

				// f(w) = sin(w) - z1
				const fRe = sinU * coshV - a
				const fIm = cosU * sinhV - b

				// f'(w) = cos(w) = cosU*coshV - i*sinU*sinhV
				const dRe = cosU * coshV
				const dIm = -sinU * sinhV
				const denom = dRe * dRe + dIm * dIm

				// Skip refinement near branch points (cos(w) ~ 0) or if denom overflows
				if (denom < 1e-12 || !Number.isFinite(denom)) break

				const stepRe = (fRe * dRe + fIm * dIm) / denom
				const stepIm = (fIm * dRe - fRe * dIm) / denom

				const nextU = u - stepRe
				const nextV = v - stepIm
				if (nextU < 0 || nextU > Math.PI / 2 || nextV < 0) break

				u = nextU
				v = nextV
				if (Math.abs(stepRe) <= 1e-16 * (1 + u) && Math.abs(stepIm) <= 1e-16 * (1 + v)) {
					break
				}
			}
		}
	}

	// Restore quadrant signs (avoiding -0 for exact zeros)
	const re = u === 0 ? 0 : (z.re < 0 ? -u : u)
	const im = v === 0 ? 0 : (z.im < 0 ? -v : v)

	return { re, im }
}
