/**
 * Default base step size for the 5-point central difference stencil (2^-12 ≈ 2.4414e-4).
 *
 * For an O(h^4) stencil in IEEE-754 float64 (ε = 2^-52), the optimal step balancing
 * truncation error ~ (h^4 / 30)|f^(5)| against roundoff error ~ ε / h scales as ε^(1/5)
 * (≈ 7.4e-4). Choosing the exact dyadic power 2^-12 avoids binary representation error
 * in the step size while maintaining high accuracy even for rapidly varying fields.
 */
const DEFAULT_BASE_STEP = 2 ** -12

/**
 * Validates that a value is a 3-element array of finite IEEE-754 numbers.
 *
 * @param {unknown} vec - Value to validate.
 * @param {string} label - Descriptive name for error messages.
 * @returns {readonly [number, number, number]} The validated 3-element numeric tuple.
 * @throws {TypeError} If `vec` is not an array or any element is not a number.
 * @throws {RangeError} If `vec` does not have length 3 or any element is non-finite.
 */
function validateVec3(vec, label) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${label} must be an array of 3 finite numbers`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${label} must have length 3, received length ${vec.length}`)
	}
	for (let i = 0; i < 3; i++) {
		const value = vec[i]
		if (typeof value !== 'number') {
			throw new TypeError(`${label}[${i}] must be a number`)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(`${label}[${i}] must be a finite number`)
		}
	}
	return vec
}

/**
 * Evaluates a 3D vector field `F` at `(x, y, z)` and validates its 3D finite output.
 *
 * @param {(point: [number, number, number]) => [number, number, number]} F
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {[number, number, number]}
 */
function evaluateField(F, x, y, z) {
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
		throw new RangeError('Stencil evaluation point overflowed finite float64 range')
	}
	return validateVec3(F([x, y, z]), 'F(point)')
}

/**
 * Computes the 5-point central difference approximation of a first derivative:
 *   f'(t) = (8 * (f(t + h) - f(t - h)) - (f(t + 2h) - f(t - 2h))) / (12 * h)
 * Derived from the Taylor series expansion around `t`, canceling terms up to O(h^4)
 * with leading truncation error (h^4 / 30) * f^(5)(t).
 *
 * Symmetric pairs are differenced first to minimize catastrophic cancellation.
 *
 * @param {number} fm2 - f(t - 2h)
 * @param {number} fm1 - f(t - h)
 * @param {number} fp1 - f(t + h)
 * @param {number} fp2 - f(t + 2h)
 * @param {number} h - Positive step size
 * @returns {number}
 */
function stencil5Derivative(fm2, fm1, fp1, fp2, h) {
	const numerator = 8 * (fp1 - fm1) - (fp2 - fm2)
	const denom = 12 * h
	return Number.isFinite(denom) ? numerator / denom : numerator / 12 / h
}

/**
 * Computes an adaptive float64-aligned step size for coordinate `coord` when `h` is omitted.
 *
 * @param {number} coord
 * @returns {number}
 */
function defaultAxisStep(coord) {
	const raw = DEFAULT_BASE_STEP * Math.max(1, Math.abs(coord))
	const shifted = coord + raw
	const aligned = shifted - coord
	if (!Number.isFinite(aligned) || aligned <= 0) {
		throw new RangeError('Coordinate magnitude exceeds representable stencil step range')
	}
	return aligned
}

/**
 * Normalizes IEEE-754 negative zero (`-0`) to `+0`.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Computes the 3D curl of a vector field `F([x, y, z]) -> [Fx, Fy, Fz]` at `point`:
 *
 *   (∇ × F)(x, y, z) = (∂Fz/∂y - ∂Fy/∂z, ∂Fx/∂z - ∂Fz/∂x, ∂Fy/∂x - ∂Fx/∂y)
 *
 * Each partial derivative is evaluated using the Taylor-series-derived 5-point central
 * difference stencil (4 off-center points, center weight 0, truncation error O(h^4)):
 *
 *   ∂g/∂u ≈ (8(g(u + h) - g(u - h)) - (g(u + 2h) - g(u - 2h))) / (12h)
 *
 * Because each axis stencil yields all three field components simultaneously, all six
 * required partial derivatives are computed in 12 evaluations of `F`. The input `point`
 * array is never mutated.
 *
 * @param {(point: [number, number, number]) => [number, number, number]} F
 *   3D vector field mapping `[x, y, z]` to `[Fx, Fy, Fz]`.
 * @param {readonly [number, number, number]} point
 *   3-element array of finite IEEE-754 float64 coordinates `[x, y, z]`.
 * @param {number} [h]
 *   Optional positive finite step size. When omitted, an axis-scaled step
 *   `2^-12 * max(1, |coord|)` aligned to float64 spacing is used per coordinate.
 * @returns {[number, number, number]}
 *   The 3D curl vector `[curlX, curlY, curlZ]` at `point`.
 * @throws {TypeError}
 *   If `F` is not a function, `point` is not an array of numbers, `h` is provided and
 *   not a number, or `F` does not return an array of numbers.
 * @throws {RangeError}
 *   If `point` or `F`'s return value does not have length 3, contains non-finite numbers,
 *   `h` is non-positive or non-finite, or intermediate/result values overflow float64.
 */
export function curlFloatSeries(F, point, h) {
	if (typeof F !== 'function') {
		throw new TypeError('F must be a function')
	}

	const [x, y, z] = validateVec3(point, 'point')

	let hx
	let hy
	let hz

	if (h !== undefined) {
		if (typeof h !== 'number') {
			throw new TypeError('h must be a number')
		}
		if (!Number.isFinite(h) || h <= 0) {
			throw new RangeError('h must be a positive finite number')
		}
		hx = h
		hy = h
		hz = h
	} else {
		hx = defaultAxisStep(x)
		hy = defaultAxisStep(y)
		hz = defaultAxisStep(z)
	}

	// Evaluate 5-point stencil (off-center nodes ±h, ±2h) along the x-axis
	const fxm2 = evaluateField(F, x - 2 * hx, y, z)
	const fxm1 = evaluateField(F, x - hx, y, z)
	const fxp1 = evaluateField(F, x + hx, y, z)
	const fxp2 = evaluateField(F, x + 2 * hx, y, z)

	// Evaluate 5-point stencil along the y-axis
	const fym2 = evaluateField(F, x, y - 2 * hy, z)
	const fym1 = evaluateField(F, x, y - hy, z)
	const fyp1 = evaluateField(F, x, y + hy, z)
	const fyp2 = evaluateField(F, x, y + 2 * hy, z)

	// Evaluate 5-point stencil along the z-axis
	const fzm2 = evaluateField(F, x, y, z - 2 * hz)
	const fzm1 = evaluateField(F, x, y, z - hz)
	const fzp1 = evaluateField(F, x, y, z + hz)
	const fzp2 = evaluateField(F, x, y, z + 2 * hz)

	// Partial derivatives needed for ∇ × F
	const dFz_dy = stencil5Derivative(fym2[2], fym1[2], fyp1[2], fyp2[2], hy)
	const dFy_dz = stencil5Derivative(fzm2[1], fzm1[1], fzp1[1], fzp2[1], hz)

	const dFx_dz = stencil5Derivative(fzm2[0], fzm1[0], fzp1[0], fzp2[0], hz)
	const dFz_dx = stencil5Derivative(fxm2[2], fxm1[2], fxp1[2], fxp2[2], hx)

	const dFy_dx = stencil5Derivative(fxm2[1], fxm1[1], fxp1[1], fxp2[1], hx)
	const dFx_dy = stencil5Derivative(fym2[0], fym1[0], fyp1[0], fyp2[0], hy)

	const curlX = normalizeZero(dFz_dy - dFy_dz)
	const curlY = normalizeZero(dFx_dz - dFz_dx)
	const curlZ = normalizeZero(dFy_dx - dFx_dy)

	if (!Number.isFinite(curlX) || !Number.isFinite(curlY) || !Number.isFinite(curlZ)) {
		throw new RangeError('Computed curl overflowed finite float64 range')
	}

	return [curlX, curlY, curlZ]
}
