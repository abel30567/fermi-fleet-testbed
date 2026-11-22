/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If value is not a plain object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a complex number object { re, im }`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`)
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
 * Computes the discrete complex modulo (minimal-norm Gaussian-integer remainder)
 * `a mod b` for complex numbers `a = { re, im }` and `b = { re, im }`, using a
 * straightforward iterative binary-reduction algorithm over the orthogonal lattice
 * basis `{ b, i * b }`.
 *
 * Specifically, finds `r = a - q * b` for a Gaussian integer `q = qRe + i * qIm`
 * (`qRe, qIm ∈ Z`) such that the projections of `r` onto `b` and `i * b` satisfy
 * `r · b ∈ [-0.5 * |b|^2, 0.5 * |b|^2)` and `r · (i * b) ∈ [-0.5 * |b|^2, 0.5 * |b|^2)`.
 * This guarantees `|r|^2 <= 0.5 * |b|^2 < |b|^2` and matches `a - round(a / b) * b`
 * (using half-toward-+Infinity tie-breaking).
 *
 * @param {{ re: number, im: number }} a - Complex dividend `{ re, im }`.
 * @param {{ re: number, im: number }} b - Non-zero complex divisor `{ re, im }`.
 * @returns {{ re: number, im: number }} Complex remainder `{ re, im }`.
 * @throws {TypeError} If `a` or `b` is not an object with numeric `re` and `im`.
 * @throws {RangeError} If any component is non-finite, `b` is zero, or `|a| / |b|` overflows.
 */
export function moduloComplexIterative(a, b) {
	validateComplex(a, 'a')
	validateComplex(b, 'b')

	const bRe = b.re
	const bIm = b.im
	const maxB = Math.max(Math.abs(bRe), Math.abs(bIm))
	if (maxB === 0) {
		throw new RangeError('Divisor b must be non-zero')
	}

	// Exact power-of-two scaling of b prevents overflow/underflow in |b|^2 without
	// introducing mantissa rounding error.
	const exp = Math.min(1023, Math.max(-1074, Math.floor(Math.log2(maxB))))
	const scale = 2 ** exp
	const bScaledRe = bRe / scale
	const bScaledIm = bIm / scale
	const normB = bScaledRe * bScaledRe + bScaledIm * bScaledIm
	const halfNorm = 0.5 * normB

	let rRe = a.re
	let rIm = a.im

	// Iteratively reduce r along the orthogonal lattice basis vectors b and i * b
	// using exponential (power-of-two) step doubling.
	const maxIterations = 2048
	for (let iter = 0; iter < maxIterations; iter++) {
		const rScaledRe = rRe / scale
		const rScaledIm = rIm / scale
		if (!Number.isFinite(rScaledRe) || !Number.isFinite(rScaledIm)) {
			throw new RangeError('Complex modulo quotient exceeds finite floating-point range')
		}

		// Guard dot products against overflow when |rScaled| is near Number.MAX_VALUE.
		const maxRScaled = Math.max(Math.abs(rScaledRe), Math.abs(rScaledIm))
		const dotScale = maxRScaled > 1e300 ? 0.25 : 1
		const effRe = rScaledRe * dotScale
		const effIm = rScaledIm * dotScale
		const effNorm = normB * dotScale
		const effHalfNorm = halfNorm * dotScale

		// Orthogonal projections: dotRe = r · b, dotIm = r · (i * b).
		const dotRe = effRe * bScaledRe + effIm * bScaledIm
		const dotIm = effIm * bScaledRe - effRe * bScaledIm

		const reOutOfRange = dotRe >= effHalfNorm || dotRe < -effHalfNorm
		const imOutOfRange = dotIm >= effHalfNorm || dotIm < -effHalfNorm
		if (!reOutOfRange && !imOutOfRange) {
			break
		}

		// Reduce the out-of-range axis with the larger projection magnitude so that
		// every step makes strong progress toward the fundamental domain.
		const reduceRe = reOutOfRange && (!imOutOfRange || Math.abs(dotRe) >= Math.abs(dotIm))
		const dot = reduceRe ? dotRe : dotIm
		const sign = dot >= 0 ? 1 : -1
		const absDot = Math.abs(dot)

		// Find the largest power-of-two step with step * effNorm <= absDot (minimum 1).
		let step = 1
		let stepNorm = effNorm
		while (stepNorm <= absDot - stepNorm && Number.isFinite(step * 2)) {
			step *= 2
			stepNorm *= 2
		}

		let nextRe
		let nextIm
		if (reduceRe) {
			// r <- r - (sign * step) * b
			nextRe = rRe - sign * step * bRe
			nextIm = rIm - sign * step * bIm
		} else {
			// r <- r - (sign * step) * (i * b), where i * b = (-bIm, bRe)
			nextRe = rRe + sign * step * bIm
			nextIm = rIm - sign * step * bRe
		}

		if (nextRe === rRe && nextIm === rIm) {
			break
		}

		rRe = nextRe
		rIm = nextIm
	}

	return {
		re: normalizeZero(rRe),
		im: normalizeZero(rIm),
	}
}
