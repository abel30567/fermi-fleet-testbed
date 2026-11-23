/**
 * @typedef {{ re: number, im: number }} Complex
 * A complex number represented by finite real (`re`) and imaginary (`im`) parts.
 */

/**
 * @typedef {[Complex, Complex, Complex]} ComplexVector3
 * A 3D vector whose components are complex numbers.
 */

/**
 * @typedef {(point: ComplexVector3) => ComplexVector3} ComplexVectorField3D
 * A 3D complex vector field mapping `[x, y, z]` to `[Fx, Fy, Fz]`.
 */

/**
 * Validate that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {string} label - Descriptive label for error messages.
 * @returns {Complex} The validated complex number.
 */
function assertComplex(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be an object with numeric re and im properties`)
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
 * Validate that a value is a 3-element array of finite complex numbers.
 *
 * @param {unknown} vec - Candidate 3D complex vector.
 * @param {string} label - Descriptive label for error messages.
 * @returns {ComplexVector3} A fresh 3-element array of validated complex numbers.
 */
function assertComplexVector3(vec, label) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${label} must be an array of 3 complex numbers`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${label} must have length 3, received ${vec.length}`)
	}
	/** @type {Complex[]} */
	const result = new Array(3)
	for (let i = 0; i < 3; i++) {
		result[i] = assertComplex(vec[i], `${label}[${i}]`)
	}
	return /** @type {ComplexVector3} */ (result)
}

/**
 * Normalize `-0` to `0` for clean numeric output.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Compute the 3D vector calculus curl (`∇ × F`) of a complex-valued 3D vector
 * field `F(x, y, z) = [Fx, Fy, Fz]` at `point = [x, y, z]` using a
 * straightforward iterative central-difference implementation.
 *
 * Each coordinate of `point` and each component returned by `field` is a
 * complex number `{ re, im }`. Partial derivatives along each axis `j ∈ {0, 1, 2}`
 * are approximated by central finite differences with real step `h`:
 *
 *   ∂F_i / ∂x_j ≈ (F_i(point + h·e_j) - F_i(point - h·e_j)) / (2h)
 *
 * For holomorphic fields on `ℂ³`, this matches the complex partial derivative;
 * for general smooth fields on `ℝ³ → ℂ³` (with `im === 0` in `point`), it
 * equals `∇ × Re(F) + i (∇ × Im(F))`.
 *
 * The curl components are then assembled iteratively via cyclic indexing:
 *
 *   (∇ × F)_k = ∂F_{(k+2) mod 3} / ∂x_{(k+1) mod 3} - ∂F_{(k+1) mod 3} / ∂x_{(k+2) mod 3}
 *
 * @param {ComplexVectorField3D} field - 3D complex vector field `(point) => [Fx, Fy, Fz]`.
 * @param {ComplexVector3} point - Evaluation point `[x, y, z]`, each `{ re, im }`.
 * @param {number} [h=1e-6] - Positive finite step size for central differences.
 * @returns {ComplexVector3} The curl vector `[curlX, curlY, curlZ]` as `{ re, im }` objects.
 * @throws {TypeError} If `field` is not a function, `point` or field output is not a valid 3D complex vector, or `h` is not a number.
 * @throws {RangeError} If `point` or field output does not have length 3, contains non-finite values, or `h` is not finite and positive.
 */
export function curlComplexIterative(field, point, h = 1e-6) {
	if (typeof field !== 'function') {
		throw new TypeError('field must be a function')
	}

	const basePoint = assertComplexVector3(point, 'point')

	if (typeof h !== 'number') {
		throw new TypeError('h must be a number')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a finite positive number')
	}

	const twoH = 2 * h
	if (!Number.isFinite(twoH) || twoH === 0) {
		throw new RangeError('h is out of representable range for central differences')
	}

	/**
	 * 3x3 Jacobian matrix where jacobian[i][j] = ∂F_i / ∂x_j.
	 * @type {Complex[][]}
	 */
	const jacobian = [
		new Array(3),
		new Array(3),
		new Array(3),
	]

	for (let axis = 0; axis < 3; axis++) {
		/** @type {Complex[]} */
		const plusPoint = new Array(3)
		/** @type {Complex[]} */
		const minusPoint = new Array(3)

		for (let k = 0; k < 3; k++) {
			if (k === axis) {
				const rePlus = basePoint[k].re + h
				const reMinus = basePoint[k].re - h
				if (!Number.isFinite(rePlus) || !Number.isFinite(reMinus)) {
					throw new RangeError(`Perturbed point[${k}].re overflowed to a non-finite number`)
				}
				plusPoint[k] = { re: rePlus, im: basePoint[k].im }
				minusPoint[k] = { re: reMinus, im: basePoint[k].im }
			} else {
				plusPoint[k] = { re: basePoint[k].re, im: basePoint[k].im }
				minusPoint[k] = { re: basePoint[k].re, im: basePoint[k].im }
			}
		}

		const fPlus = assertComplexVector3(
			field(/** @type {ComplexVector3} */ (plusPoint)),
			`field(point + h*e_${axis})`,
		)
		const fMinus = assertComplexVector3(
			field(/** @type {ComplexVector3} */ (minusPoint)),
			`field(point - h*e_${axis})`,
		)

		for (let comp = 0; comp < 3; comp++) {
			const dRe = (fPlus[comp].re - fMinus[comp].re) / twoH
			const dIm = (fPlus[comp].im - fMinus[comp].im) / twoH
			if (!Number.isFinite(dRe) || !Number.isFinite(dIm)) {
				throw new RangeError(`Partial derivative dF[${comp}]/dx[${axis}] overflowed to a non-finite number`)
			}
			jacobian[comp][axis] = { re: dRe, im: dIm }
		}
	}

	/** @type {Complex[]} */
	const curl = new Array(3)
	for (let k = 0; k < 3; k++) {
		const next = (k + 1) % 3
		const prev = (k + 2) % 3
		const re = normalizeZero(jacobian[prev][next].re - jacobian[next][prev].re)
		const im = normalizeZero(jacobian[prev][next].im - jacobian[next][prev].im)
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(`Curl component ${k} overflowed to a non-finite number`)
		}
		curl[k] = { re, im }
	}

	return /** @type {ComplexVector3} */ (curl)
}
