/**
 * @typedef {{ v: number, d: number }} Dual
 * A dual number carrying a primal value `v` and a forward-mode derivative `d`.
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} dual - Value to validate.
 * @param {string} label - Descriptive label used in error messages.
 * @throws {TypeError} If `dual` is not an object with finite numeric `v` and `d` properties.
 */
function validateDual(dual, label) {
	if (dual === null || typeof dual !== 'object' || Array.isArray(dual)) {
		throw new TypeError(`${label} must be a dual number object { v, d }`)
	}
	if (typeof dual.v !== 'number' || !Number.isFinite(dual.v)) {
		throw new TypeError(`${label}.v must be a finite number`)
	}
	if (typeof dual.d !== 'number' || !Number.isFinite(dual.d)) {
		throw new TypeError(`${label}.d must be a finite number`)
	}
}

/**
 * Validates that a value is a 3-element array of valid dual numbers.
 *
 * @param {unknown} vec - Vector to validate.
 * @param {string} label - Descriptive label used in error messages.
 * @throws {TypeError} If `vec` is not an array or contains invalid dual elements.
 * @throws {RangeError} If `vec.length !== 3`.
 */
function validateDualVec3(vec, label) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${label} must be an array of 3 dual numbers`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${label} must have length 3, received length ${vec.length}`)
	}
	for (let i = 0; i < 3; i++) {
		validateDual(vec[i], `${label}[${i}]`)
	}
}

/**
 * Evaluates the exact primal 3D curl of `field` at a numeric coordinate triple `coords`
 * by iteratively assembling the 3x3 Jacobian matrix using forward-mode dual seeding.
 *
 * @param {(dualVec3: Dual[]) => Dual[]} field - 3D vector field over dual numbers.
 * @param {number[]} coords - 3-element array of finite primal coordinates `[x, y, z]`.
 * @returns {number[]} Primal curl vector `[∂Fz/∂y - ∂Fy/∂z, ∂Fx/∂z - ∂Fz/∂x, ∂Fy/∂x - ∂Fx/∂y]`.
 */
function computePrimalCurl(field, coords) {
	const jacobian = [
		[0, 0, 0],
		[0, 0, 0],
		[0, 0, 0],
	]

	for (let c = 0; c < 3; c++) {
		const args = new Array(3)
		for (let j = 0; j < 3; j++) {
			args[j] = { v: coords[j], d: j === c ? 1 : 0 }
		}

		const out = field(args)
		validateDualVec3(out, 'field output')

		for (let r = 0; r < 3; r++) {
			jacobian[r][c] = out[r].d
		}
	}

	const curlV = [0, 0, 0]
	for (let i = 0; i < 3; i++) {
		const j = (i + 1) % 3
		const k = (i + 2) % 3
		const value = jacobian[k][j] - jacobian[j][k]
		if (!Number.isFinite(value)) {
			throw new RangeError(`Computed curl primal component [${i}] is not finite`)
		}
		curlV[i] = value === 0 ? 0 : value
	}

	return curlV
}

/**
 * Computes the 3D vector field curl `∇ × F` over dual numbers `{ v, d }` at `point`
 * using a straightforward iterative implementation.
 *
 * The primal curl components are obtained exactly from the 3x3 Jacobian matrix
 * `J[r][c] = ∂F_r / ∂x_c` computed via forward-mode dual seeding:
 * `curl_i = J[(i + 2) % 3][(i + 1) % 3] - J[(i + 1) % 3][(i + 2) % 3]`.
 *
 * The forward-mode derivative components `d/dt [(∇ × F)_i(point.v + t * point.d)]` at `t = 0`
 * are zero when all `point[c].d === 0`, and otherwise computed iteratively via
 * Richardson-extrapolated central differences of the exact primal curl along the unit direction
 * of `point.d`.
 *
 * @param {(dualVec3: Dual[]) => Dual[]} field - 3D vector field mapping a 3-element dual vector to a 3-element dual vector.
 * @param {Dual[]} point - 3-element array of dual numbers `[{ v, d }, { v, d }, { v, d }]` at which to evaluate the curl.
 * @returns {Dual[]} 3-element array of dual numbers representing `(∇ × F)(point)` and its forward-mode derivative.
 * @throws {TypeError} If `field` is not a function, `point` is not an array of valid duals, or `field` returns invalid duals.
 * @throws {RangeError} If `point.length !== 3`, `field` output length is not 3, or computed components are non-finite.
 */
export function curlDualIterative(field, point) {
	if (typeof field !== 'function') {
		throw new TypeError('field must be a function')
	}
	validateDualVec3(point, 'point')

	const baseV = [point[0].v, point[1].v, point[2].v]
	const baseD = [point[0].d, point[1].d, point[2].d]

	const curlV = computePrimalCurl(field, baseV)
	const curlD = [0, 0, 0]

	const dirNorm = Math.hypot(baseD[0], baseD[1], baseD[2])
	if (dirNorm > 0) {
		const unitDir = [0, 0, 0]
		for (let c = 0; c < 3; c++) {
			unitDir[c] = baseD[c] / dirNorm
		}

		const posScale = Math.max(1, Math.hypot(baseV[0], baseV[1], baseV[2]))
		const steps = [1e-4 * posScale, 5e-5 * posScale]
		const centralDiffs = [
			[0, 0, 0],
			[0, 0, 0],
		]

		for (let s = 0; s < steps.length; s++) {
			const h = steps[s]
			const pPlus = [0, 0, 0]
			const pMinus = [0, 0, 0]
			for (let c = 0; c < 3; c++) {
				pPlus[c] = baseV[c] + h * unitDir[c]
				pMinus[c] = baseV[c] - h * unitDir[c]
			}

			const curlPlus = computePrimalCurl(field, pPlus)
			const curlMinus = computePrimalCurl(field, pMinus)

			for (let i = 0; i < 3; i++) {
				centralDiffs[s][i] = (curlPlus[i] - curlMinus[i]) / (2 * h)
			}
		}

		for (let i = 0; i < 3; i++) {
			const deriv = dirNorm * ((4 * centralDiffs[1][i] - centralDiffs[0][i]) / 3)
			if (!Number.isFinite(deriv)) {
				throw new RangeError(`Computed curl derivative component [${i}] is not finite`)
			}
			curlD[i] = deriv === 0 ? 0 : deriv
		}
	}

	const result = new Array(3)
	for (let i = 0; i < 3; i++) {
		result[i] = { v: curlV[i], d: curlD[i] }
	}
	return result
}
