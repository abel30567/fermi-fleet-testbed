/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validate that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {string} vectorName - Parameter name for error messages.
 * @param {number} index - Element index within the vector.
 * @throws {TypeError} If the element is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function assertComplex(value, vectorName, index) {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError(`${vectorName}[${index}] must be a complex number object { re, im }`)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${vectorName}[${index}] must have numeric re and im properties`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${vectorName}[${index}] must have finite re and im values`)
	}
}

/**
 * Normalize `-0` to `0` while leaving all other numbers unchanged.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Compute the orthogonal vector projection of complex vector `u` onto nonzero
 * complex vector `v` using a straightforward iterative implementation.
 *
 * Uses the standard Hermitian inner product:
 *
 *   proj_v(u) = (<u, v> / <v, v>) * v
 *
 * where `<u, v> = sum_k u_k * conj(v_k)` and `<v, v> = sum_k |v_k|^2`.
 *
 * @param {Complex[]} u - Source complex vector to project.
 * @param {Complex[]} v - Nonzero target complex vector to project onto.
 * @returns {Complex[]} New complex vector representing the projection of `u` onto `v`.
 * @throws {TypeError} If `u` or `v` is not an array, or any element is not a `{ re, im }` object with numeric fields.
 * @throws {RangeError} If `u` and `v` have different lengths, are empty, contain non-finite values, or `v` is the zero vector.
 */
export function projectionComplexIterative(u, v) {
	if (!Array.isArray(u)) {
		throw new TypeError('u must be an array of complex numbers')
	}
	if (!Array.isArray(v)) {
		throw new TypeError('v must be an array of complex numbers')
	}
	const n = u.length
	if (n !== v.length) {
		throw new RangeError(`Vectors must have the same length (got ${n} and ${v.length})`)
	}
	if (n === 0) {
		throw new RangeError('Vectors must be non-empty')
	}

	let dotRe = 0
	let dotIm = 0
	let normSq = 0

	for (let i = 0; i < n; i++) {
		const ui = u[i]
		const vi = v[i]
		assertComplex(ui, 'u', i)
		assertComplex(vi, 'v', i)

		// u_i * conj(v_i) = (u.re + i*u.im)(v.re - i*v.im)
		dotRe += ui.re * vi.re + ui.im * vi.im
		dotIm += ui.im * vi.re - ui.re * vi.im

		// |v_i|^2 = v.re^2 + v.im^2
		normSq += vi.re * vi.re + vi.im * vi.im
	}

	if (normSq === 0) {
		throw new RangeError('Cannot project onto the zero vector')
	}
	if (!Number.isFinite(normSq) || !Number.isFinite(dotRe) || !Number.isFinite(dotIm)) {
		throw new RangeError('Intermediate inner product overflowed to a non-finite value')
	}

	const scaleRe = dotRe / normSq
	const scaleIm = dotIm / normSq

	const result = new Array(n)
	for (let i = 0; i < n; i++) {
		const vi = v[i]
		// (scaleRe + i*scaleIm) * (v.re + i*v.im)
		const re = scaleRe * vi.re - scaleIm * vi.im
		const im = scaleRe * vi.im + scaleIm * vi.re
		result[i] = {
			re: normalizeZero(re),
			im: normalizeZero(im),
		}
	}

	return result
}
