/**
 * Validates that a value is a 3-element array of finite IEEE-754 numbers.
 *
 * @param {unknown} vec - The value to validate.
 * @param {string} name - Descriptive name for error messages.
 * @throws {TypeError} If `vec` is not an array or contains non-number elements.
 * @throws {RangeError} If `vec` does not have length 3 or contains non-finite numbers.
 */
function validateVec3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be a 3-element array of finite numbers`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, received length ${vec.length}`)
	}
	for (let i = 0; i < 3; i++) {
		const v = vec[i]
		if (typeof v !== 'number') {
			throw new TypeError(`${name}[${i}] must be a finite number`)
		}
		if (!Number.isFinite(v)) {
			throw new RangeError(`${name}[${i}] must be a finite number`)
		}
	}
}

/**
 * Computes the curl (∇ × F) of a 3D vector field `F` at a given 3D `point`
 * over IEEE-754 float64 numbers using an iterative central finite-difference
 * approximation of the 3×3 Jacobian matrix.
 *
 * Iterates over the three coordinate axes (x, y, z), perturbing a copy of
 * `point` by ±h along each axis to estimate the partial derivatives
 * `J[i][j] = ∂F_i / ∂x_j ≈ (F_i(point + h·e_j) - F_i(point - h·e_j)) / (2h)`,
 * and returns `[∂F_z/∂y - ∂F_y/∂z, ∂F_x/∂z - ∂F_z/∂x, ∂F_y/∂x - ∂F_x/∂y]`.
 *
 * Does not mutate `point`.
 *
 * @param {(point: [number, number, number]) => [number, number, number]} F
 *   A 3D vector field function accepting a 3-element array `[x, y, z]` and
 *   returning a 3-element array `[Fx, Fy, Fz]` of finite numbers.
 * @param {[number, number, number]} point
 *   The 3D evaluation point `[x, y, z]` of finite numbers.
 * @param {number} [h=1e-6]
 *   Positive finite step size for central finite differences.
 * @returns {[number, number, number]}
 *   The estimated curl vector `[curlX, curlY, curlZ]` at `point`.
 * @throws {TypeError}
 *   If `F` is not a function, `point` or `F(...)` is not an array of numbers,
 *   or `h` is not a number.
 * @throws {RangeError}
 *   If `point` or `F(...)` is not 3-dimensional or contains non-finite numbers,
 *   if `h` is not positive/finite, or if intermediate/resulting values overflow.
 */
export function curlFloatIterative(F, point, h = 1e-6) {
	if (typeof F !== 'function') {
		throw new TypeError('F must be a function')
	}
	validateVec3(point, 'point')

	if (typeof h !== 'number') {
		throw new TypeError('h must be a positive finite number')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const twoH = 2 * h
	if (!Number.isFinite(twoH) || twoH === 0) {
		throw new RangeError('2 * h must be a non-zero finite number')
	}

	// Jacobian J[i][j] = ∂F_i / ∂x_j for i in {0,1,2}, j in {0,1,2}
	const jacobian = [
		[0, 0, 0],
		[0, 0, 0],
		[0, 0, 0],
	]

	for (let j = 0; j < 3; j++) {
		const plus = [point[0], point[1], point[2]]
		const minus = [point[0], point[1], point[2]]
		plus[j] += h
		minus[j] -= h

		if (!Number.isFinite(plus[j]) || !Number.isFinite(minus[j])) {
			throw new RangeError(`perturbed coordinate along axis ${j} is not finite`)
		}

		const fPlus = F(plus)
		validateVec3(fPlus, 'F(point + h*e_j)')

		const fMinus = F(minus)
		validateVec3(fMinus, 'F(point - h*e_j)')

		for (let i = 0; i < 3; i++) {
			const deriv = (fPlus[i] - fMinus[i]) / twoH
			if (!Number.isFinite(deriv)) {
				throw new RangeError(`partial derivative dF[${i}]/dx[${j}] is not finite`)
			}
			jacobian[i][j] = deriv
		}
	}

	const curlX = jacobian[2][1] - jacobian[1][2]
	const curlY = jacobian[0][2] - jacobian[2][0]
	const curlZ = jacobian[1][0] - jacobian[0][1]

	if (!Number.isFinite(curlX) || !Number.isFinite(curlY) || !Number.isFinite(curlZ)) {
		throw new RangeError('computed curl contains non-finite values')
	}

	return [
		curlX === 0 ? 0 : curlX,
		curlY === 0 ? 0 : curlY,
		curlZ === 0 ? 0 : curlZ,
	]
}
