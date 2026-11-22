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
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts
 * and returns a normalized copy.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ re: number, im: number }}
 * @throws {TypeError} If `value` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function assertComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label} must have numeric re and im properties`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label} must have finite re and im values`)
	}
	return { re: normalizeZero(re), im: normalizeZero(im) }
}

/**
 * Adds two complex numbers and normalizes `-0` to `0`.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 * @throws {RangeError} If the sum overflows to a non-finite value.
 */
function complexAdd(a, b) {
	const re = a.re + b.re
	const im = a.im + b.im
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Divergence accumulation overflowed to a non-finite value')
	}
	return { re: normalizeZero(re), im: normalizeZero(im) }
}

/**
 * Evaluates the complex vector field at a point perturbed along one coordinate
 * and returns the validated `index`-th component.
 *
 * @param {(point: Array<{ re: number, im: number }>) => Array<{ re: number, im: number }>} field
 * @param {Array<{ re: number, im: number }>} point
 * @param {number} index
 * @param {number} deltaRe
 * @param {number} deltaIm
 * @returns {{ re: number, im: number }}
 */
function evaluatePerturbedComponent(field, point, index, deltaRe, deltaIm) {
	const shiftedRe = point[index].re + deltaRe
	const shiftedIm = point[index].im + deltaIm
	if (!Number.isFinite(shiftedRe) || !Number.isFinite(shiftedIm)) {
		throw new RangeError(`Perturbed coordinate at index ${index} overflowed to a non-finite value`)
	}

	const perturbed = point.map((coord, i) =>
		i === index
			? { re: normalizeZero(shiftedRe), im: normalizeZero(shiftedIm) }
			: { re: coord.re, im: coord.im }
	)

	const output = field(perturbed)
	if (!Array.isArray(output)) {
		throw new TypeError('field(point) must return an array of complex numbers { re, im }')
	}
	if (output.length !== point.length) {
		throw new RangeError(
			`field(point) must return an array of length ${point.length}, got ${output.length}`
		)
	}

	return assertComplex(output[index], `field(point)[${index}]`)
}

/**
 * Computes the complex Wirtinger partial derivative dF_index / dz_index at `point`
 * using a 4-point central difference stencil along the real and imaginary axes:
 *
 *   dF_i / dz_i = (1 / 2) * (dF_i / dx_i - i * dF_i / dy_i)
 *
 * For holomorphic components this yields O(h^4) accuracy due to cancellation of
 * the O(h^2) truncation terms; for general smooth complex functions it computes
 * the exact Wirtinger partial derivative to O(h^2).
 *
 * @param {(point: Array<{ re: number, im: number }>) => Array<{ re: number, im: number }>} field
 * @param {Array<{ re: number, im: number }>} point
 * @param {number} index
 * @param {number} h
 * @returns {{ re: number, im: number }}
 */
function partialDerivativeAt(field, point, index, h) {
	const fRePlus = evaluatePerturbedComponent(field, point, index, h, 0)
	const fReMinus = evaluatePerturbedComponent(field, point, index, -h, 0)
	const fImPlus = evaluatePerturbedComponent(field, point, index, 0, h)
	const fImMinus = evaluatePerturbedComponent(field, point, index, 0, -h)

	const twoH = 2 * h
	if (!Number.isFinite(twoH) || twoH === 0) {
		throw new RangeError('Step size h causes numerical underflow or overflow in 2 * h')
	}

	const ux = (fRePlus.re - fReMinus.re) / twoH
	const vx = (fRePlus.im - fReMinus.im) / twoH
	const uy = (fImPlus.re - fImMinus.re) / twoH
	const vy = (fImPlus.im - fImMinus.im) / twoH

	const re = (ux + vy) / 2
	const im = (vx - uy) / 2

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`Partial derivative at index ${index} produced a non-finite value`)
	}

	return { re: normalizeZero(re), im: normalizeZero(im) }
}

/**
 * Recursively computes the sum of partial derivatives dF_i / dz_i for i in [lo, hi)
 * using divide-and-conquer pairwise summation.
 *
 * @param {(point: Array<{ re: number, im: number }>) => Array<{ re: number, im: number }>} field
 * @param {Array<{ re: number, im: number }>} point
 * @param {number} h
 * @param {number} lo
 * @param {number} hi
 * @returns {{ re: number, im: number }}
 */
function sumDivergenceRange(field, point, h, lo, hi) {
	if (lo >= hi) {
		return { re: 0, im: 0 }
	}
	if (hi - lo === 1) {
		return partialDerivativeAt(field, point, lo, h)
	}
	const mid = lo + Math.floor((hi - lo) / 2)
	const left = sumDivergenceRange(field, point, h, lo, mid)
	const right = sumDivergenceRange(field, point, h, mid, hi)
	return complexAdd(left, right)
}

/**
 * Computes the divergence of a complex vector field `F: C^n -> C^n` at a complex
 * `point` using a recursive divide-and-conquer algorithm over the field components.
 *
 * Algorithm:
 * - Splits the component index range `[0, n)` recursively in half until reaching
 *   single-component leaves (or an empty range returning `{ re: 0, im: 0 }`).
 * - At each leaf `i`, approximates the complex Wirtinger partial derivative
 *   `∂F_i / ∂z_i = (1/2) * (∂F_i / ∂x_i - i * ∂F_i / ∂y_i)` via central differences
 *   with step size `h` (achieving `O(h^4)` accuracy on holomorphic fields and
 *   `O(h^2)` on general smooth non-holomorphic fields).
 * - Combines subproblem results pairwise via complex addition in `O(log n)` stack depth.
 *
 * @param {(point: Array<{ re: number, im: number }>) => Array<{ re: number, im: number }>} field
 *   Complex vector field mapping an array of `n` complex numbers `{ re, im }` to an array of `n` complex numbers `{ re, im }`.
 * @param {Array<{ re: number, im: number }>} point
 *   Evaluation point in `C^n` as an array of complex numbers `{ re, im }`.
 * @param {number} [h=1e-5]
 *   Positive finite step size for central finite differences.
 * @returns {{ re: number, im: number }}
 *   The complex divergence `∇ · F(point)` as `{ re, im }` with `-0` normalized to `0`.
 * @throws {TypeError} If `field` is not a function, `point` is not an array of `{ re, im }` objects,
 *   `h` is not a number, or `field(point)` does not return an array of `{ re, im }` objects.
 * @throws {RangeError} If `h` is not finite or `<= 0`, any complex coordinate/output component is non-finite,
 *   `field(point)` returns an array whose length does not match `point.length`, or arithmetic overflows.
 */
export function divergenceComplexRecursive(field, point, h = 1e-5) {
	if (typeof field !== 'function') {
		throw new TypeError('field must be a function')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of complex numbers { re, im }')
	}
	if (typeof h !== 'number') {
		throw new TypeError('h must be a number')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const normalizedPoint = new Array(point.length)
	for (let i = 0; i < point.length; i++) {
		normalizedPoint[i] = assertComplex(point[i], `point[${i}]`)
	}

	return sumDivergenceRange(field, normalizedPoint, h, 0, normalizedPoint.length)
}
