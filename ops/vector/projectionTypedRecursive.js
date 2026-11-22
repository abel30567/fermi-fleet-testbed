/**
 * Recursively validates that all elements in `vec[lo..hi)` are finite numbers.
 *
 * @param {Float64Array} vec
 * @param {number} lo
 * @param {number} hi
 * @param {string} name
 */
function assertFiniteRange(vec, lo, hi, name) {
	if (hi - lo === 1) {
		if (!Number.isFinite(vec[lo])) {
			throw new RangeError(`${name}[${lo}] must be a finite number`)
		}
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	assertFiniteRange(vec, lo, mid, name)
	assertFiniteRange(vec, mid, hi, name)
}

/**
 * Recursively computes the dot product of `x[lo..hi)` and `y[lo..hi)` via
 * divide-and-conquer pairwise summation.
 *
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function dotRange(x, y, lo, hi) {
	if (hi - lo === 1) {
		return x[lo] * y[lo]
	}
	const mid = lo + ((hi - lo) >>> 1)
	return dotRange(x, y, lo, mid) + dotRange(x, y, mid, hi)
}

/**
 * Recursively scales `src[lo..hi)` by `scalar` and writes results into
 * `out[lo..hi)` via divide-and-conquer splitting.
 *
 * @param {Float64Array} src
 * @param {number} scalar
 * @param {Float64Array} out
 * @param {number} lo
 * @param {number} hi
 */
function scaleRange(src, scalar, out, lo, hi) {
	if (hi - lo === 1) {
		const value = scalar * src[lo]
		out[lo] = value === 0 ? 0 : value
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	scaleRange(src, scalar, out, lo, mid)
	scaleRange(src, scalar, out, mid, hi)
}

/**
 * Computes the vector projection of `a` onto `b`:
 *
 *   proj_b(a) = ((a · b) / (b · b)) * b
 *
 * Both dot products and the final scalar-vector scaling are implemented using
 * divide-and-conquer recursion splitting index ranges `[lo, hi)` into halves.
 *
 * @param {Float64Array} a - Source vector to project.
 * @param {Float64Array} b - Non-zero target vector to project onto.
 * @returns {Float64Array} A new Float64Array containing the projection of `a` onto `b`.
 * @throws {TypeError} If either `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If vectors are empty, have mismatched lengths, contain
 *   non-finite elements, if `b` is the zero vector, or if intermediate
 *   arithmetic overflows to a non-finite value.
 */
export function projectionTypedRecursive(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument "a" must be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument "b" must be a Float64Array')
	}

	const n = a.length
	if (n === 0 || b.length === 0) {
		throw new RangeError('Input vectors must be non-empty')
	}
	if (n !== b.length) {
		throw new RangeError(
			`Input vectors must have equal length (got ${n} and ${b.length})`
		)
	}

	assertFiniteRange(a, 0, n, 'a')
	assertFiniteRange(b, 0, n, 'b')

	const bDotB = dotRange(b, b, 0, n)
	if (bDotB === 0) {
		throw new RangeError('Target vector "b" must be non-zero')
	}

	const aDotB = dotRange(a, b, 0, n)
	const scale = aDotB / bDotB
	if (!Number.isFinite(scale)) {
		throw new RangeError('Projection scalar is not finite')
	}

	const result = new Float64Array(n)
	scaleRange(b, scale, result, 0, n)
	return result
}
