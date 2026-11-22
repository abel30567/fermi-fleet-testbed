/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a non-empty array of finite complex numbers `{ re, im }`.
 *
 * @param {unknown} vec - Value to validate as a complex vector.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `vec` is not an array or contains invalid complex objects.
 * @throws {RangeError} If `vec` is empty or contains non-finite numeric components.
 */
function validateComplexVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of complex numbers { re, im }`)
	}
	if (vec.length === 0) {
		throw new RangeError(`${name} must be a non-empty vector`)
	}
	for (let i = 0; i < vec.length; i++) {
		const entry = vec[i]
		if (entry === null || typeof entry !== 'object') {
			throw new TypeError(`${name}[${i}] must be a non-null object { re, im }`)
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
 * Normalizes `-0` to `0` while leaving all other numbers unchanged.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Computes the orthogonal projection of complex vector `u` onto nonzero complex
 * vector `v` using a straightforward iterative implementation.
 *
 * Each element is a complex number `{ re, im }`. The projection is defined as:
 *   proj_v(u) = (<u, v> / <v, v>) * v
 * where `<u, v> = sum_k u_k * conj(v_k)` and `<v, v> = sum_k |v_k|^2`.
 *
 * @param {Complex[]} u - Complex vector to project.
 * @param {Complex[]} v - Nonzero complex vector to project onto.
 * @returns {Complex[]} The projected complex vector of the same length.
 * @throws {TypeError} If `u` or `v` is not an array of `{ re, im }` numeric objects.
 * @throws {RangeError} If vectors are empty, have mismatched lengths, contain
 *   non-finite components, if `v` is the zero vector, or if computation overflows.
 */
export function projectionComplexIterative(u, v) {
	validateComplexVector(u, 'u')
	validateComplexVector(v, 'v')

	if (u.length !== v.length) {
		throw new RangeError(`Vector length mismatch: u has length ${u.length}, v has length ${v.length}`)
	}

	let dotRe = 0
	let dotIm = 0
	let normSq = 0

	for (let i = 0; i < u.length; i++) {
		const uRe = u[i].re
		const uIm = u[i].im
		const vRe = v[i].re
		const vIm = v[i].im

		// u_i * conj(v_i) = (uRe + i*uIm)(vRe - i*vIm)
		dotRe += uRe * vRe + uIm * vIm
		dotIm += uIm * vRe - uRe * vIm

		// |v_i|^2 = vRe^2 + vIm^2
		normSq += vRe * vRe + vIm * vIm
	}

	if (normSq === 0) {
		throw new RangeError('Cannot project onto the zero vector')
	}
	if (!Number.isFinite(normSq) || !Number.isFinite(dotRe) || !Number.isFinite(dotIm)) {
		throw new RangeError('Numeric overflow while computing complex projection')
	}

	const scaleRe = dotRe / normSq
	const scaleIm = dotIm / normSq

	const result = new Array(v.length)
	for (let i = 0; i < v.length; i++) {
		const vRe = v[i].re
		const vIm = v[i].im

		// (scaleRe + i*scaleIm)(vRe + i*vIm)
		const re = scaleRe * vRe - scaleIm * vIm
		const im = scaleRe * vIm + scaleIm * vRe

		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError('Numeric overflow while scaling projected vector')
		}

		result[i] = {
			re: normalizeZero(re),
			im: normalizeZero(im),
		}
	}

	return result
}
