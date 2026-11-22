/**
 * Checks whether a value is a supported numeric sequence (Array or non-BigInt TypedArray).
 *
 * @param {unknown} value - Candidate collection.
 * @returns {boolean} True if value is an Array or numeric TypedArray.
 */
function isNumericCollection(value) {
	if (Array.isArray(value)) {
		return true
	}
	if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
		if (value instanceof BigInt64Array || value instanceof BigUint64Array) {
			return false
		}
		return true
	}
	return false
}

/**
 * Validates that a single value is a finite number in the closed interval [0, 1].
 *
 * @param {unknown} value - Membership degree to validate.
 * @param {string} label - Diagnostic label for error messages.
 * @throws {TypeError} If value is not a number.
 * @throws {RangeError} If value is NaN, infinite, < 0, or > 1.
 */
function validateMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number, got ${typeof value}`)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(
			`${label} must be a finite membership degree in [0, 1], got ${value}`,
		)
	}
}

/**
 * Computes the Zadeh fuzzy logical AND / fuzzy set intersection iteratively.
 *
 * For two fuzzy membership values `a, b ∈ [0, 1]`, the Zadeh AND operator is
 * defined as `min(a, b)`. For two fuzzy sets represented as equal-length arrays
 * or numeric TypedArrays of membership degrees in `[0, 1]`, computes the
 * element-wise intersection `out[i] = min(a[i], b[i])` using an explicit
 * iterative loop.
 *
 * @param {number | Array<number> | ArrayBufferView} a - First fuzzy truth value in [0, 1]
 *   or fuzzy set of membership degrees in [0, 1].
 * @param {number | Array<number> | ArrayBufferView} b - Second fuzzy truth value in [0, 1]
 *   or fuzzy set of membership degrees in [0, 1].
 * @returns {number | Float64Array} Fuzzy AND result: a number in [0, 1] when both
 *   inputs are scalars, or a new Float64Array of element-wise minima when both
 *   inputs are arrays/typed arrays.
 * @throws {TypeError} If inputs are not both numbers or both numeric collections,
 *   or if any element in a collection is not a number.
 * @throws {RangeError} If collection lengths do not match, or if any membership
 *   value is NaN, non-finite, less than 0, or greater than 1.
 */
export function andFuzzyIterative(a, b) {
	const aIsNumber = typeof a === 'number'
	const bIsNumber = typeof b === 'number'

	if (aIsNumber && bIsNumber) {
		validateMembership(a, 'a')
		validateMembership(b, 'b')
		const result = a <= b ? a : b
		return result === 0 ? 0 : result
	}

	const aIsCollection = isNumericCollection(a)
	const bIsCollection = isNumericCollection(b)

	if (!aIsCollection || !bIsCollection) {
		throw new TypeError(
			'a and b must both be numbers in [0, 1] or both be arrays/numeric typed arrays',
		)
	}

	const len = a.length
	if (len !== b.length) {
		throw new RangeError(
			`Fuzzy sets must have the same length (got ${len} and ${b.length})`,
		)
	}

	const result = new Float64Array(len)
	for (let i = 0; i < len; i++) {
		const va = a[i]
		const vb = b[i]
		validateMembership(va, `a[${i}]`)
		validateMembership(vb, `b[${i}]`)
		const minVal = va <= vb ? va : vb
		result[i] = minVal === 0 ? 0 : minVal
	}

	return result
}
