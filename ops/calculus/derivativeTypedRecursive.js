/**
 * Recursively validates that all elements in a Float64Array slice `[start, end)` are finite.
 *
 * @param {Float64Array} arr - Typed array to validate.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {string} label - Parameter label used in error messages.
 * @throws {RangeError} If any element is NaN or not finite.
 */
function assertAllFiniteRecursive(arr, start, end, label) {
	const len = end - start
	if (len <= 0) {
		return
	}
	if (len === 1) {
		if (!Number.isFinite(arr[start])) {
			throw new RangeError(`${label}[${start}] must be a finite number`)
		}
		return
	}
	const mid = (start + end) >>> 1
	assertAllFiniteRecursive(arr, start, mid, label)
	assertAllFiniteRecursive(arr, mid, end, label)
}

/**
 * Recursively validates that a Float64Array of coordinates is strictly monotonic
 * (either strictly increasing or strictly decreasing) over `[start, end)`.
 *
 * @param {Float64Array} x - Coordinate array with length >= 2.
 * @param {number} start - Inclusive start index of adjacent pair checks (0 <= start).
 * @param {number} end - Exclusive end index of adjacent pair checks (end <= x.length - 1).
 * @param {number} direction - Expected sign of `x[i + 1] - x[i]` (`1` for increasing, `-1` for decreasing).
 * @throws {RangeError} If coordinates are not strictly monotonic.
 */
function assertStrictlyMonotonicRecursive(x, start, end, direction) {
	const len = end - start
	if (len <= 0) {
		return
	}
	if (len === 1) {
		const diff = x[start + 1] - x[start]
		if (diff * direction <= 0) {
			throw new RangeError(
				`Coordinates x must be strictly monotonic (violation between indices ${start} and ${start + 1})`
			)
		}
		return
	}
	const mid = (start + end) >>> 1
	assertStrictlyMonotonicRecursive(x, start, mid, direction)
	assertStrictlyMonotonicRecursive(x, mid, end, direction)
}

/**
 * Computes the numerical derivative at a single index for uniform spacing `dx`.
 * Uses second-order central differences in the interior and second-order one-sided
 * differences at the boundaries (falling back to first-order when `y.length === 2`).
 *
 * @param {Float64Array} y - Input sample values.
 * @param {number} dx - Positive uniform grid spacing.
 * @param {number} i - Index at which to compute the derivative.
 * @returns {number} Approximated derivative dy/dx at index `i`.
 */
function derivativeAtUniform(y, dx, i) {
	const n = y.length
	let value
	if (n === 2) {
		value = (y[1] - y[0]) / dx
	} else if (i === 0) {
		value = (-3 * y[0] + 4 * y[1] - y[2]) / (2 * dx)
	} else if (i === n - 1) {
		value = (y[n - 3] - 4 * y[n - 2] + 3 * y[n - 1]) / (2 * dx)
	} else {
		value = (y[i + 1] - y[i - 1]) / (2 * dx)
	}
	return value === 0 ? 0 : value
}

/**
 * Computes the numerical derivative at a single index for non-uniform coordinates `x`.
 * Uses three-point Lagrange differentiation (second-order accurate) in both the interior
 * and at the boundaries (falling back to first-order when `y.length === 2`).
 *
 * @param {Float64Array} y - Input sample values.
 * @param {Float64Array} x - Strictly monotonic sample coordinates.
 * @param {number} i - Index at which to compute the derivative.
 * @returns {number} Approximated derivative dy/dx at index `i`.
 */
function derivativeAtNonUniform(y, x, i) {
	const n = y.length
	let value
	if (n === 2) {
		value = (y[1] - y[0]) / (x[1] - x[0])
	} else if (i === 0) {
		const h1 = x[1] - x[0]
		const h2 = x[2] - x[1]
		const hSum = h1 + h2
		value =
			(-(2 * h1 + h2) / (h1 * hSum)) * y[0] +
			(hSum / (h1 * h2)) * y[1] -
			(h1 / (h2 * hSum)) * y[2]
	} else if (i === n - 1) {
		const h1 = x[n - 2] - x[n - 3]
		const h2 = x[n - 1] - x[n - 2]
		const hSum = h1 + h2
		value =
			(h2 / (h1 * hSum)) * y[n - 3] -
			(hSum / (h1 * h2)) * y[n - 2] +
			((h1 + 2 * h2) / (h2 * hSum)) * y[n - 1]
	} else {
		const h1 = x[i] - x[i - 1]
		const h2 = x[i + 1] - x[i]
		const hSum = h1 + h2
		value =
			(h1 / (h2 * hSum)) * y[i + 1] +
			((h2 - h1) / (h1 * h2)) * y[i] -
			(h2 / (h1 * hSum)) * y[i - 1]
	}
	return value === 0 ? 0 : value
}

/**
 * Divide-and-conquer recursive worker that fills `out[start..end)` with element-wise derivatives.
 *
 * @param {Float64Array} y - Input sample values.
 * @param {number|Float64Array} dx - Uniform step size or coordinate Float64Array.
 * @param {boolean} isUniform - True when `dx` is a uniform scalar step size.
 * @param {Float64Array} out - Preallocated output array.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 */
function computeDerivativeRange(y, dx, isUniform, out, start, end) {
	const len = end - start
	if (len <= 0) {
		return
	}
	if (len === 1) {
		out[start] = isUniform
			? derivativeAtUniform(y, /** @type {number} */ (dx), start)
			: derivativeAtNonUniform(y, /** @type {Float64Array} */ (dx), start)
		return
	}
	const mid = (start + end) >>> 1
	computeDerivativeRange(y, dx, isUniform, out, start, mid)
	computeDerivativeRange(y, dx, isUniform, out, mid, end)
}

/**
 * Computes the element-wise numerical derivative (dy/dx) of a `Float64Array` of sampled values
 * using a recursive divide-and-conquer implementation.
 *
 * Uses second-order finite differences (central differences at interior points and
 * three-point one-sided differences at boundaries for `y.length >= 3`; first-order
 * differences when `y.length === 2`), giving exact derivatives for all linear and
 * quadratic polynomials on both uniform and non-uniform grids.
 *
 * @param {Float64Array} y - Sampled function values. Must contain only finite numbers.
 *   An empty `Float64Array` returns an empty `Float64Array`; a length of `1` throws a `RangeError`.
 * @param {number|Float64Array} [dx=1] - Either a positive finite uniform step spacing (`number`)
 *   or a strictly monotonic `Float64Array` of sample coordinates matching `y.length`.
 * @returns {Float64Array} A new `Float64Array` of the same length as `y` containing dy/dx at each point.
 * @throws {TypeError} If `y` is not a `Float64Array`, or `dx` is neither a `number` nor a `Float64Array`.
 * @throws {RangeError} If `y.length === 1`, any value in `y` or `dx` is non-finite, scalar `dx <= 0`,
 *   coordinate array `dx` has mismatched length, or coordinate array `dx` is not strictly monotonic.
 */
export function derivativeTypedRecursive(y, dx = 1) {
	if (!(y instanceof Float64Array)) {
		throw new TypeError('y must be a Float64Array')
	}

	const isUniform = typeof dx === 'number'
	if (!isUniform && !(dx instanceof Float64Array)) {
		throw new TypeError('dx must be a positive finite number or a Float64Array')
	}

	if (isUniform) {
		if (!Number.isFinite(dx) || dx <= 0) {
			throw new RangeError('dx must be a positive finite number')
		}
	} else if (dx.length !== y.length) {
		throw new RangeError('Coordinate array dx must have the same length as y')
	}

	const n = y.length
	if (n === 0) {
		return new Float64Array(0)
	}
	if (n === 1) {
		throw new RangeError('y must contain at least 2 elements to compute a derivative')
	}

	assertAllFiniteRecursive(y, 0, n, 'y')

	if (!isUniform) {
		assertAllFiniteRecursive(dx, 0, n, 'dx')
		const initialDiff = dx[1] - dx[0]
		if (initialDiff === 0) {
			throw new RangeError(
				'Coordinates x must be strictly monotonic (violation between indices 0 and 1)'
			)
		}
		const direction = initialDiff > 0 ? 1 : -1
		assertStrictlyMonotonicRecursive(dx, 0, n - 1, direction)
	}

	const out = new Float64Array(n)
	computeDerivativeRange(y, dx, isUniform, out, 0, n)
	return out
}
