/**
 * Computes the Euclidean (L2) magnitude (norm) of a vector stored in a Float64Array
 * using a straightforward single-pass iterative scaled sum-of-squares algorithm.
 *
 * The scaling formulation (Hammarling / BLAS dnrm2 style) maintains a running
 * maximum absolute value `scale` and normalized sum of squares `sumSq` such that
 * `||v||_2 = scale * sqrt(sumSq)`, avoiding intermediate overflow and underflow
 * for very large or very small finite floating-point components.
 *
 * @param {Float64Array} v - Input vector of finite double-precision numbers.
 * @returns {number} Non-negative Euclidean magnitude `||v||_2` (`0` for an empty or zero vector).
 * @throws {TypeError} If `v` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element of `v` is `NaN`, `Infinity`, or `-Infinity`.
 */
export function magnitudeTypedIterative(v) {
	if (!(v instanceof Float64Array)) {
		throw new TypeError('Expected input vector v to be a Float64Array')
	}

	let scale = 0
	let sumSq = 1

	for (let i = 0; i < v.length; i++) {
		const value = v[i]
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`Vector element at index ${i} must be a finite number, received ${value}`
			)
		}

		const absVal = Math.abs(value)
		if (absVal !== 0) {
			if (absVal > scale) {
				const ratio = scale / absVal
				sumSq = 1 + sumSq * ratio * ratio
				scale = absVal
			} else {
				const ratio = absVal / scale
				sumSq += ratio * ratio
			}
		}
	}

	return scale === 0 ? 0 : scale * Math.sqrt(sumSq)
}
