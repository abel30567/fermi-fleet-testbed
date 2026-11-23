/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalizes negative zero to positive zero for clean numeric output.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates that a value is a 3-element array of finite complex numbers `{ re, im }`.
 *
 * @param {unknown} vec
 * @param {string} name
 * @returns {readonly [Complex, Complex, Complex]}
 */
function validateComplexVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of 3 complex numbers { re, im }`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3 (received ${vec.length})`)
	}
	for (let i = 0; i < 3; i++) {
		const entry = vec[i]
		if (entry === null || typeof entry !== 'object') {
			throw new TypeError(`${name}[${i}] must be a complex number object { re, im }`)
		}
		if (typeof entry.re !== 'number' || typeof entry.im !== 'number') {
			throw new TypeError(`${name}[${i}].re and ${name}[${i}].im must be numbers`)
		}
		if (!Number.isFinite(entry.re) || !Number.isFinite(entry.im)) {
			throw new RangeError(`${name}[${i}].re and ${name}[${i}].im must be finite numbers`)
		}
	}
	return /** @type {readonly [Complex, Complex, Complex]} */ (vec)
}

/**
 * Computes the real 3D vector cross product of two real 3-vectors.
 *
 * @param {readonly [number, number, number]} u
 * @param {readonly [number, number, number]} v
 * @returns {[number, number, number]}
 */
function realCross3(u, v) {
	return [
		u[1] * v[2] - u[2] * v[1],
		u[2] * v[0] - u[0] * v[2],
		u[0] * v[1] - u[1] * v[0],
	]
}

/**
 * Computes the 3D vector cross product of two complex vectors `a` and `b`
 * whose components are `{ re, im }` objects.
 *
 * Uses the closed-form bilinear decomposition identity:
 * writing `a = u + i*v` and `b = p + i*q` with real vectors `u, v, p, q` in R^3,
 *
 *   a x b = (u x p - v x q) + i * (u x q + v x p)
 *
 * which is algebraically identical to the Levi-Civita tensor contraction
 * `(a x b)_i = sum_{j,k} eps_{ijk} * a_j * b_k`.
 *
 * @param {readonly [Complex, Complex, Complex]} a - First 3D complex vector.
 * @param {readonly [Complex, Complex, Complex]} b - Second 3D complex vector.
 * @returns {[Complex, Complex, Complex]} The 3D complex cross product `a x b`.
 * @throws {TypeError} If inputs are not arrays or components are not `{ re, im }` objects with numeric parts.
 * @throws {RangeError} If vector length is not 3 or any component part is NaN or infinite.
 */
export function crossProductComplexSeries(a, b) {
	const va = validateComplexVector3(a, 'a')
	const vb = validateComplexVector3(b, 'b')

	/** @type {[number, number, number]} */
	const u = [va[0].re, va[1].re, va[2].re]
	/** @type {[number, number, number]} */
	const v = [va[0].im, va[1].im, va[2].im]
	/** @type {[number, number, number]} */
	const p = [vb[0].re, vb[1].re, vb[2].re]
	/** @type {[number, number, number]} */
	const q = [vb[0].im, vb[1].im, vb[2].im]

	const uCrossP = realCross3(u, p)
	const vCrossQ = realCross3(v, q)
	const uCrossQ = realCross3(u, q)
	const vCrossP = realCross3(v, p)

	return [
		{
			re: normalizeZero(uCrossP[0] - vCrossQ[0]),
			im: normalizeZero(uCrossQ[0] + vCrossP[0]),
		},
		{
			re: normalizeZero(uCrossP[1] - vCrossQ[1]),
			im: normalizeZero(uCrossQ[1] + vCrossP[1]),
		},
		{
			re: normalizeZero(uCrossP[2] - vCrossQ[2]),
			im: normalizeZero(uCrossQ[2] + vCrossP[2]),
		},
	]
}
