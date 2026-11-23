const SERIES_RADIUS = 0.25
const MAX_SERIES_TERMS = 128

/**
 * Checks whether a finite number is an odd integer.
 *
 * @param {number} value
 * @returns {boolean}
 */
function isOddInteger(value) {
	return Number.isInteger(value) && Math.abs(value % 2) === 1
}

/**
 * Computes `x^(1 / n)` for a strictly positive finite `x` and finite non-zero `n`.
 *
 * Uses Newton's generalized binomial series `(1 + u)^p = sum_{k>=0} C(p, k) u^k`
 * (with `u = x - 1`, `p = 1 / n`) inside the fast-convergence radius
 * `|u| <= 0.25` and `|p * u| <= 0.25` to avoid logarithmic cancellation near 1,
 * and falls back to the closed-form identity `exp(ln(x) / n)` elsewhere.
 *
 * @param {number} x Positive finite radicand.
 * @param {number} n Finite non-zero root degree.
 * @returns {number}
 */
function positiveNthRoot(x, n) {
	if (x === 1) {
		return 1
	}
	if (n === 1) {
		return x
	}
	if (n === -1) {
		return 1 / x
	}

	const p = 1 / n
	const u = x - 1
	if (Math.abs(u) <= SERIES_RADIUS && Math.abs(p * u) <= SERIES_RADIUS) {
		let sum = 1
		let term = 1
		for (let k = 1; k <= MAX_SERIES_TERMS; k++) {
			term *= ((p - (k - 1)) / k) * u
			const next = sum + term
			if (Math.abs(term) <= 0.5 * Number.EPSILON * Math.abs(next)) {
				return next
			}
			sum = next
		}
		return sum
	}

	return Math.exp(Math.log(x) / n)
}

/**
 * Computes the element-wise real nth root of a `Float64Array` of radicands
 * using the generalized binomial series near 1 and the `exp(ln(x) / n)`
 * closed-form identity elsewhere.
 *
 * The root degree `degrees` may be either a `Float64Array` of the same length
 * as `radicands` (for per-element degrees) or a single finite non-zero number
 * (broadcast across all elements). Input arrays are never mutated.
 *
 * @param {Float64Array} radicands Element-wise finite radicands.
 * @param {Float64Array | number} degrees Element-wise `Float64Array` of finite
 *   non-zero degrees (matching `radicands.length`) or a scalar finite non-zero degree.
 * @returns {Float64Array} A new `Float64Array` containing the real nth roots.
 * @throws {TypeError} If `radicands` is not a `Float64Array`, or `degrees` is
 *   neither a `Float64Array` nor a `number`.
 * @throws {RangeError} If array lengths differ, any input element or degree is
 *   non-finite, any degree is zero, a negative radicand is paired with a
 *   non-odd-integer degree, or zero is paired with a negative degree.
 */
export function nthRootTypedSeries(radicands, degrees) {
	if (!(radicands instanceof Float64Array)) {
		throw new TypeError('radicands must be a Float64Array')
	}

	const isArrayDegree = degrees instanceof Float64Array
	if (isArrayDegree) {
		if (degrees.length !== radicands.length) {
			throw new RangeError('radicands and degrees Float64Arrays must have equal length')
		}
	} else if (typeof degrees === 'number') {
		if (!Number.isFinite(degrees) || degrees === 0) {
			throw new RangeError('degrees must be a finite non-zero number')
		}
	} else {
		throw new TypeError('degrees must be a Float64Array or a finite non-zero number')
	}

	const len = radicands.length
	const result = new Float64Array(len)

	for (let i = 0; i < len; i++) {
		const x = radicands[i]
		const n = isArrayDegree ? degrees[i] : degrees

		if (!Number.isFinite(x)) {
			throw new RangeError(`radicands[${i}] must be a finite number`)
		}
		if (isArrayDegree && (!Number.isFinite(n) || n === 0)) {
			throw new RangeError(`degrees[${i}] must be a finite non-zero number`)
		}

		if (x === 0) {
			if (n < 0) {
				throw new RangeError(`Cannot compute negative-degree root of zero at index ${i}`)
			}
			result[i] = Object.is(x, -0) && isOddInteger(n) ? -0 : 0
		} else if (x < 0) {
			if (!isOddInteger(n)) {
				throw new RangeError(
					`Cannot compute real root of negative radicand at index ${i} for degree ${n}`
				)
			}
			result[i] = -positiveNthRoot(-x, n)
		} else {
			result[i] = positiveNthRoot(x, n)
		}
	}

	return result
}
