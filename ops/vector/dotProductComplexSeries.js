/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalize -0 to 0.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validate that a value is a finite complex number `{ re, im }`.
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function validateComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`)
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (value)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}
	return { re, im }
}

/**
 * Validate that a value is an array of finite complex numbers.
 * @param {unknown} vec
 * @param {string} name
 * @returns {Complex[]}
 */
function validateComplexVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of complex numbers { re, im }`)
	}
	const result = new Array(vec.length)
	for (let i = 0; i < vec.length; i++) {
		result[i] = validateComplex(vec[i], `${name}[${i}]`)
	}
	return result
}

/**
 * Neumaier compensated addition step to reduce floating-point rounding error.
 * @param {{ sum: number, comp: number }} acc
 * @param {number} x
 */
function neumaierAdd(acc, x) {
	const t = acc.sum + x
	if (Number.isFinite(t)) {
		if (Math.abs(acc.sum) >= Math.abs(x)) {
			acc.comp += (acc.sum - t) + x
		} else {
			acc.comp += (x - t) + acc.sum
		}
	}
	acc.sum = t
}

/**
 * Computes the dot product (Hermitian inner product by default) of two complex
 * vectors represented as arrays of `{ re, im }` objects.
 *
 * Uses the exact closed-form componentwise identity with Neumaier compensated
 * summation for numerical stability:
 *
 * - When `conjugate` is `true` (default, standard Hermitian inner product):
 *   $$\langle u, v \rangle = \sum_{k=0}^{n-1} u_k \overline{v_k}
 *   = \sum_{k=0}^{n-1} \left[(u_{k,\mathrm{re}} v_{k,\mathrm{re}} + u_{k,\mathrm{im}} v_{k,\mathrm{im}})
 *   + i(u_{k,\mathrm{im}} v_{k,\mathrm{re}} - u_{k,\mathrm{re}} v_{k,\mathrm{im}})\right]$$
 *   which satisfies the complex polarization identity
 *   $\langle u, v \rangle = \frac{1}{4}(\|u+v\|^2 - \|u-v\|^2 + i\|u+iv\|^2 - i\|u-iv\|^2)$.
 *
 * - When `conjugate` is `false` (bilinear complex dot product):
 *   $$u \cdot v = \sum_{k=0}^{n-1} u_k v_k
 *   = \sum_{k=0}^{n-1} \left[(u_{k,\mathrm{re}} v_{k,\mathrm{re}} - u_{k,\mathrm{im}} v_{k,\mathrm{im}})
 *   + i(u_{k,\mathrm{re}} v_{k,\mathrm{im}} + u_{k,\mathrm{im}} v_{k,\mathrm{re}})\right]$$
 *
 * @param {Complex[]} u First complex vector.
 * @param {Complex[]} v Second complex vector (must have the same length as `u`).
 * @param {{ conjugate?: boolean }} [options] Optional configuration.
 * @returns {Complex} The complex dot product `{ re, im }`.
 * @throws {TypeError} If `u`, `v`, any element, or `options` has an invalid type.
 * @throws {RangeError} If `u` and `v` have different lengths or contain non-finite components.
 */
export function dotProductComplexSeries(u, v, options = {}) {
	const vecU = validateComplexVector(u, 'u')
	const vecV = validateComplexVector(v, 'v')

	if (vecU.length !== vecV.length) {
		throw new RangeError(
			`Vectors must have the same length (got ${vecU.length} and ${vecV.length})`
		)
	}

	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const { conjugate = true } = options
	if (typeof conjugate !== 'boolean') {
		throw new TypeError('options.conjugate must be a boolean')
	}

	const reAcc = { sum: 0, comp: 0 }
	const imAcc = { sum: 0, comp: 0 }

	if (conjugate) {
		for (let i = 0; i < vecU.length; i++) {
			const a = vecU[i].re
			const b = vecU[i].im
			const c = vecV[i].re
			const d = vecV[i].im
			neumaierAdd(reAcc, a * c)
			neumaierAdd(reAcc, b * d)
			neumaierAdd(imAcc, b * c)
			neumaierAdd(imAcc, -a * d)
		}
	} else {
		for (let i = 0; i < vecU.length; i++) {
			const a = vecU[i].re
			const b = vecU[i].im
			const c = vecV[i].re
			const d = vecV[i].im
			neumaierAdd(reAcc, a * c)
			neumaierAdd(reAcc, -b * d)
			neumaierAdd(imAcc, a * d)
			neumaierAdd(imAcc, b * c)
		}
	}

	return {
		re: normalizeZero(reAcc.sum + reAcc.comp),
		im: normalizeZero(imAcc.sum + imAcc.comp),
	}
}
