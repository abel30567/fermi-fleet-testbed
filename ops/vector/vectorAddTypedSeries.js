/**
 * Performs element-wise vector addition over `Float64Array` inputs without
 * mutating the inputs.
 *
 * Uses the closed-form element-wise sum for two vectors and Neumaier
 * compensated series summation when three or more vectors are supplied,
 * reducing floating-point cancellation error across vector series while
 * preserving IEEE-754 semantics for `NaN`, `±Infinity`, and `-0`.
 *
 * @param {Float64Array} a First input vector.
 * @param {Float64Array} b Second input vector (must match the length of `a`).
 * @param {...Float64Array} rest Optional additional vectors of the same length.
 * @returns {Float64Array} A new `Float64Array` containing the element-wise sum.
 * @throws {TypeError} If any argument is not an instance of `Float64Array`.
 * @throws {RangeError} If any input vector does not have the same length as `a`.
 */
export function vectorAddTypedSeries(a, b, ...rest) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('vectorAddTypedSeries: argument 0 must be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('vectorAddTypedSeries: argument 1 must be a Float64Array')
	}

	const len = a.length
	if (b.length !== len) {
		throw new RangeError(
			`vectorAddTypedSeries: length mismatch at argument 1 (expected ${len}, got ${b.length})`
		)
	}

	for (let k = 0; k < rest.length; k++) {
		const v = rest[k]
		if (!(v instanceof Float64Array)) {
			throw new TypeError(
				`vectorAddTypedSeries: argument ${k + 2} must be a Float64Array`
			)
		}
		if (v.length !== len) {
			throw new RangeError(
				`vectorAddTypedSeries: length mismatch at argument ${k + 2} (expected ${len}, got ${v.length})`
			)
		}
	}

	const out = new Float64Array(len)

	if (rest.length === 0) {
		for (let i = 0; i < len; i++) {
			out[i] = a[i] + b[i]
		}
		return out
	}

	const terms = [b, ...rest]
	for (let i = 0; i < len; i++) {
		let sum = a[i]
		let comp = 0
		for (let k = 0; k < terms.length; k++) {
			const x = terms[k][i]
			const t = sum + x
			if (Number.isFinite(t)) {
				if (Math.abs(sum) >= Math.abs(x)) {
					comp += (sum - t) + x
				} else {
					comp += (x - t) + sum
				}
			}
			sum = t
		}
		out[i] = Number.isFinite(sum) && comp !== 0 ? sum + comp : sum
	}

	return out
}
