/**
 * Complex arccosine (principal branch) computed lazily over an iterable of
 * complex numbers represented as `{ re, im }`.
 *
 * Uses Kahan's (1987) numerically stable formulation via principal square roots
 * of `1 - z` and `1 + z`, with an overflow-safe asymptotic path for very large
 * magnitudes (`|z| > 1e150`).
 *
 * Principal branch conventions (matching C99 `cacos` / Python `cmath.acos`):
 * - `Re(arccos(z))` lies in `[0, Math.PI]`.
 * - Branch cuts lie along `(-Infinity, -1)` and `(1, +Infinity)` on the real axis.
 * - For `Im(z) > 0` (or `Im(z) = +0` on the branch cuts), `Im(arccos(z)) < 0`.
 * - For `Im(z) < 0` (or `Im(z) = -0` on the branch cuts), `Im(arccos(z)) > 0`.
 *
 * @typedef {{ re: number, im: number }} Complex
 */

const LARGE_MAGNITUDE_THRESHOLD = 1e150

/**
 * Returns true if `x` is negative, distinguishing `-0` from `+0`.
 *
 * @param {number} x
 * @returns {boolean}
 */
function isNegativeSigned(x) {
	return x < 0 || Object.is(x, -0)
}

/**
 * Computes the principal square root of `a + i*b` without cancellation.
 *
 * @param {number} a - Real part
 * @param {number} b - Imaginary part
 * @returns {Complex}
 */
function complexSqrt(a, b) {
	const r = Math.hypot(a, b)
	if (r === 0) {
		return { re: 0, im: 0 }
	}
	if (a >= 0) {
		const re = Math.sqrt((r + a) / 2)
		const im = b / (2 * re)
		return { re, im }
	}
	const imAbs = Math.sqrt((r - a) / 2)
	const im = isNegativeSigned(b) ? -imAbs : imAbs
	const re = Math.abs(b) / (2 * imAbs)
	return { re, im }
}

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value
 * @returns {Complex}
 */
function validateComplex(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError('Each element must be a complex object { re, im }')
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (value)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Complex number properties "re" and "im" must be numbers')
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex number properties "re" and "im" must be finite numbers')
	}
	return { re, im }
}

/**
 * Computes the principal complex arccosine of a single validated complex number.
 *
 * @param {number} x - Real part
 * @param {number} y - Imaginary part
 * @returns {Complex}
 */
function arccosComplexScalar(x, y) {
	// Exact real interval [-1, 1] with zero imaginary part
	if (y === 0 && x >= -1 && x <= 1) {
		return { re: Math.acos(x), im: 0 }
	}

	// Overflow-safe asymptotic path for very large |z|
	const maxAbs = Math.max(Math.abs(x), Math.abs(y))
	if (maxAbs > LARGE_MAGNITUDE_THRESHOLD) {
		const re = Math.atan2(Math.abs(y), x)
		const logMag = Math.log(maxAbs) + Math.log(Math.hypot(x / maxAbs, y / maxAbs))
		const imAbs = Math.LN2 + logMag
		const im = isNegativeSigned(y) ? imAbs : -imAbs
		return { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im }
	}

	// Kahan (1987) formula:
	//   s1 = sqrt(1 - z), s2 = sqrt(1 + z)
	//   Re(arccos(z)) = 2 * atan2(Re(s1), Re(s2))
	//   Im(arccos(z)) = asinh(Im(s1) * Re(s2) - Re(s1) * Im(s2))
	const s1 = complexSqrt(1 - x, -y)
	const s2 = complexSqrt(1 + x, y)

	const re = 2 * Math.atan2(s1.re, s2.re)
	const im = Math.asinh(s1.im * s2.re - s1.re * s2.im)

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}

/**
 * Lazily computes the principal trigonometric arccosine of each complex number
 * `{ re, im }` in an iterable sequence.
 *
 * The input iterable is validated eagerly; individual elements are pulled,
 * validated, and transformed one at a time as the returned generator is consumed.
 *
 * @param {Iterable<Complex>} values - Iterable sequence of complex numbers `{ re, im }`
 * @returns {Generator<Complex, void, undefined>} Lazy generator yielding `arccos(z)` for each `z`
 * @throws {TypeError} If `values` is not a non-string iterable, or if an element lacks numeric `re`/`im`
 * @throws {RangeError} If an element's `re` or `im` is not finite (`NaN`, `Infinity`, `-Infinity`)
 */
export function arccosComplexLazy(values) {
	if (
		values === null ||
		values === undefined ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('Expected an iterable sequence of complex numbers { re, im }')
	}

	return (function* () {
		for (const item of values) {
			const { re, im } = validateComplex(item)
			yield arccosComplexScalar(re, im)
		}
	})()
}
