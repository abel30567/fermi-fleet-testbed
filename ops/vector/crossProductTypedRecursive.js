/**
 * Validates that a 3D vector slice starting at `offset` contains only finite numbers.
 *
 * @param {Float64Array} arr - Typed array to validate.
 * @param {number} offset - Starting element index of the 3D vector.
 * @param {string} label - Parameter name used in error messages.
 * @param {number} [axis=0] - Current component offset (0..2).
 * @throws {RangeError} If any component is NaN or non-finite.
 */
function validateVectorFinite(arr, offset, label, axis = 0) {
	if (axis === 3) {
		return
	}
	if (!Number.isFinite(arr[offset + axis])) {
		throw new RangeError(
			`${label}[${offset + axis}] must be a finite number`,
		)
	}
	validateVectorFinite(arr, offset, label, axis + 1)
}

/**
 * Recursively computes the 3 components of a single 3D cross product `a × b`
 * at the given element `offset`.
 *
 * @param {Float64Array} a - First packed 3D vector array.
 * @param {Float64Array} b - Second packed 3D vector array.
 * @param {Float64Array} out - Output packed 3D vector array.
 * @param {number} offset - Starting element index of the 3D vector.
 * @param {number} [axis=0] - Current output axis (0 = x, 1 = y, 2 = z).
 */
function computeCrossAxes(a, b, out, offset, axis = 0) {
	if (axis === 3) {
		return
	}
	const i = (axis + 1) % 3
	const j = (axis + 2) % 3
	const value =
		a[offset + i] * b[offset + j] - a[offset + j] * b[offset + i]
	out[offset + axis] = value === 0 ? 0 : value
	computeCrossAxes(a, b, out, offset, axis + 1)
}

/**
 * Recursively computes 3D cross products over a range of packed vectors using
 * divide-and-conquer splitting.
 *
 * @param {Float64Array} a - First packed 3D vector array.
 * @param {Float64Array} b - Second packed 3D vector array.
 * @param {Float64Array} out - Output packed 3D vector array.
 * @param {number} startVec - Index of the first 3D vector in the range.
 * @param {number} vecCount - Number of 3D vectors in the range (must be >= 1).
 */
function crossRange(a, b, out, startVec, vecCount) {
	if (vecCount === 1) {
		const offset = startVec * 3
		validateVectorFinite(a, offset, 'a')
		validateVectorFinite(b, offset, 'b')
		computeCrossAxes(a, b, out, offset)
		return
	}

	const mid = vecCount >>> 1
	crossRange(a, b, out, startVec, mid)
	crossRange(a, b, out, startVec + mid, vecCount - mid)
}

/**
 * Computes the 3D cross product `a × b` over `Float64Array` inputs using a
 * recursive divide-and-conquer implementation.
 *
 * Supports both single 3D vectors (length 3) and packed arrays of 3D vectors
 * (any positive length divisible by 3), returning a new `Float64Array` of the
 * same length without mutating either input.
 *
 * @param {Float64Array} a - First 3D vector or packed array of 3D vectors.
 * @param {Float64Array} b - Second 3D vector or packed array of 3D vectors.
 * @returns {Float64Array} Resulting 3D cross product(s) with canonical `+0`.
 * @throws {TypeError} If either `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If lengths differ, are zero, are not divisible by 3, or
 *   if any element is non-finite (`NaN`, `Infinity`, `-Infinity`).
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
			`Input Float64Arrays must have equal length (got ${a.length} and ${b.length})`,
		)
	}
	if (a.length === 0 || a.length % 3 !== 0) {
		throw new RangeError(
			`Input length must be a positive multiple of 3 (got ${a.length})`,
		)
	}

	const out = new Float64Array(a.length)
	crossRange(a, b, out, 0, a.length / 3)
	return out
}
