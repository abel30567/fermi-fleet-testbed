/**
 * Validates that a value is a finite complex number represented as `{ re, im }`.
 *
 * @param {unknown} z - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @returns {{ re: number, im: number }}
 */
function assertValidComplex(z, name) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError(`${name} must be an object with finite numeric re and im properties`)
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`)
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`)
	}
	return z
}

/**
 * Computes exact complex quotient `a / b` with Smith's algorithm fallback
 * to prevent intermediate overflow or underflow.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function divideComplex(a, b) {
	const denom = b.re * b.re + b.im * b.im
	const numRe = a.re * b.re + a.im * b.im
	const numIm = a.im * b.re - a.re * b.im

	if (
		denom !== 0 &&
		Number.isFinite(denom) &&
		Number.isFinite(numRe) &&
		Number.isFinite(numIm)
	) {
		return { re: numRe / denom, im: numIm / denom }
	}

	// Smith's scaled complex division formula for extreme magnitudes
	if (Math.abs(b.re) >= Math.abs(b.im)) {
		const ratio = b.im / b.re
		const scaledDenom = b.re + b.im * ratio
		return {
			re: (a.re + a.im * ratio) / scaledDenom,
			im: (a.im - a.re * ratio) / scaledDenom,
		}
	}

	const ratio = b.re / b.im
	const scaledDenom = b.im + b.re * ratio
	return {
		re: (a.re * ratio + a.im) / scaledDenom,
		im: (a.im * ratio - a.re) / scaledDenom,
	}
}

/**
 * Computes the complex (Gaussian Euclidean) remainder of `a` modulo `b`.
 *
 * Uses the closed-form nearest Gaussian integer quotient identity:
 *   q = round(Re(a / b)) + i * round(Im(a / b))  (q in Z[i])
 *   r = a - q * b
 *
 * This guarantees the Euclidean division invariant `a = q * b + r` with
 * `|r| <= |b| / sqrt(2)` (i.e. `|r|^2 <= |b|^2 / 2`) and yields exact
 * Gaussian-integer Euclidean division when `a, b` are in `Z[i]`.
 *
 * @param {{ re: number, im: number }} a - Complex dividend.
 * @param {{ re: number, im: number }} b - Non-zero complex divisor.
 * @returns {{ re: number, im: number }} Complex remainder `r = a - q * b`.
 * @throws {TypeError} If `a` or `b` is not an object with numeric `re` and `im` fields.
 * @throws {RangeError} If any component is non-finite, if `b` is zero (`0 + 0i`), or if the quotient overflows.
 */
export function moduloComplexSeries(a, b) {
	assertValidComplex(a, 'a')
	assertValidComplex(b, 'b')

	if (b.re === 0 && b.im === 0) {
		throw new RangeError('Division by zero: complex divisor b must be non-zero')
	}

	const exactQuotient = divideComplex(a, b)
	const qRe = Math.round(exactQuotient.re)
	const qIm = Math.round(exactQuotient.im)

	if (!Number.isFinite(qRe) || !Number.isFinite(qIm)) {
		throw new RangeError('Complex quotient overflowed finite floating-point range')
	}

	const qbRe = qRe * b.re - qIm * b.im
	const qbIm = qRe * b.im + qIm * b.re

	const rRe = a.re - qbRe
	const rIm = a.im - qbIm

	if (!Number.isFinite(rRe) || !Number.isFinite(rIm)) {
		throw new RangeError('Complex remainder overflowed finite floating-point range')
	}

	return {
		re: rRe === 0 ? 0 : rRe,
		im: rIm === 0 ? 0 : rIm,
	}
}
