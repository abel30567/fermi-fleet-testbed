/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a finite complex number represented as `{ re, im }`.
 *
 * @param {unknown} z - Candidate complex number.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {Complex} Validated complex number components.
 * @throws {TypeError} If `z` is not a non-null plain-like object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is `NaN`, `Infinity`, or `-Infinity`.
 */
function validateComplex(z, name) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError(`${name} must be an object with numeric { re, im } properties`)
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (z)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`)
	}
	return { re, im }
}

/**
 * Normalizes IEEE-754 negative zero (`-0`) to `+0`.
 *
 * @param {number} value - Finite numeric value.
 * @returns {number} Value with `-0` normalized to `0`.
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Multiplies two complex numbers `a` and `b` represented as `{ re, im }` using
 * the closed-form Cauchy product series in the quotient ring `R[x] / (x^2 + 1)`.
 *
 * Treating `a(x) = a.re + a.im * x` and `b(x) = b.re + b.im * x` as degree-1
 * power series, the Cauchy product coefficients are:
 * - `c_0 = a.re * b.re`
 * - `c_1 = a.re * b.im + a.im * b.re`
 * - `c_2 = a.im * b.im`
 *
 * Evaluating `sum_{k=0}^2 c_k * i^k` with the identity `i^2 = -1` yields
 * `{ re: c_0 - c_2, im: c_1 }`.
 *
 * @param {Complex} a - First complex operand `{ re, im }`.
 * @param {Complex} b - Second complex operand `{ re, im }`.
 * @returns {Complex} The complex product `a * b` as `{ re, im }`.
 * @throws {TypeError} If either operand is not a valid `{ re, im }` object with numeric fields.
 * @throws {RangeError} If either operand has non-finite components or the product overflows.
 */
export function multiplyComplexSeries(a, b) {
	const u = validateComplex(a, 'a')
	const v = validateComplex(b, 'b')

	const uCoeffs = [u.re, u.im]
	const vCoeffs = [v.re, v.im]

	// Cauchy product coefficients c_n = sum_{k=0}^n u_k * v_{n-k} for n = 0, 1, 2
	const cauchy = [0, 0, 0]
	for (let n = 0; n <= 2; n++) {
		let sum = 0
		const kStart = Math.max(0, n - 1)
		const kEnd = Math.min(1, n)
		for (let k = kStart; k <= kEnd; k++) {
			sum += uCoeffs[k] * vCoeffs[n - k]
		}
		cauchy[n] = sum
	}

	// Reduce sum_{n=0}^2 cauchy[n] * i^n using i^0 = 1, i^1 = i, i^2 = -1
	const re = cauchy[0] - cauchy[2]
	const im = cauchy[1]

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex multiplication overflowed finite IEEE-754 double precision')
	}

	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	}
}
