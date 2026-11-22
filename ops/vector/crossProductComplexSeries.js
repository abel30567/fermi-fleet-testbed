/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalize -0 to 0.
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validate that an input is a 3-element array of finite complex numbers `{ re, im }`.
 * @param {unknown} vec
 * @param {string} name
 * @returns {asserts vec is [Complex, Complex, Complex]}
 */
function assertComplexVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of 3 complex numbers`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, received ${vec.length}`)
	}
	for (let i = 0; i < 3; i++) {
		const entry = vec[i]
		if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new TypeError(`${name}[${i}] must be a complex number object { re, im }`)
		}
		if (typeof entry.re !== 'number' || typeof entry.im !== 'number') {
			throw new TypeError(`${name}[${i}].re and ${name}[${i}].im must be numbers`)
		}
		if (!Number.isFinite(entry.re) || !Number.isFinite(entry.im)) {
			throw new RangeError(`${name}[${i}].re and ${name}[${i}].im must be finite numbers`)
		}
	}
}

/**
 * Multiply two complex numbers.
 * @param {Complex} u
 * @param {Complex} v
 * @returns {Complex}
 */
function complexMul(u, v) {
	return {
		re: u.re * v.re - u.im * v.im,
		im: u.re * v.im + u.im * v.re,
	}
}

/**
 * Subtract two complex numbers (`u - v`).
 * @param {Complex} u
 * @param {Complex} v
 * @returns {Complex}
 */
function complexSub(u, v) {
	return {
		re: normalizeZero(u.re - v.re),
		im: normalizeZero(u.im - v.im),
	}
}

/**
 * Compute the 3D cross product of two complex vectors using the closed-form
 * Levi-Civita / determinant expansion:
 *
 *   (a × b)_k = Σ_{i,j} ε_{ijk} a_i b_j
 *             = [a_1 b_2 - a_2 b_1, a_2 b_0 - a_0 b_2, a_0 b_1 - a_1 b_0]
 *
 * Complex numbers are represented as `{ re, im }` objects and combined via
 * bilinear complex arithmetic.
 *
 * @param {[Complex, Complex, Complex]} a First 3D complex vector.
 * @param {[Complex, Complex, Complex]} b Second 3D complex vector.
 * @returns {[Complex, Complex, Complex]} The 3D complex cross product `a × b`.
 * @throws {TypeError} If `a` or `b` is not an array of `{ re, im }` numeric objects.
 * @throws {RangeError} If `a` or `b` does not have length 3 or contains non-finite values.
 */
export function crossProductComplexSeries(a, b) {
	assertComplexVector3(a, 'a')
	assertComplexVector3(b, 'b')

	const [a0, a1, a2] = a
	const [b0, b1, b2] = b

	return [
		complexSub(complexMul(a1, b2), complexMul(a2, b1)),
		complexSub(complexMul(a2, b0), complexMul(a0, b2)),
		complexSub(complexMul(a0, b1), complexMul(a1, b0)),
	]
}
