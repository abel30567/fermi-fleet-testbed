/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validate that a value is a non-empty array of finite `{ re, im }` complex numbers.
 *
 * @param {unknown} vec
 * @param {string} name
 * @returns {Complex[]}
 */
function validateComplexVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of { re, im } complex numbers`)
	}
	if (vec.length === 0) {
		throw new RangeError(`${name} must be a non-empty array`)
	}
	for (let i = 0; i < vec.length; i++) {
		const el = vec[i]
		if (el === null || typeof el !== 'object') {
			throw new TypeError(`${name}[${i}] must be a { re, im } object`)
		}
		if (typeof el.re !== 'number' || typeof el.im !== 'number') {
			throw new TypeError(`${name}[${i}].re and ${name}[${i}].im must be numbers`)
		}
		if (!Number.isFinite(el.re) || !Number.isFinite(el.im)) {
			throw new RangeError(`${name}[${i}].re and ${name}[${i}].im must be finite numbers`)
		}
	}
	return vec
}

/**
 * Normalize negative zero to positive zero.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Compute the orthogonal projection of complex vector `u` onto non-zero complex
 * vector `v` using the Hermitian inner product:
 *
 *   proj_v(u) = (<u, v> / <v, v>) * v
 *
 * where `<u, v> = sum_{k=0}^{n-1} u_k * conj(v_k)` and
 * `<v, v> = sum_{k=0}^{n-1} |v_k|^2`.
 *
 * Uses scale normalization of `v` (invariant under non-zero real scaling) and
 * Neumaier compensated summation across the inner-product series for numerical
 * stability.
 *
 * @param {Complex[]} u - Vector to project, represented as finite `{ re, im }` entries.
 * @param {Complex[]} v - Non-zero target vector of the same length as `u`.
 * @returns {Complex[]} The projected complex vector `proj_v(u)`.
 * @throws {TypeError} If `u` or `v` is not an array of `{ re, im }` objects with numeric components.
 * @throws {RangeError} If `u` or `v` is empty, lengths differ, components are non-finite, or `v` is the zero vector.
 */
export function projectionComplexSeries(u, v) {
	validateComplexVector(u, 'u')
	validateComplexVector(v, 'v')

	const n = u.length
	if (n !== v.length) {
		throw new RangeError(`u and v must have equal length (got ${n} and ${v.length})`)
	}

	// Find infinity norm of v to prevent overflow/underflow in <v, v>.
	let scale = 0
	for (let i = 0; i < n; i++) {
		const ar = Math.abs(v[i].re)
		const ai = Math.abs(v[i].im)
		if (ar > scale) scale = ar
		if (ai > scale) scale = ai
	}

	if (scale === 0) {
		throw new RangeError('Target vector v must be non-zero')
	}

	// Accumulate <u, v_hat> and <v_hat, v_hat> with Neumaier compensated summation,
	// where v_hat = v / scale. Because proj_v(u) = (<u, v_hat> / <v_hat, v_hat>) * v_hat,
	// the scale factor cancels out identically.
	let dotReSum = 0
	let dotReComp = 0
	let dotImSum = 0
	let dotImComp = 0
	let normSqSum = 0
	let normSqComp = 0

	for (let i = 0; i < n; i++) {
		const ur = u[i].re
		const ui = u[i].im
		const vr = v[i].re / scale
		const vi = v[i].im / scale

		// u_i * conj(v_hat_i) = (ur*vr + ui*vi) + (ui*vr - ur*vi)i
		const termRe = ur * vr + ui * vi
		const tRe = dotReSum + termRe
		dotReComp += Math.abs(dotReSum) >= Math.abs(termRe)
			? (dotReSum - tRe) + termRe
			: (termRe - tRe) + dotReSum
		dotReSum = tRe

		const termIm = ui * vr - ur * vi
		const tIm = dotImSum + termIm
		dotImComp += Math.abs(dotImSum) >= Math.abs(termIm)
			? (dotImSum - tIm) + termIm
			: (termIm - tIm) + dotImSum
		dotImSum = tIm

		// |v_hat_i|^2 = vr^2 + vi^2
		const termNorm = vr * vr + vi * vi
		const tNorm = normSqSum + termNorm
		normSqComp += Math.abs(normSqSum) >= Math.abs(termNorm)
			? (normSqSum - tNorm) + termNorm
			: (termNorm - tNorm) + normSqSum
		normSqSum = tNorm
	}

	const dotRe = dotReSum + dotReComp
	const dotIm = dotImSum + dotImComp
	const normSq = normSqSum + normSqComp

	// Scalar coefficient lambda = <u, v_hat> / <v_hat, v_hat>
	const coeffRe = dotRe / normSq
	const coeffIm = dotIm / normSq

	const result = new Array(n)
	for (let i = 0; i < n; i++) {
		const vr = v[i].re / scale
		const vi = v[i].im / scale

		// lambda * v_hat_i = (coeffRe*vr - coeffIm*vi) + (coeffRe*vi + coeffIm*vr)i
		result[i] = {
			re: normalizeZero(coeffRe * vr - coeffIm * vi),
			im: normalizeZero(coeffRe * vi + coeffIm * vr),
		}
	}

	return result
}
