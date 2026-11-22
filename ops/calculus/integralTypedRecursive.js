/**
 * Computes the definite numerical integral of sampled values in a `Float64Array`
 * using a recursive divide-and-conquer trapezoidal rule.
 *
 * The interval of indices `[lo, hi]` is recursively bisected at `mid = Math.floor((lo + hi) / 2)`
 * and summed in a balanced binary tree (`O(log n)` call stack depth), which reduces
 * floating-point accumulation drift compared to naive sequential summation.
 *
 * Supports either uniform spacing `dx` (default `1`) or an explicit `Float64Array`
 * of sample coordinates `x` matching `y.length`.
 *
 * @param {Float64Array} y - Sampled function values `y[0..n-1]`. All elements must be finite.
 * @param {number | Float64Array} [xOrDx=1] - Uniform spacing `dx` (finite number) or a
 *   `Float64Array` of finite sample coordinates `x` with `x.length === y.length`.
 * @returns {number} Approximate definite integral over the sampled domain (`0` when `y.length < 2`).
 * @throws {TypeError} If `y` is not a `Float64Array`, or if `xOrDx` is neither a `number` nor a `Float64Array`.
 * @throws {RangeError} If any value in `y` or `xOrDx` is non-finite (`NaN`, `Infinity`, `-Infinity`),
 *   or if `xOrDx` is a `Float64Array` whose length does not match `y.length`.
 */
export function integralTypedRecursive(y, xOrDx = 1) {
	if (!(y instanceof Float64Array)) {
		throw new TypeError('Expected "y" to be a Float64Array')
	}

	for (let i = 0; i < y.length; i++) {
		if (!Number.isFinite(y[i])) {
			throw new RangeError(`Expected all elements of "y" to be finite numbers (invalid value at index ${i})`)
		}
	}

	let useCoords = false
	if (typeof xOrDx === 'number') {
		if (!Number.isFinite(xOrDx)) {
			throw new RangeError('Expected spacing "dx" to be a finite number')
		}
	} else if (xOrDx instanceof Float64Array) {
		if (xOrDx.length !== y.length) {
			throw new RangeError(
				`Expected "x" and "y" to have the same length (got x.length=${xOrDx.length}, y.length=${y.length})`
			)
		}
		for (let i = 0; i < xOrDx.length; i++) {
			if (!Number.isFinite(xOrDx[i])) {
				throw new RangeError(
					`Expected all elements of "x" to be finite numbers (invalid value at index ${i})`
				)
			}
		}
		useCoords = true
	} else {
		throw new TypeError('Expected second argument "xOrDx" to be a finite number or a Float64Array')
	}

	if (y.length < 2) {
		return 0
	}

	const total = useCoords
		? integrateNonUniform(y, xOrDx, 0, y.length - 1)
		: integrateUniform(y, xOrDx, 0, y.length - 1)

	return total === 0 ? 0 : total
}

/**
 * Recursive divide-and-conquer trapezoidal integration with uniform spacing `dx`.
 *
 * @param {Float64Array} y
 * @param {number} dx
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Inclusive end index.
 * @returns {number}
 */
function integrateUniform(y, dx, lo, hi) {
	if (hi <= lo) {
		return 0
	}
	if (hi - lo === 1) {
		return 0.5 * (y[lo] + y[hi]) * dx
	}
	const mid = Math.floor((lo + hi) / 2)
	return integrateUniform(y, dx, lo, mid) + integrateUniform(y, dx, mid, hi)
}

/**
 * Recursive divide-and-conquer trapezoidal integration with explicit coordinate array `x`.
 *
 * @param {Float64Array} y
 * @param {Float64Array} x
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Inclusive end index.
 * @returns {number}
 */
function integrateNonUniform(y, x, lo, hi) {
	if (hi <= lo) {
		return 0
	}
	if (hi - lo === 1) {
		return 0.5 * (y[lo] + y[hi]) * (x[hi] - x[lo])
	}
	const mid = Math.floor((lo + hi) / 2)
	return integrateNonUniform(y, x, lo, mid) + integrateNonUniform(y, x, mid, hi)
}
