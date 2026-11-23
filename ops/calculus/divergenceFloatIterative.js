/**
 * Computes the numerical divergence of an n-dimensional vector field at a point
 * over IEEE-754 float64 Numbers using a straightforward iterative central
 * finite-difference loop.
 *
 * For a vector field F: R^n -> R^n, the divergence at x = (x_0, ..., x_{n-1}) is:
 *   div(F)(x) = sum_{i=0}^{n-1} (dF_i / dx_i)(x)
 *
 * Each partial derivative dF_i / dx_i is approximated via central differences:
 *   (F_i(x + h * e_i) - F_i(x - h * e_i)) / ((x_i + h) - (x_i - h))
 *
 * @param {((point: number[]) => number[]) | Array<(point: number[]) => number>} field
 *   Vector field to differentiate: either a function mapping a coordinate array
 *   of length n to an output vector of length n, or an array of n scalar
 *   component functions each mapping a coordinate array of length n to a number.
 * @param {number[]} point
 *   Non-empty array of finite IEEE-754 float64 coordinates at which to evaluate
 *   the divergence. The input array is not mutated.
 * @param {number} [step=1e-6]
 *   Positive finite step size h for central finite differences.
 * @returns {number} Numerical divergence of `field` at `point`.
 * @throws {TypeError} If `field` is not a function or array of functions,
 *   `point` is not an array of numbers, `step` is not a number, or `field`
 *   returns non-numeric / non-array values.
 * @throws {RangeError} If `point` is empty, any coordinate or output is
 *   non-finite, `step` is not positive/finite or underflows relative to a
 *   coordinate, or output/component dimensionality does not match `point.length`.
 */
export function divergenceFloatIterative(field, point, step = 1e-6) {
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of finite numbers')
	}
	const dim = point.length
	if (dim === 0) {
		throw new RangeError('point must be a non-empty array')
	}
	for (let i = 0; i < dim; i += 1) {
		const coord = point[i]
		if (typeof coord !== 'number') {
			throw new TypeError(`point[${i}] must be a number`)
		}
		if (!Number.isFinite(coord)) {
			throw new RangeError(`point[${i}] must be a finite number`)
		}
	}

	if (typeof step !== 'number') {
		throw new TypeError('step must be a number')
	}
	if (!Number.isFinite(step) || step <= 0) {
		throw new RangeError('step must be a positive finite number')
	}

	const isVectorFn = typeof field === 'function'
	const isComponentArray = Array.isArray(field)
	if (!isVectorFn && !isComponentArray) {
		throw new TypeError('field must be a function or an array of functions')
	}
	if (isComponentArray) {
		if (field.length !== dim) {
			throw new RangeError(
				`field component count (${field.length}) must match point dimension (${dim})`,
			)
		}
		for (let i = 0; i < dim; i += 1) {
			if (typeof field[i] !== 'function') {
				throw new TypeError(`field[${i}] must be a function`)
			}
		}
	}

	let divergence = 0

	for (let i = 0; i < dim; i += 1) {
		const xi = point[i]
		const xPlusVal = xi + step
		const xMinusVal = xi - step
		if (!Number.isFinite(xPlusVal) || !Number.isFinite(xMinusVal)) {
			throw new RangeError(`perturbed coordinate at index ${i} overflowed float64`)
		}
		const denom = xPlusVal - xMinusVal
		if (denom === 0) {
			throw new RangeError(
				`step (${step}) is too small to perturb point[${i}] (${xi}) in IEEE-754 float64`,
			)
		}

		const plusPoint = point.slice()
		plusPoint[i] = xPlusVal
		const minusPoint = point.slice()
		minusPoint[i] = xMinusVal

		let fPlus
		let fMinus
		if (isVectorFn) {
			const vecPlus = field(plusPoint)
			const vecMinus = field(minusPoint)
			if (!Array.isArray(vecPlus) || !Array.isArray(vecMinus)) {
				throw new TypeError('field function must return an array of finite numbers')
			}
			if (vecPlus.length !== dim || vecMinus.length !== dim) {
				throw new RangeError(
					`field output dimension must match point dimension (${dim})`,
				)
			}
			fPlus = vecPlus[i]
			fMinus = vecMinus[i]
		} else {
			fPlus = field[i](plusPoint)
			fMinus = field[i](minusPoint)
		}

		if (typeof fPlus !== 'number' || typeof fMinus !== 'number') {
			throw new TypeError(`field component ${i} must return a number`)
		}
		if (!Number.isFinite(fPlus) || !Number.isFinite(fMinus)) {
			throw new RangeError(`field component ${i} returned a non-finite value`)
		}

		const partial = (fPlus - fMinus) / denom
		if (!Number.isFinite(partial)) {
			throw new RangeError(`partial derivative at index ${i} overflowed float64`)
		}
		divergence += partial
	}

	if (!Number.isFinite(divergence)) {
		throw new RangeError('divergence accumulation overflowed float64')
	}

	return divergence === 0 ? 0 : divergence
}
