/**
 * Computes the principal value of the complex arccosine, `arccos(z)`, for a
 * complex number `z = { re, im }`.
 *
 * Uses the numerically stable Hull–Fairgrieve–Tang identity form of
 * `arccos(z) = -i * ln(z + i * sqrt(1 - z^2))` with principal branch cuts along
 * `(-Infinity, -1)` and `(1, +Infinity)` on the real axis, so `Re(arccos(z))`
 * lies in `[0, pi]`.
 *
 * @param {{ re: number, im: number }} z - Finite complex number `{ re, im }`.
 * @returns {{ re: number, im: number }} Principal value of `arccos(z)`.
 * @throws {TypeError} If `z` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `z.re` or `z.im` is `NaN` or not finite.
 */
export function arccosComplexSeries(z) {
	if (z === null || typeof z !== 'object') {
		throw new TypeError('Expected a complex number object { re, im }')
	}

	const { re: x, im: y } = z

	if (typeof x !== 'number' || typeof y !== 'number') {
		throw new TypeError('Complex number components re and im must be numbers')
	}

	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('Complex number components re and im must be finite numbers')
	}

	const ax = Math.abs(x)
	const ay = Math.abs(y)

	// Exact real axis handling (including principal branch cuts for |x| > 1)
	if (ay === 0) {
		if (ax <= 1) {
			return { re: Math.acos(x), im: 0 }
		}
		const absIm = Math.acosh(ax)
		const re = x > 0 ? 0 : Math.PI
		// Continuity from the upper half-plane (y = +0) yields negative imaginary part;
		// from the lower half-plane (y = -0) yields positive imaginary part.
		const im = Object.is(y, -0) ? absIm : -absIm
		return { re, im }
	}

	// Large-magnitude asymptotic regime: avoids overflow in hypot/squares while
	// preserving full IEEE-754 double precision (error < 5e-19 for |z| > 1e9).
	if (ax > 1e9 || ay > 1e9) {
		const maxVal = Math.max(ax, ay)
		const minVal = Math.min(ax, ay)
		const ratio = minVal / maxVal
		const re = Math.atan2(ay, x)
		const absIm = Math.LN2 + Math.log(maxVal) + 0.5 * Math.log1p(ratio * ratio)
		return { re, im: y < 0 ? absIm : -absIm }
	}

	// Elliptical coordinates (Hull, Fairgrieve & Tang, 1997):
	//   r = (hypot(ax + 1, ay) + hypot(ax - 1, ay)) / 2 >= 1
	//   am1 = r - 1 >= 0 computed without catastrophic cancellation.
	const d1 = Math.hypot(ax + 1, ay)
	const d2 = Math.hypot(ax - 1, ay)

	const am1 =
		ax <= 1
			? 0.5 * ((ay / (d1 + (ax + 1))) * ay + (ay / (d2 + (1 - ax))) * ay)
			: ax - 1 + 0.5 * ((ay / (d1 + (ax + 1))) * ay + (ay / (d2 + (ax - 1))) * ay)

	let re
	let absIm

	if (ax < 1 && am1 < 1e-280) {
		// Tiny imaginary part strictly inside (-1, 1): avoids subnormal loss in am1.
		const sqrt1mx2 = Math.sqrt((1 - ax) * (1 + ax))
		re = Math.atan2(sqrt1mx2, x)
		absIm = ay / sqrt1mx2
	} else {
		const r = 1 + am1
		const sqrtR2m1 = Math.sqrt(am1 * (am1 + 2))
		re = Math.atan2(ay * r, x * sqrtR2m1)
		absIm = Math.log1p(am1 + sqrtR2m1)
	}

	return { re, im: y < 0 ? absIm : -absIm }
}
