/**
 * Multiplies two matrices stored in row-major order as {@link Float64Array} buffers
 * using a straightforward iterative triple-loop implementation.
 *
 * Computes `C = A * B`, where `A` has dimensions `rowsA x colsA`, `B` has dimensions
 * `colsA x colsB`, and the returned matrix `C` has dimensions `rowsA x colsB`.
 *
 * @param {Float64Array} a - Left-hand matrix in row-major order (length `rowsA * colsA`).
 * @param {Float64Array} b - Right-hand matrix in row-major order (length `colsA * colsB`).
 * @param {number} rowsA - Number of rows in matrix `a` (non-negative safe integer).
 * @param {number} colsA - Number of columns in `a` and rows in `b` (non-negative safe integer).
 * @param {number} colsB - Number of columns in matrix `b` (non-negative safe integer).
 * @returns {Float64Array} Product matrix `C` in row-major order (length `rowsA * colsB`).
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`, or if any dimension is not a safe integer.
 * @throws {RangeError} If any dimension is negative, or if `a.length` or `b.length` does not match the given dimensions.
 */
export function matMulTypedIterative(a, b, rowsA, colsA, colsB) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First matrix argument "a" must be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second matrix argument "b" must be a Float64Array')
	}

	validateDimension(rowsA, 'rowsA')
	validateDimension(colsA, 'colsA')
	validateDimension(colsB, 'colsB')

	const expectedLengthA = rowsA * colsA
	if (a.length !== expectedLengthA) {
		throw new RangeError(
			`Matrix "a" length (${a.length}) does not match rowsA * colsA (${rowsA} * ${colsA} = ${expectedLengthA})`,
		)
	}

	const expectedLengthB = colsA * colsB
	if (b.length !== expectedLengthB) {
		throw new RangeError(
			`Matrix "b" length (${b.length}) does not match colsA * colsB (${colsA} * ${colsB} = ${expectedLengthB})`,
		)
	}

	const result = new Float64Array(rowsA * colsB)

	for (let i = 0; i < rowsA; i++) {
		const rowOffsetA = i * colsA
		const rowOffsetOut = i * colsB
		for (let j = 0; j < colsB; j++) {
			let sum = 0
			for (let k = 0; k < colsA; k++) {
				sum += a[rowOffsetA + k] * b[k * colsB + j]
			}
			result[rowOffsetOut + j] = sum
		}
	}

	return result
}

/**
 * Validates that a matrix dimension is a non-negative safe integer.
 *
 * @param {unknown} value - Dimension value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not a safe integer.
 * @throws {RangeError} If `value` is negative.
 */
function validateDimension(value, name) {
	if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
		throw new TypeError(`Dimension "${name}" must be a safe integer`)
	}
	if (value < 0) {
		throw new RangeError(`Dimension "${name}" must be non-negative`)
	}
}
