/**
 * Determines whether a value is a numeric TypedArray (excluding DataView and BigInt TypedArrays).
 *
 * @param {unknown} value - Candidate value to test.
 * @returns {boolean} True if value is a numeric TypedArray.
 */
function isNumericTypedArray(value) {
	return (
		ArrayBuffer.isView(value) &&
		!(value instanceof DataView) &&
		!(value instanceof BigInt64Array) &&
		!(value instanceof BigUint64Array)
	)
}

/**
 * Validates that a fuzzy membership degree is a finite number in [0, 1].
 *
 * @param {unknown} value - Membership degree to validate.
 * @param {string} label - Parameter or element label for error messages.
 * @throws {TypeError} If value is not a number.
 * @throws {RangeError} If value is NaN, non-finite, less than 0, or greater than 1.
 */
function validateMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number, received ${typeof value}`)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${label} must be a finite number in [0, 1], received ${value}`)
	}
}

/**
 * Computes the Zadeh fuzzy OR (fuzzy set union / standard S-norm) iteratively:
 *
 *   mu_{A U B}(x_i) = max(mu_A(x_i), mu_B(x_i))
 *
 * Supports both scalar membership degrees in [0, 1] and 1-D fuzzy membership sets
 * represented as plain Arrays or numeric TypedArrays (e.g. Float64Array) of equal length.
 *
 * Algorithm:
 * - For scalar inputs, validates both operands are in [0, 1] and returns their maximum
 *   (normalizing -0 to +0).
 * - For array / TypedArray inputs, validates matching lengths and iterates sequentially
 *   with an explicit loop over indices `0 .. length - 1`, validating each element in [0, 1]
 *   and writing `max(a[i], b[i])` to a newly allocated output container without mutating inputs.
 * - Returns a `Float64Array` when either collection input is a numeric TypedArray, or a
 *   plain `Array` when both inputs are plain `Array`s.
 *
 * @param {number | number[] | ArrayBufferView} a - First fuzzy membership value or fuzzy set (values in [0, 1]).
 * @param {number | number[] | ArrayBufferView} b - Second fuzzy membership value or fuzzy set (values in [0, 1]).
 * @returns {number | number[] | Float64Array} Zadeh fuzzy OR result (scalar, Array, or Float64Array).
 * @throws {TypeError} If inputs are not both numbers or both arrays / numeric TypedArrays, or if an array element is not a number.
 * @throws {RangeError} If collection lengths differ, or if any membership value is NaN, non-finite, < 0, or > 1.
 */
export function orFuzzyIterative(a, b) {
	const aIsNumber = typeof a === 'number'
	const bIsNumber = typeof b === 'number'

	if (aIsNumber && bIsNumber) {
		validateMembership(a, 'a')
		validateMembership(b, 'b')
		const maxVal = a >= b ? a : b
		return maxVal === 0 ? 0 : maxVal
	}

	const aIsArray = Array.isArray(a)
	const bIsArray = Array.isArray(b)
	const aIsTyped = isNumericTypedArray(a)
	const bIsTyped = isNumericTypedArray(b)
	const aIsCollection = aIsArray || aIsTyped
	const bIsCollection = bIsArray || bIsTyped

	if (!aIsCollection || !bIsCollection) {
		throw new TypeError(
			'orFuzzyIterative expects either two numbers in [0, 1] or two arrays/numeric TypedArrays of equal length'
		)
	}

	const len = a.length
	if (len !== b.length) {
		throw new RangeError(
			`Fuzzy sets must have the same length (received ${len} and ${b.length})`
		)
	}

	const result = aIsTyped || bIsTyped ? new Float64Array(len) : new Array(len)

	for (let i = 0; i < len; i++) {
		const ai = a[i]
		const bi = b[i]
		validateMembership(ai, `a[${i}]`)
		validateMembership(bi, `b[${i}]`)
		const maxVal = ai >= bi ? ai : bi
		result[i] = maxVal === 0 ? 0 : maxVal
	}

	return result
}
