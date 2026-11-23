/**
 * Computes the divergence of a complex vector field at a given point in C^n
 * using the discrete Cauchy integral / Laurent power-series identity.
 *
 * For a vector field F(z) = (F_0(z), ..., F_{n-1}(z)) over complex coordinates
 * z = (z_0, ..., z_{n-1}) with each complex number represented as `{ re, im }`,
 * the divergence is:
 *
 *   div(F)(z) = sum_{k=0}^{n-1} (dF_k / dz_k)(z)
 *
 * Each partial derivative is evaluated via Cauchy's integral formula on a
 * circle of radius r around z_k discretized with N equispaced roots of unity:
 *
 *   (dF_k / dz_k)(z) = (1 / (N * r)) * sum_{j=0}^{N-1}
 *                      (F_k(z + r * e^{i * theta_j} * e_k) - F_k(z)) * e^{-i * theta_j}
 *
 * where theta_j = 2 * pi * j / N. For holomorphic components this series
 * identity is exact for polynomials up to degree N and converges spectrally
 * as O(r^N) for general analytic fields; for smooth non-holomorphic fields it
 * yields the Wirtinger divergence sum_k (dF_k / dz_k).
 *
 * @typedef {{ re: number, im: number }} Complex
 * @typedef {(point: Complex[]) => Complex} ComplexComponentFn
 * @typedef {(point: Complex[]) => Complex[]} ComplexVectorFieldFn
 *
 * @param {ComplexVectorFieldFn | ComplexComponentFn[]} field
 *   Vector field as either a function returning an array of n complex numbers
 *   or an array of n scalar component functions each returning `{ re, im }`.
 * @param {Complex[]} point
 *   Evaluation point in C^n as a non-empty array of `{ re, im }` objects.
 * @param {{ radius?: number, terms?: number }} [options]
 *   Optional contour parameters:
 *   - `radius`: positive finite contour radius r (defaults to `1e-4 * max(1, |z_k|)` per coordinate).
 *   - `terms`: integer number of series nodes N >= 3 (defaults to 16).
 * @returns {Complex} The complex divergence `{ re, im }`.
 */
export function divergenceComplexSeries(field, point, options = {}) {
	validatePoint(point)
	const dim = point.length
	const isFnField = typeof field === 'function'
	const isArrayField = Array.isArray(field)

	if (!isFnField && !isArrayField) {
		throw new TypeError('field must be a function or an array of component functions')
	}

	if (isArrayField) {
		if (field.length !== dim) {
			throw new RangeError(
				`field component count (${field.length}) must match point dimension (${dim})`
			)
		}
		for (let k = 0; k < dim; k++) {
			if (typeof field[k] !== 'function') {
				throw new TypeError(`field[${k}] must be a function`)
			}
		}
	}

	const { radius, terms } = parseOptions(options)

	const basePoint = point.map((c) => ({ re: c.re, im: c.im }))

	const cosTable = new Float64Array(terms)
	const sinTable = new Float64Array(terms)
	const step = (2 * Math.PI) / terms
	for (let j = 0; j < terms; j++) {
		const theta = j * step
		cosTable[j] = Math.cos(theta)
		sinTable[j] = Math.sin(theta)
	}

	let centerVec = null
	if (isFnField) {
		centerVec = evaluateVectorField(field, basePoint.slice(), dim)
	}

	let divRe = 0
	let divIm = 0

	for (let k = 0; k < dim; k++) {
		const zk = basePoint[k]
		const rk = radius ?? 1e-4 * Math.max(1, Math.hypot(zk.re, zk.im))

		const centerVal = isFnField
			? centerVec[k]
			: validateComplex(field[k](basePoint.slice()), `field[${k}](point)`)

		let sumRe = 0
		let sumIm = 0

		for (let j = 0; j < terms; j++) {
			const cosT = cosTable[j]
			const sinT = sinTable[j]

			const sample = basePoint.slice()
			sample[k] = {
				re: zk.re + rk * cosT,
				im: zk.im + rk * sinT,
			}

			const val = isFnField
				? evaluateVectorField(field, sample, dim)[k]
				: validateComplex(field[k](sample), `field[${k}](sample)`)

			const du = val.re - centerVal.re
			const dv = val.im - centerVal.im

			// Multiply (du + i*dv) by e^{-i*theta} = cosT - i*sinT
			sumRe += du * cosT + dv * sinT
			sumIm += dv * cosT - du * sinT
		}

		const scale = terms * rk
		divRe += sumRe / scale
		divIm += sumIm / scale
	}

	if (!Number.isFinite(divRe) || !Number.isFinite(divIm)) {
		throw new RangeError('divergence computation resulted in a non-finite value')
	}

	return {
		re: divRe === 0 ? 0 : divRe,
		im: divIm === 0 ? 0 : divIm,
	}
}

function validateComplex(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be a complex number object { re, im }`)
	}
	if (typeof value.re !== 'number' || !Number.isFinite(value.re)) {
		throw new RangeError(`${label}.re must be a finite number`)
	}
	if (typeof value.im !== 'number' || !Number.isFinite(value.im)) {
		throw new RangeError(`${label}.im must be a finite number`)
	}
	return value
}

function validatePoint(point) {
	if (!Array.isArray(point) || point.length === 0) {
		throw new TypeError('point must be a non-empty array of complex numbers { re, im }')
	}
	for (let i = 0; i < point.length; i++) {
		validateComplex(point[i], `point[${i}]`)
	}
}

function evaluateVectorField(field, sample, dim) {
	const result = field(sample)
	if (!Array.isArray(result) || result.length !== dim) {
		throw new RangeError(
			`field(point) must return an array of length ${dim}`
		)
	}
	for (let k = 0; k < dim; k++) {
		validateComplex(result[k], `field(point)[${k}]`)
	}
	return result
}

function parseOptions(options) {
	if (options === undefined) {
		return { radius: undefined, terms: 16 }
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	let radius
	if (options.radius !== undefined) {
		if (typeof options.radius !== 'number' || !Number.isFinite(options.radius) || options.radius <= 0) {
			throw new RangeError('options.radius must be a positive finite number')
		}
		radius = options.radius
	}

	let terms = 16
	if (options.terms !== undefined) {
		if (
			typeof options.terms !== 'number' ||
			!Number.isInteger(options.terms) ||
			options.terms < 3
		) {
			throw new RangeError('options.terms must be an integer >= 3')
		}
		terms = options.terms
	}

	return { radius, terms }
}
