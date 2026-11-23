/**
 * Computes the orthogonal vector projection of `a` onto `b` over `Float64Array`
 * inputs using a straightforward iterative implementation:
 *
 *   proj_b(a) = ((a · b) / (b · b)) * b
 *
 * @param {Float64Array} a - The vector to project.
 * @param {Float64Array} b - The non-zero target vector to project onto.
 * @returns {Float64Array} A new `Float64Array` containing the projection of `a` onto `b`.
 * @throws {TypeError} If either `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` have different lengths, are empty, contain non-finite
 *   values, if `b` is the zero vector, or if intermediate dot products overflow finite range.
 */
export function projectionTypedIterative(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument "a" must be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument "b" must be a Float64Array')
	}

	const len = a.length
	if (len !== b.length) {
		throw new RangeError(`Vector length mismatch: a.length (${len}) !== b.length (${b.length})`)
	}
	if (len === 0) {
		throw new RangeError('Input vectors must not be empty')
	}

	let dotAB = 0
	let dotBB = 0
	for (let i = 0; i < len; i++) {
		const ai = a[i]
		const bi = b[i]
		if (!Number.isFinite(ai)) {
			throw new RangeError(`First argument "a" contains non-finite value at index ${i}`)
		}
		if (!Number.isFinite(bi)) {
			throw new RangeError(`Second argument "b" contains non-finite value at index ${i}`)
		}
		dotAB += ai * bi
		dotBB += bi * bi
	}

	if (dotBB === 0) {
		throw new RangeError('Cannot project onto a zero vector')
	}
	if (!Number.isFinite(dotAB) || !Number.isFinite(dotBB)) {
		throw new RangeError('Intermediate dot product overflowed finite range')
	}

	const scalar = dotAB / dotBB
	const out = new Float64Array(len)
	for (let i = 0; i < len; i++) {
		const val = scalar * b[i]
		out[i] = val === 0 ? 0 : val
	}

	return out
}
