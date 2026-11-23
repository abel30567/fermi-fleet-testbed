/**
 * Computes ln(v) for positive v near 1 using the iterative atanh series:
 * ln(v) = 2 * sum_{k=0}^inf t^(2k+1) / (2k+1), where t = (v - 1) / (v + 1).
 *
 * @param {number} v - Positive finite number near 1.
 * @returns {number} Natural logarithm of v.
 */
function lnSeriesIter(v) {
	const t = (v - 1) / (v + 1)
	const t2 = t * t
	let power = t
	let sum = t

	for (let k = 1; k <= 128; k++) {
		power *= t2
		const delta = power / (2 * k + 1)
		sum += delta
		if (Math.abs(delta) <= Number.EPSILON * Math.abs(sum)) {
			break
		}
	}

	return 2 * sum
}

const LN2 = lnSeriesIter(2)

/**
 * Computes atan(u) for u in (0, 1] using iterative half-angle reduction
 * followed by an iterative Taylor series.
 *
 * @param {number} u - Real number in (0, 1].
 * @returns {number} Principal arctangent of u in radians.
 */
function atanUnitIter(u) {
	let reduced = u
	let scale = 1

	for (let i = 0; i < 4; i++) {
		reduced = reduced / (1 + Math.sqrt(1 + reduced * reduced))
		scale *= 2
	}

	const r2 = reduced * reduced
	let power = reduced
	let sum = reduced

	for (let k = 1; k <= 64; k++) {
		power *= -r2
		const delta = power / (2 * k + 1)
		sum += delta
		if (Math.abs(delta) <= Number.EPSILON * Math.abs(sum)) {
			break
		}
	}

	return scale * sum
}

/**
 * Computes the principal argument atan2(y, x) in (-pi, pi] iteratively.
 *
 * @param {number} y - Imaginary component.
 * @param {number} x - Real component.
 * @returns {number} Principal argument in radians.
 */
function atan2Iter(y, x) {
	if (y === 0) {
		if (x > 0) {
			return 0
		}
		return Object.is(y, -0) ? -Math.PI : Math.PI
	}
	if (x === 0) {
		return y > 0 ? Math.PI / 2 : -Math.PI / 2
	}

	const ax = Math.abs(x)
	const ay = Math.abs(y)
	let angle

	if (ay <= ax) {
		angle = atanUnitIter(ay / ax)
	} else {
		angle = Math.PI / 2 - atanUnitIter(ax / ay)
	}

	if (x < 0) {
		angle = Math.PI - angle
	}
	if (y < 0) {
		angle = -angle
	}

	return angle
}

/**
 * Computes the principal base-2 logarithm of a non-zero complex number
 * z = re + im*i using a straightforward iterative algorithm.
 *
 * Uses iterative power-of-2 scaling to prevent overflow/underflow, an iterative
 * atanh series for the radial logarithm, and iterative half-angle reduction
 * plus Taylor series for the principal argument in (-pi, pi].
 *
 * @param {{ re: number, im: number }} z - Non-zero complex number with finite real and imaginary parts.
 * @returns {{ re: number, im: number }} Principal value of log2(z) as { re, im }.
 * @throws {TypeError} If z is not an object with numeric re and im properties.
 * @throws {RangeError} If re or im is not finite, or if z is zero (0 + 0i).
 */
export function log2ComplexIterative(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected a complex number object { re, im }')
	}

	const { re: rawRe, im: rawIm } = z

	if (typeof rawRe !== 'number' || typeof rawIm !== 'number') {
		throw new TypeError('Complex number components re and im must be numbers')
	}

	if (!Number.isFinite(rawRe) || !Number.isFinite(rawIm)) {
		throw new RangeError('Complex number components re and im must be finite numbers')
	}

	if (rawRe === 0 && rawIm === 0) {
		throw new RangeError('log2 is undefined for zero (0 + 0i)')
	}

	let a = rawRe
	let b = rawIm
	let maxAbs = Math.max(Math.abs(a), Math.abs(b))
	let exp2 = 0

	// Iteratively scale components by powers of 2 so max(|a|, |b|) lies in [1, 2)
	while (maxAbs >= 2) {
		a *= 0.5
		b *= 0.5
		maxAbs *= 0.5
		exp2 += 1
	}
	while (maxAbs < 1) {
		a *= 2
		b *= 2
		maxAbs *= 2
		exp2 -= 1
	}

	// Compute scaled magnitude and reduce into [1/sqrt(2), sqrt(2))
	let r = Math.sqrt(a * a + b * b)
	while (r >= Math.SQRT2) {
		r *= 0.5
		exp2 += 1
	}
	while (r < Math.SQRT1_2) {
		r *= 2
		exp2 -= 1
	}

	const re = exp2 + lnSeriesIter(r) / LN2
	const im = atan2Iter(b, a) / LN2

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}
