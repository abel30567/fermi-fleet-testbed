/**
 * @typedef {Object} Complex
 * @property {number} re - Real part (finite number).
 * @property {number} im - Imaginary part (finite number).
 */

/**
 * Adds a term to a Neumaier compensated-summation accumulator in place.
 *
 * @param {{ sum: number, comp: number }} acc - Accumulator state.
 * @param {number} x - Finite term to add.
 */
function neumaierAdd(acc, x) {
	const t = acc.sum + x
	if (Math.abs(acc.sum) >= Math.abs(x)) {
		acc.comp += (acc.sum - t) + x
	} else {
		acc.comp += (x - t) + acc.sum
	}
	acc.sum = t
}

/**
 * Validates an array of complex numbers `{ re, im }` and returns its max-abs
 * component scale `max_i max(|re_i|, |im_i|)`.
 *
 * @param {unknown} vec - Candidate vector.
 * @param {string} name - Parameter name for error messages.
 * @returns {number} Non-negative finite maximum component magnitude.
 * @throws {TypeError} If any element is not a `{ re, im }` object with finite numeric fields.
 */
function validateAndMaxAbs(vec, name) {
	let maxAbs = 0
	for (let i = 0; i < vec.length; i++) {
		const el = vec[i]
		if (el === null || typeof el !== 'object') {
			throw new TypeError(`${name}[${i}] must be a complex number object { re, im }`)
		}
		const { re, im } = el
		if (
			typeof re !== 'number' ||
			typeof im !== 'number' ||
			!Number.isFinite(re) ||
			!Number.isFinite(im)
		) {
			throw new TypeError(`${name}[${i}] must have finite numeric re and im properties`)
		}
		const absRe = Math.abs(re)
		const absIm = Math.abs(im)
		if (absRe > maxAbs) maxAbs = absRe
		if (absIm > maxAbs) maxAbs = absIm
	}
	return maxAbs
}

/**
 * Normalizes negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Computes the orthogonal projection of complex vector `u` onto nonzero complex
 * vector `v` using the Hermitian inner product:
 *
 *     proj_v(u) = (<u, v> / <v, v>) * v
 *
 * where `<u, v> = sum_i u_i * conj(v_i)` and `<v, v> = sum_i (|v_i|^2)`.
 *
 * Numerical stability:
 * - Both `u` and `v` are scaled by their respective max-abs component magnitudes
 *   (`scaleU`, `scaleV`) so all intermediate inner-product and norm calculations
 *   operate on O(1) values. Because `scaleV` cancels algebraically from
 *   `(<u, v> / <v, v>) * v`, overflow and underflow are avoided even for extreme
 *   scales such as `1e200`, `1e-200`, or subnormal target vectors.
 * - Neumaier compensated summation is applied to the real and imaginary parts of
 *   `<u_hat, v_hat>` and to `<v_hat, v_hat>` (summing individual product terms)
 *   to preserve accuracy under catastrophic cancellation.
 *
 * @param {readonly Complex[]} u - Complex vector to project.
 * @param {readonly Complex[]} v - Nonzero complex target vector onto which `u` is projected.
 * @returns {Complex[]} The projected complex vector `proj_v(u)` of the same length as `u` and `v`.
 * @throws {TypeError} If `u` or `v` is not an array, or any element is not a valid `{ re, im }` with finite numbers.
 * @throws {RangeError} If `u` and `v` have mismatched lengths, are empty, or `v` has zero norm.
 *
 * @example
 * projectionComplexStable(
 *   [{ re: 1, im: 2 }, { re: 3, im: -1 }],
 *   [{ re: 0, im: 1 }, { re: 1, im: 1 }]
 * )
 * // => [{ re: 5/3, im: 4/3 }, { re: 3, im: -1/3 }]
 */
export function projectionComplexStable(u, v) {
	if (!Array.isArray(u) || !Array.isArray(v)) {
		throw new TypeError('Expected u and v to be arrays of complex numbers { re, im }')
	}
	if (u.length !== v.length) {
		throw new RangeError(`Vector length mismatch: u.length (${u.length}) !== v.length (${v.length})`)
	}
	const n = u.length
	if (n === 0) {
		throw new RangeError('Input vectors u and v must not be empty')
	}

	const scaleU = validateAndMaxAbs(u, 'u')
	const scaleV = validateAndMaxAbs(v, 'v')

	if (scaleV === 0) {
		throw new RangeError('Target vector v must have nonzero norm')
	}

	if (scaleU === 0) {
		const zeros = new Array(n)
		for (let i = 0; i < n; i++) {
			zeros[i] = { re: 0, im: 0 }
		}
		return zeros
	}

	const dotRe = { sum: 0, comp: 0 }
	const dotIm = { sum: 0, comp: 0 }
	const normSq = { sum: 0, comp: 0 }

	for (let i = 0; i < n; i++) {
		const ur = u[i].re / scaleU
		const ui = u[i].im / scaleU
		const vr = v[i].re / scaleV
		const vi = v[i].im / scaleV

		// u_hat_i * conj(v_hat_i) = (ur*vr + ui*vi) + i*(ui*vr - ur*vi)
		neumaierAdd(dotRe, ur * vr)
		neumaierAdd(dotRe, ui * vi)
		neumaierAdd(dotIm, ui * vr)
		neumaierAdd(dotIm, -(ur * vi))

		// |v_hat_i|^2 = vr^2 + vi^2
		neumaierAdd(normSq, vr * vr)
		neumaierAdd(normSq, vi * vi)
	}

	const denom = normSq.sum + normSq.comp
	const alphaRe = (dotRe.sum + dotRe.comp) / denom
	const alphaIm = (dotIm.sum + dotIm.comp) / denom

	// proj_v(u)_i = scaleU * (alpha_hat * v_hat_i)
	const result = new Array(n)
	for (let i = 0; i < n; i++) {
		const vr = v[i].re / scaleV
		const vi = v[i].im / scaleV
		const re = (alphaRe * vr - alphaIm * vi) * scaleU
		const im = (alphaRe * vi + alphaIm * vr) * scaleU
		result[i] = {
			re: normalizeZero(re),
			im: normalizeZero(im),
		}
	}

	return result
}
