/**
 * Computes the dot product over a series of packed `Float64Array` vectors using
 * Neumaier compensated series summation for improved numerical stability under
 * catastrophic cancellation.
 *
 * Each vector pair `i` occupies the contiguous slice `[i * stride, (i + 1) * stride)`
 * of `a` and `b`, evaluating the finite series:
 *
 *   dot(a_i, b_i) = sum_{k = 0}^{stride - 1} a[i * stride + k] * b[i * stride + k]
 *
 * When `dim` is omitted, `a` and `b` are treated as a single vector pair of
 * dimension `a.length` (returning a length-1 `Float64Array`), or an empty
 * `Float64Array(0)` when both inputs are empty.
 *
 * @param {Float64Array} a - First packed series of vectors.
 * @param {Float64Array} b - Second packed series of vectors (same length as `a`).
 * @param {number} [dim] - Optional positive integer vector dimension dividing `a.length`.
 *   Defaults to `a.length` when non-empty.
 * @returns {Float64Array} A `Float64Array` of length `a.length === 0 ? 0 : a.length / stride`
 *   containing the dot product of each vector pair in the series.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`, or if `dim` is provided and not a number.
 * @throws {RangeError} If `a` and `b` have different lengths, if `dim` is not a positive integer,
 *   or if `a.length` is not an exact multiple of `dim`.
 */
export function dotProductTypedSeries(a, b, dim) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Expected argument "a" to be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Expected argument "b" to be a Float64Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Input Float64Arrays must have equal length (received ${a.length} and ${b.length})`
		)
	}

	const totalLength = a.length

	if (dim !== undefined) {
		if (typeof dim !== 'number') {
			throw new TypeError('Expected argument "dim" to be a positive integer')
		}
		if (!Number.isInteger(dim) || dim <= 0) {
			throw new RangeError(`Expected "dim" to be a positive integer (received ${dim})`)
		}
		if (totalLength % dim !== 0) {
			throw new RangeError(
				`Input length (${totalLength}) must be an exact multiple of dim (${dim})`
			)
		}
	}

	if (totalLength === 0) {
		return new Float64Array(0)
	}

	const stride = dim === undefined ? totalLength : dim
	const count = totalLength / stride
	const result = new Float64Array(count)

	for (let i = 0; i < count; i++) {
		const base = i * stride
		let sum = 0
		let comp = 0

		for (let k = 0; k < stride; k++) {
			const prod = a[base + k] * b[base + k]
			const next = sum + prod

			if (Number.isFinite(next)) {
				if (Math.abs(sum) >= Math.abs(prod)) {
					comp += (sum - next) + prod
				} else {
					comp += (prod - next) + sum
				}
			} else if (Number.isNaN(next)) {
				comp = NaN
			} else if (!Number.isNaN(comp)) {
				comp = 0
			}

			sum = next
		}

		result[i] = sum + comp
	}

	return result
}
