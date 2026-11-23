/**
 * Computes the principal value of the complex arcsine, `arcsin(z)`, for a
 * complex number `z = { re, im }`.
 *
 * Uses the numerically stable Hull–Fairgrieve–Tang (1997) closed-form identity
 * formulation with cancellation-free algebraic rearrangements for both small
 * and large magnitudes, preserving full IEEE 754 double precision across the
 * complex plane:
 *
 *   arcsin(z) = -i * ln(i * z + sqrt(1 - z^2))
 *
 * Principal branch:
 * - Real part lies in [-pi/2, pi/2].
 * - Branch cuts lie along (-Infinity, -1) and (1, +Infinity) on the real axis,
 *   continuous from the upper half-plane (im >= +0) and from the lower
 *   half-plane for im < 0 (or -0).
 *
 * @param {{ re: number, im: number }} z - Finite complex input `{ re, im }`.
 * @returns {{ re: number, im: number }} Principal complex arcsine `{ re, im }`.
 * @throws {TypeError} If `z` is not an object with numeric `re` and `im` fields.
 * @throws {RangeError} If `z.re` or `z.im` is not finite (`NaN` or `±Infinity`).
 */
export function arcsinComplexSeries(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected complex number as an object { re, im }')
	}

	const { re: x, im: y } = z
	if (typeof x !== 'number' || typeof y !== 'number') {
		throw new TypeError('Complex components re and im must be numbers')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('Complex components re and im must be finite numbers')
	}

	const a = Math.abs(x)
	const b = Math.abs(y)

	// Exact real-axis handling (including branch cuts |x| > 1)
	if (b === 0) {
		if (a <= 1) {
			const u = Math.asin(x)
			return { re: u === 0 ? 0 : u, im: 0 }
		}
		const re = x < 0 ? -Math.PI / 2 : Math.PI / 2
		const imMag = Math.acosh(a)
		const im = Object.is(y, -0) ? -imMag : imMag
		return { re, im }
	}

	// Exact purely imaginary axis: arcsin(i * y) = i * asinh(y)
	if (a === 0) {
		return { re: 0, im: Math.asinh(y) }
	}

	let u
	let v

	// Asymptotic regime: for max(|x|, |y|) > 1e8, 1 / alpha^2 < 1e-16 < eps,
	// so sqrt(alpha^2 - a^2) === b and acosh(alpha) === ln(2 * hypot(a, b))
	// to full double precision without overflow.
	const maxAB = Math.max(a, b)
	if (maxAB > 1e8) {
		const minAB = Math.min(a, b)
		const ratio = minAB / maxAB
		u = Math.atan2(a, b)
		v = Math.LN2 + Math.log(maxAB) + 0.5 * Math.log1p(ratio * ratio)
	} else {
		const r = Math.hypot(a + 1, b)
		const s = Math.hypot(a - 1, b)
		const alpha = 0.5 * (r + s)

		const d1 = r + (a + 1)
		let am
		let sqrtAmTerm
		let sqrtDmTerm

		if (a <= 1) {
			const d2 = s + (1 - a)
			am = 0.5 * b * (b / d1 + b / d2)
			if (d2 > 1e-100) {
				sqrtAmTerm = b * Math.sqrt(0.5 * (alpha + 1) * (1 / d1 + 1 / d2))
			} else {
				sqrtAmTerm = Math.sqrt(b) * Math.sqrt(0.5 * (alpha + 1) * (b / d1 + b / d2))
			}

			const dm = 0.5 * (b * (b / d1) + (1 - a) + s)
			sqrtDmTerm = Math.sqrt(dm * (alpha + a))
		} else {
			const d2 = s + (a - 1)
			am = 0.5 * (b * (b / d1) + (a - 1) + s)
			sqrtAmTerm = Math.sqrt(am * (alpha + 1))

			if (d2 > 1e-100) {
				sqrtDmTerm = b * Math.sqrt(0.5 * (alpha + a) * (1 / d1 + 1 / d2))
			} else {
				sqrtDmTerm = Math.sqrt(b) * Math.sqrt(0.5 * (alpha + a) * (b / d1 + b / d2))
			}
		}

		u = Math.atan2(a, sqrtDmTerm)
		v = Math.log1p(am + sqrtAmTerm)
	}

	return {
		re: x < 0 ? -u : u,
		im: y < 0 ? -v : v,
	}
}
