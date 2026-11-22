/**
 * Checks whether a finite number is an odd integer.
 *
 * @param {number} n
 * @returns {boolean}
 */
function isOddInteger(n) {
	return Number.isInteger(n) && Math.abs(n % 2) === 1
}

/**
 * Computes the nth root of a single scalar value with strict validation.
 *
 * @param {number} value
 * @param {number} degree
 * @param {number} index
 * @returns {number}
 */
function computeNthRoot(value, degree, index) {
	if (!Number.isFinite(degree) || degree === 0) {
		throw new RangeError(
			`Invalid degree at index ${index}: expected a finite non-zero number, received ${degree}`
		)
	}

	if (value < 0) {
		if (!isOddInteger(degree)) {
			throw new RangeError(
				`Cannot compute root of negative value ${value} with non-odd-integer degree ${degree} at index ${index}`
			)
		}
		return -Math.pow(-value, 1 / degree)
	}

	return Math.pow(value, 1 / degree)
}

/**
 * Recursively computes element-wise nth roots over the half-open index range [lo, hi)
 * using divide-and-conquer.
 *
 * @param {Float64Array} values
 * @param {Float64Array} degrees
 * @param {Float64Array} result
 * @param {number} lo
 * @param {number} hi
 */
function fillRange(values, degrees, result, lo, hi) {
	if (lo >= hi) {
		return
	}
	if (hi - lo === 1) {
		result[lo] = computeNthRoot(values[lo], degrees[lo], lo)
		return
	}

	const mid = lo + ((hi - lo) >>> 1)
	fillRange(values, degrees, result, lo, mid)
	fillRange(values, degrees, result, mid, hi)
}

/**
 * Computes the element-wise nth root of `values` using corresponding `degrees`
 * via a divide-and-conquer recursive algorithm over `Float64Array` inputs.
 *
 * For negative values, only odd integer degrees are permitted and are evaluated
 * cleanly as `-Math.pow(-x, 1 / n)`.
 *
 * @param {Float64Array} values - Base values (radicands).
 * @param {Float64Array} degrees - Root degrees corresponding element-wise to `values`.
 * @returns {Float64Array} A new `Float64Array` containing the element-wise nth roots.
 * @throws {TypeError} If either `values` or `degrees` is not a `Float64Array`.
 * @throws {RangeError} If `values` and `degrees` have different lengths, if any degree is
 *   zero or non-finite, or if a negative value is paired with a non-odd-integer degree.
 */
export function nthRootTypedRecursive(values, degrees) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('values must be a Float64Array')
	}
	if (!(degrees instanceof Float64Array)) {
		throw new TypeError('degrees must be a Float64Array')
	}
	if (values.length !== degrees.length) {
		throw new RangeError(
			`Input length mismatch: values has length ${values.length}, degrees has length ${degrees.length}`
		)
	}

	const result = new Float64Array(values.length)
	fillRange(values, degrees, result, 0, values.length)
	return result
}
