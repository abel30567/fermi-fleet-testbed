/**
 * Computes the 3D vector cross product of two Float64Array inputs using a
 * divide-and-conquer recursive strategy over packed 3D vector triples.
 *
 * Supports both a single 3D vector (length 3) and packed batches of 3D vectors
 * (any non-negative multiple of 3, including empty arrays of length 0).
 *
 * @param {Float64Array} a - First input Float64Array of packed 3D vectors (length % 3 === 0).
 * @param {Float64Array} b - Second input Float64Array of packed 3D vectors (same length as `a`).
 * @returns {Float64Array} A new Float64Array containing the elementwise 3D cross products `a × b`.
 * @throws {TypeError} If `a` or `b` is not an instance of Float64Array.
 * @throws {RangeError} If `a` and `b` have different lengths, their length is not a multiple of 3,
 *   or either array contains a non-finite number (`NaN`, `Infinity`, `-Infinity`).
 */
export function crossProductTypedRecursive(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument "a" must be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument "b" must be a Float64Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Input Float64Arrays must have equal length (got ${a.length} and ${b.length})`
		)
	}
	if (a.length % 3 !== 0) {
		throw new RangeError(
			`Input length must be a multiple of 3 (got ${a.length})`
		)
	}

	const len = a.length
	for (let i = 0; i < len; i++) {
		if (!Number.isFinite(a[i])) {
			throw new RangeError(`Non-finite value in "a" at index ${i}: ${a[i]}`)
		}
		if (!Number.isFinite(b[i])) {
			throw new RangeError(`Non-finite value in "b" at index ${i}: ${b[i]}`)
		}
	}

	const result = new Float64Array(len)
	const vectorCount = len / 3
	if (vectorCount === 0) {
		return result
	}

	crossRangeRecursive(a, b, result, 0, vectorCount)
	return result
}

/**
 * Divide-and-conquer recursion over the 3D vector index range `[lo, hi)`.
 *
 * @param {Float64Array} a - First packed 3D vector array.
 * @param {Float64Array} b - Second packed 3D vector array.
 * @param {Float64Array} out - Output packed 3D vector array.
 * @param {number} lo - Inclusive start vector index.
 * @param {number} hi - Exclusive end vector index.
 */
function crossRangeRecursive(a, b, out, lo, hi) {
	if (lo >= hi) {
		return
	}
	if (hi - lo === 1) {
		computeComponentsRecursive(a, b, out, lo * 3, 0)
		return
	}

	const mid = lo + Math.floor((hi - lo) / 2)
	crossRangeRecursive(a, b, out, lo, mid)
	crossRangeRecursive(a, b, out, mid, hi)
}

/**
 * Recursively computes the 3 components (axis 0, 1, 2) of a single 3D cross
 * product at element offset `base`.
 *
 * @param {Float64Array} a - First packed 3D vector array.
 * @param {Float64Array} b - Second packed 3D vector array.
 * @param {Float64Array} out - Output packed 3D vector array.
 * @param {number} base - Starting element index of the 3D vector (`vectorIndex * 3`).
 * @param {number} axis - Current component axis (0 = x, 1 = y, 2 = z).
 */
function computeComponentsRecursive(a, b, out, base, axis) {
	if (axis === 3) {
		return
	}
	const i1 = (axis + 1) % 3
	const i2 = (axis + 2) % 3
	const value = a[base + i1] * b[base + i2] - a[base + i2] * b[base + i1]
	out[base + axis] = value === 0 ? 0 : value
	computeComponentsRecursive(a, b, out, base, axis + 1)
}
