/**
 * Multiplies two row-major matrices stored as {@link Float64Array} instances
 * using a straightforward iterative triple-loop algorithm.
 *
 * Computes the matrix product `C = A * B`, where `A` has shape `rowsA x colsA`,
 * `B` has shape `colsA x colsB`, and the resulting matrix `C` has shape
 * `rowsA x colsB` in row-major order:
 *
 * `C[i * colsB + j] = sum_{k = 0}^{colsA - 1} A[i * colsA + k] * B[k * colsB + j]`
 *
 * Algorithm:
 * - Validates input types, non-negative safe integer dimensions, safe product
 *   sizes, buffer lengths, and finite element values.
 * - Allocates a zero-initialized `Float64Array` of length `rowsA * colsB`.
 * - Iterates in cache-friendly row-major `i-k-j` order, accumulating
 *   `a[i * colsA + k] * b[k * colsB + j]` into `result[i * colsB + j]`.
 *
 * @param {Float64Array} a - Row-major left operand matrix of shape `rowsA x colsA`.
 * @param {Float64Array} b - Row-major right operand matrix of shape `colsA x colsB`.
 * @param {number} rowsA - Number of rows in matrix `a` (non-negative safe integer).
 * @param {number} colsA - Number of columns in `a` and rows in `b` (non-negative safe integer).
 * @param {number} colsB - Number of columns in matrix `b` (non-negative safe integer).
 * @returns {Float64Array} Row-major product matrix `C` of shape `rowsA x colsB`.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`, or if any dimension is not a number.
 * @throws {RangeError} If any dimension is negative or not a safe integer, if any matrix size
 *   exceeds `Number.MAX_SAFE_INTEGER`, if `a.length !== rowsA * colsA` or
 *   `b.length !== colsA * colsB`, or if any element of `a` or `b` is `NaN` or non-finite.
 */
export function matMulTypedIterative(a, b, rowsA, colsA, colsB) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Expected matrix "a" to be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Expected matrix "b" to be a Float64Array')
	}

	validateDimension(rowsA, 'rowsA')
	validateDimension(colsA, 'colsA')
	validateDimension(colsB, 'colsB')

	const expectedLenA = rowsA * colsA
	const expectedLenB = colsA * colsB
	const resultLen = rowsA * colsB

	if (!Number.isSafeInteger(expectedLenA)) {
		throw new RangeError('Matrix "a" dimensions overflow Number.MAX_SAFE_INTEGER')
	}
	if (!Number.isSafeInteger(expectedLenB)) {
		throw new RangeError('Matrix "b" dimensions overflow Number.MAX_SAFE_INTEGER')
	}
	if (!Number.isSafeInteger(resultLen)) {
		throw new RangeError('Result matrix dimensions overflow Number.MAX_SAFE_INTEGER')
	}

	if (a.length !== expectedLenA) {
		throw new RangeError(
			`Matrix "a" length (${a.length}) does not match rowsA * colsA (${expectedLenA})`,
		)
	}
	if (b.length !== expectedLenB) {
		throw new RangeError(
			`Matrix "b" length (${b.length}) does not match colsA * colsB (${expectedLenB})`,
		)
	}

	for (let i = 0; i < a.length; i++) {
		if (!Number.isFinite(a[i])) {
			throw new RangeError(`Matrix "a" contains non-finite value at index ${i}`)
		}
	}
	for (let i = 0; i < b.length; i++) {
		if (!Number.isFinite(b[i])) {
			throw new RangeError(`Matrix "b" contains non-finite value at index ${i}`)
		}
	}

	const result = new Float64Array(resultLen)

	for (let i = 0; i < rowsA; i++) {
		const rowOffsetA = i * colsA
		const rowOffsetC = i * colsB
		for (let k = 0; k < colsA; k++) {
			const aik = a[rowOffsetA + k]
			const rowOffsetB = k * colsB
			for (let j = 0; j < colsB; j++) {
				result[rowOffsetC + j] += aik * b[rowOffsetB + j]
			}
		}
	}

	return result
}

/**
 * Validates that a matrix dimension is a non-negative safe integer number.
 *
 * @param {unknown} value - Dimension value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not of type `number`.
 * @throws {RangeError} If `value` is not a non-negative safe integer.
 */
function validateDimension(value, name) {
	if (typeof value !== 'number') {
		throw new TypeError(`Expected "${name}" to be a number`)
	}
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`Expected "${name}" to be a non-negative safe integer`)
	}
}
