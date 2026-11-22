/**
 * Validates that every element in `arr[lo..hi)` is a finite number using
 * divide-and-conquer recursion (O(log n) stack depth).
 *
 * @param {Float64Array} arr - Typed array to validate.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {string} label - Parameter label for error messages.
 */
function validateFiniteRecursive(arr, lo, hi, label) {
	if (hi - lo === 1) {
		if (!Number.isFinite(arr[lo])) {
			throw new RangeError(`${label}[${lo}] must be a finite number`)
		}
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	validateFiniteRecursive(arr, lo, mid, label)
	validateFiniteRecursive(arr, mid, hi, label)
}

/**
 * Validates that every element in `coords[lo..hi)` is finite and strictly
 * monotonic in the given `direction` (+1 for increasing, -1 for decreasing),
 * using divide-and-conquer recursion (O(log n) stack depth).
 *
 * @param {Float64Array} coords - Coordinate array to validate.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {1 | -1} direction - Expected strict monotonic direction.
 */
function validateCoordsRecursive(coords, lo, hi, direction) {
	if (hi - lo === 1) {
		const curr = coords[lo]
		if (!Number.isFinite(curr)) {
			throw new RangeError(`spacing[${lo}] must be a finite number`)
		}
		if (lo + 1 < coords.length) {
			const next = coords[lo + 1]
			if (!Number.isFinite(next)) {
				throw new RangeError(`spacing[${lo + 1}] must be a finite number`)
			}
			const validOrder = direction > 0 ? next > curr : next < curr
			if (!validOrder) {
				throw new RangeError(
					`spacing coordinates must be strictly monotonic (violation between index ${lo} and ${lo + 1})`
				)
			}
		}
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	validateCoordsRecursive(coords, lo, mid, direction)
	validateCoordsRecursive(coords, mid, hi, direction)
}

/**
 * Recursively computes the element-wise numerical gradient for uniform spacing
 * over the index range `[lo, hi)` using divide-and-conquer.
 *
 * @param {Float64Array} values - Input samples.
 * @param {Float64Array} out - Output gradient buffer.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {number} h - Uniform step size.
 * @param {number} twoH - Precomputed `2 * h` (may be infinite for extreme `h`).
 * @param {boolean} safeTwoH - Whether `twoH` is finite.
 */
function computeUniformRecursive(values, out, lo, hi, h, twoH, safeTwoH) {
	if (hi - lo === 1) {
		const i = lo
		const last = values.length - 1
		if (i === 0) {
			out[0] = (values[1] - values[0]) / h
		} else if (i === last) {
			out[last] = (values[last] - values[last - 1]) / h
		} else if (safeTwoH) {
			out[i] = (values[i + 1] - values[i - 1]) / twoH
		} else {
			out[i] = (values[i + 1] * 0.5 - values[i - 1] * 0.5) / h
		}
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	computeUniformRecursive(values, out, lo, mid, h, twoH, safeTwoH)
	computeUniformRecursive(values, out, mid, hi, h, twoH, safeTwoH)
}

/**
 * Recursively computes the element-wise numerical gradient for non-uniform
 * coordinates over the index range `[lo, hi)` using divide-and-conquer.
 *
 * Uses second-order finite differences at interior points and first-order
 * one-sided differences at boundaries.
 *
 * @param {Float64Array} values - Input samples.
 * @param {Float64Array} coords - Strictly monotonic sample coordinates.
 * @param {Float64Array} out - Output gradient buffer.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 */
function computeNonUniformRecursive(values, coords, out, lo, hi) {
	if (hi - lo === 1) {
		const i = lo
		const last = values.length - 1
		if (i === 0) {
			out[0] = (values[1] - values[0]) / (coords[1] - coords[0])
		} else if (i === last) {
			out[last] = (values[last] - values[last - 1]) / (coords[last] - coords[last - 1])
		} else {
			const hs = coords[i] - coords[i - 1]
			const hd = coords[i + 1] - coords[i]
			const leftSlope = (values[i] - values[i - 1]) / hs
			const rightSlope = (values[i + 1] - values[i]) / hd
			out[i] = (hs * rightSlope + hd * leftSlope) / (hs + hd)
		}
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	computeNonUniformRecursive(values, coords, out, lo, mid)
	computeNonUniformRecursive(values, coords, out, mid, hi)
}

/**
 * Computes the numerical first-order gradient (calculus) element-wise over a
 * 1D `Float64Array` using a recursive divide-and-conquer implementation.
 *
 * Uses second-order accurate central differences at interior points and
 * first-order one-sided differences at the two endpoints:
 * - Uniform spacing `h`:
 *   - `out[0] = (values[1] - values[0]) / h`
 *   - `out[i] = (values[i + 1] - values[i - 1]) / (2 * h)` for `0 < i < n - 1`
 *   - `out[n - 1] = (values[n - 1] - values[n - 2]) / h`
 * - Non-uniform coordinates `x` (`Float64Array` of length `n`):
 *   - `out[0] = (values[1] - values[0]) / (x[1] - x[0])`
 *   - `out[i] = (hs * rightSlope + hd * leftSlope) / (hs + hd)` for `0 < i < n - 1`,
 *     where `hs = x[i] - x[i - 1]` and `hd = x[i + 1] - x[i]`
 *   - `out[n - 1] = (values[n - 1] - values[n - 2]) / (x[n - 1] - x[n - 2])`
 *
 * The divide-and-conquer recursion maintains O(log n) stack depth and does not
 * mutate any input array.
 *
 * @param {Float64Array} values - Sampled function values (length >= 2, all finite).
 * @param {number | Float64Array} [spacing=1] - Either a non-zero finite uniform
 *   step size, or a strictly monotonic `Float64Array` of coordinates matching
 *   `values.length`.
 * @returns {Float64Array} Element-wise numerical gradient of `values`.
 * @throws {TypeError} If `values` is not a `Float64Array`, or `spacing` is
 *   neither a number nor a `Float64Array`.
 * @throws {RangeError} If `values.length < 2`, any input value is non-finite,
 *   a scalar `spacing` is 0 or non-finite, or a coordinate `spacing` array has
 *   mismatched length or is not strictly monotonic.
 */
export function gradientTypedRecursive(values, spacing = 1) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('values must be a Float64Array')
	}

	const n = values.length
	if (n < 2) {
		throw new RangeError('values must contain at least 2 elements to compute a gradient')
	}

	validateFiniteRecursive(values, 0, n, 'values')

	if (typeof spacing === 'number') {
		if (!Number.isFinite(spacing) || spacing === 0) {
			throw new RangeError('spacing must be a finite non-zero number')
		}
		const out = new Float64Array(n)
		const twoH = 2 * spacing
		computeUniformRecursive(values, out, 0, n, spacing, twoH, Number.isFinite(twoH))
		return out
	}

	if (spacing instanceof Float64Array) {
		if (spacing.length !== n) {
			throw new RangeError(
				`spacing length (${spacing.length}) must match values length (${n})`
			)
		}
		if (!Number.isFinite(spacing[0]) || !Number.isFinite(spacing[1])) {
			throw new RangeError('spacing coordinates must be finite numbers')
		}
		if (spacing[1] === spacing[0]) {
			throw new RangeError(
				'spacing coordinates must be strictly monotonic (duplicate adjacent values at index 0 and 1)'
			)
		}
		const direction = spacing[1] > spacing[0] ? 1 : -1
		validateCoordsRecursive(spacing, 0, n, direction)

		const out = new Float64Array(n)
		computeNonUniformRecursive(values, spacing, out, 0, n)
		return out
	}

	throw new TypeError('spacing must be a finite non-zero number or a Float64Array')
}
