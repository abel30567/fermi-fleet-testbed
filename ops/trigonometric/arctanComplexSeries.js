/**
 * Complex arctangent `arctan(z)` for `z = { re, im }` using a hybrid
 * Maclaurin series and closed-form logarithmic/identity implementation.
 *
 * Uses:
 * - Direct alternating Maclaurin series `sum_{k>=0} (-1)^k z^{2k+1} / (2k+1)`
 *   for small magnitudes (`|z| <= 0.25`) to avoid cancellation near zero.
 * - Reciprocal identity `arctan(z) = ±π/2 - arctan(1/z)` combined with the
 *   Maclaurin series for large magnitudes (`|z| >= 4`) to prevent overflow.
 * - Numerically stabilized principal-branch closed form for intermediate
 *   magnitudes (`0.25 < |z| < 4`), with `log1p` / `hypot` avoiding cancellation
 *   and underflow near the real axis and near the singularities `z = ±i`.
 *
 * Branch cuts lie along the imaginary axis `(-i∞, -i]` and `[i, +i∞)`.
 *
 * @param {{ re: number, im: number }} z - Complex input with finite real and imaginary parts.
 * @returns {{ re: number, im: number }} Principal value of `arctan(z)`.
 * @throws {TypeError} If `z` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `z.re` or `z.im` is not finite (`NaN`, `±Infinity`),
 *   or if `z` lies on a logarithmic singularity (`z = ±i`).
 */
export function arctanComplexSeries(z) {
	if (z === null || typeof z !== 'object') {
		throw new TypeError('arctanComplexSeries: z must be an object of shape { re, im }')
	}

	const { re: x, im: y } = z
	if (typeof x !== 'number' || typeof y !== 'number') {
		throw new TypeError('arctanComplexSeries: z.re and z.im must be numbers')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('arctanComplexSeries: z.re and z.im must be finite numbers')
	}

	const absY = Math.abs(y)
	if (x === 0 && absY === 1) {
		throw new RangeError('arctanComplexSeries: singularity at z = ±i')
	}

	const r = Math.hypot(x, y)

	// Small |z|: direct Maclaurin series converges rapidly to full double precision.
	if (r <= 0.25) {
		const res = arctanMaclaurinSeries(x, y)
		return normalizeZero(res.re, res.im)
	}

	// Large |z|: overflow-safe reciprocal identity arctan(z) = ±π/2 - arctan(1/z).
	if (r >= 4) {
		const ax = Math.abs(x)
		const m = ax >= absY ? ax : absY
		const u = x / m
		const v = y / m
		const d = u * u + v * v
		const invRe = (u / d) / m
		const invIm = (-v / d) / m

		const s = arctanMaclaurinSeries(invRe, invIm)
		const halfPi = x > 0 || (x === 0 && !Object.is(x, -0)) ? Math.PI / 2 : -Math.PI / 2
		return normalizeZero(halfPi - s.re, -s.im)
	}

	// Intermediate |z| in (0.25, 4): stabilized closed-form principal branch.
	// Re(arctan(z)) = 0.5 * atan2(2x, 1 - x^2 - y^2)
	const oneMinusR2 =
		Math.abs(x) >= absY
			? (1 - x) * (1 + x) - y * y
			: (1 - absY) * (1 + absY) - x * x
	const re = 0.5 * Math.atan2(2 * x, oneMinusR2)

	// Im(arctan(z)) = sign(y) * 0.25 * ln((x^2 + (1 + |y|)^2) / (x^2 + (1 - |y|)^2))
	let imMag
	const oneMinusAbsY = 1 - absY
	const den = x * x + oneMinusAbsY * oneMinusAbsY
	if (den < 1e-8) {
		// Near z = ±i: use hypot to prevent underflow of x^2 or (1 - |y|)^2.
		imMag = 0.5 * (Math.log(Math.hypot(x, 1 + absY)) - Math.log(Math.hypot(x, oneMinusAbsY)))
	} else {
		imMag = 0.25 * Math.log1p((4 * absY) / den)
	}
	const im = y < 0 ? -imMag : imMag

	return normalizeZero(re, im)
}

/**
 * Evaluates `arctan(x + iy)` via the alternating Maclaurin series for `|z| <= 0.25`.
 *
 * @param {number} x - Real part.
 * @param {number} y - Imaginary part.
 * @returns {{ re: number, im: number }}
 */
function arctanMaclaurinSeries(x, y) {
	// z^2 = (x^2 - y^2) + i(2xy)
	const z2Re = x * x - y * y
	const z2Im = 2 * x * y

	let sumRe = x
	let sumIm = y
	let termRe = x
	let termIm = y
	let convergedCount = 0

	for (let k = 1; k <= 128; k++) {
		// Multiply current power by -z^2 to get (-1)^k * z^(2k+1)
		const nextTermRe = -(termRe * z2Re - termIm * z2Im)
		const nextTermIm = -(termRe * z2Im + termIm * z2Re)
		termRe = nextTermRe
		termIm = nextTermIm

		const denom = 2 * k + 1
		const nextSumRe = sumRe + termRe / denom
		const nextSumIm = sumIm + termIm / denom

		if (nextSumRe === sumRe && nextSumIm === sumIm) {
			convergedCount++
			if (convergedCount >= 2) break
		} else {
			convergedCount = 0
		}

		sumRe = nextSumRe
		sumIm = nextSumIm
	}

	return { re: sumRe, im: sumIm }
}

/**
 * Normalizes `-0` to `+0` on output components.
 *
 * @param {number} re
 * @param {number} im
 * @returns {{ re: number, im: number }}
 */
function normalizeZero(re, im) {
	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}
