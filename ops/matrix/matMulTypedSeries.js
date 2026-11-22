/**
 * Multiplies row-major Float64Array matrices (single pair or batched series)
 * using Neumaier compensated summation to reduce floating-point cancellation error.
 *
 * Each matrix pair `m` in `[0, count)` computes the closed-form product:
 *   C[m, i, j] = sum_{k=0}^{colsA - 1} A[m, i, k] * B[m, k, j]
 *
 * where `count = a.length / (rowsA * colsA) === b.length / (colsA * colsB)`.
 *
 * @param {Float64Array} a - Row-major left-hand operand matrix or contiguous batch of matrices,
 *   of length `count * rowsA * colsA`.
 * @param {Float64Array} b - Row-major right-hand operand matrix or contiguous batch of matrices,
 *   of length `count * colsA * colsB`.
 * @param {number} rowsA - Positive safe integer number of rows in each matrix of `a`.
 * @param {number} colsA - Positive safe integer number of columns in each matrix of `a`
 *   (and rows in each matrix of `b`).
 * @param {number} colsB - Positive safe integer number of columns in each matrix of `b`.
 * @returns {Float64Array} Row-major product matrix or contiguous batch of matrices,
 *   of length `count * rowsA * colsB`.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`, or if any dimension is not a number.
 * @throws {RangeError} If any dimension is not a positive safe integer, if operand lengths are not
 *   exact multiples of their matrix sizes, or if batch counts do not match.
 */
export function matMulTypedSeries(a, b, rowsA, colsA, colsB) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Expected parameter "a" to be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Expected parameter "b" to be a Float64Array')
	}

	validatePositiveSafeInt(rowsA, 'rowsA')
	validatePositiveSafeInt(colsA, 'colsA')
	validatePositiveSafeInt(colsB, 'colsB')

	const sizeA = rowsA * colsA
	const sizeB = colsA * colsB
	const sizeOut = rowsA * colsB

	if (
		!Number.isSafeInteger(sizeA) ||
		!Number.isSafeInteger(sizeB) ||
		!Number.isSafeInteger(sizeOut)
	) {
		throw new RangeError('Matrix dimensions overflow safe integer bounds')
	}

	if (a.length % sizeA !== 0) {
		throw new RangeError(
			`Length of "a" (${a.length}) must be an exact multiple of rowsA * colsA (${sizeA})`,
		)
	}
	if (b.length % sizeB !== 0) {
		throw new RangeError(
			`Length of "b" (${b.length}) must be an exact multiple of colsA * colsB (${sizeB})`,
		)
	}

	const countA = a.length / sizeA
	const countB = b.length / sizeB
	if (countA !== countB) {
		throw new RangeError(
			`Batch count mismatch: "a" has ${countA} matrices while "b" has ${countB} matrices`,
		)
	}

	const outLength = countA * sizeOut
	if (!Number.isSafeInteger(outLength)) {
		throw new RangeError('Output length overflows safe integer bounds')
	}

	const out = new Float64Array(outLength)
	if (countA === 0) {
		return out
	}

	for (let m = 0; m < countA; m++) {
		const baseA = m * sizeA
		const baseB = m * sizeB
		const baseOut = m * sizeOut

		for (let i = 0; i < rowsA; i++) {
			const rowOffsetA = baseA + i * colsA
			const rowOffsetOut = baseOut + i * colsB

			for (let j = 0; j < colsB; j++) {
				let sum = 0
				let comp = 0

				for (let k = 0; k < colsA; k++) {
					const prod = a[rowOffsetA + k] * b[baseB + k * colsB + j]
					const t = sum + prod
					if (Number.isFinite(t)) {
						if (Math.abs(sum) >= Math.abs(prod)) {
							comp += sum - t + prod
						} else {
							comp += prod - t + sum
						}
					} else {
						comp = 0
					}
					sum = t
				}

				out[rowOffsetOut + j] = sum + comp
			}
		}
	}

	return out
}

/**
 * Validates that a dimension argument is a positive safe integer.
 *
 * @param {unknown} value
 * @param {string} name
 */
function validatePositiveSafeInt(value, name) {
	if (typeof value !== 'number') {
		throw new TypeError(`Expected "${name}" to be a number`)
	}
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new RangeError(`Expected "${name}" to be a positive safe integer, got ${value}`)
	}
}
