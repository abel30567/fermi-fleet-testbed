/**
 * Checks whether a value is a non-string iterable object
 * (e.g. Array, TypedArray, Generator, Set, or custom iterable).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isIterableObject(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Lazily streams and validates a square matrix of IEEE-754 float64 numbers,
 * yielding each main-diagonal entry as soon as its row is validated.
 *
 * @param {Iterable<Iterable<number>>} matrix
 * @returns {Generator<number, void, void>}
 */
function* streamDiagonal(matrix) {
	if (!isIterableObject(matrix)) {
		throw new TypeError('matrix must be an iterable of iterable rows')
	}

	let expectedCols = null
	let rowIndex = 0

	for (const row of matrix) {
		if (expectedCols !== null && rowIndex >= expectedCols) {
			throw new RangeError(
				`matrix must be square: received more than ${expectedCols} rows`
			)
		}

		if (!isIterableObject(row)) {
			throw new TypeError(`row ${rowIndex} must be an iterable of numbers`)
		}

		let colIndex = 0
		let diagValue = 0

		for (const value of row) {
			if (typeof value !== 'number') {
				throw new TypeError(
					`matrix entry at (${rowIndex}, ${colIndex}) must be a float64 number`
				)
			}

			if (expectedCols !== null && colIndex >= expectedCols) {
				throw new RangeError(
					`matrix must be rectangular: row ${rowIndex} exceeds ${expectedCols} columns`
				)
			}

			if (colIndex === rowIndex) {
				diagValue = value
			}

			colIndex += 1
		}

		if (expectedCols === null) {
			if (colIndex === 0) {
				throw new RangeError('matrix must be square: row 0 is empty')
			}
			expectedCols = colIndex
		} else if (colIndex !== expectedCols) {
			throw new RangeError(
				`matrix must be rectangular: row ${rowIndex} has ${colIndex} columns, expected ${expectedCols}`
			)
		}

		yield diagValue
		rowIndex += 1
	}

	if (expectedCols !== null && rowIndex !== expectedCols) {
		throw new RangeError(
			`matrix must be square: got ${rowIndex}x${expectedCols}`
		)
	}
}

/**
 * Computes the trace (sum of main-diagonal entries) of a square matrix over
 * IEEE-754 float64 numbers using a lazy generator-based streaming pipeline.
 *
 * Both the outer matrix and each inner row may be any non-string iterable
 * (such as Arrays, TypedArrays, Generators, or custom iterables). Inputs are
 * consumed in a single pass with O(1) auxiliary memory, stopping immediately
 * on validation failures without materializing the full matrix.
 *
 * @param {Iterable<Iterable<number>>} matrix - Square matrix as an iterable of iterable float64 rows.
 * @returns {number} The IEEE-754 float64 trace of the matrix (0 for an empty 0x0 matrix).
 * @throws {TypeError} If the matrix or any row is not a non-string iterable, or any entry is not a number.
 * @throws {RangeError} If the matrix is ragged or not square.
 */
export function traceFloatLazy(matrix) {
	let hasEntries = false
	let sum = 0

	for (const diag of streamDiagonal(matrix)) {
		if (!hasEntries) {
			sum = diag
			hasEntries = true
		} else {
			sum += diag
		}
	}

	return sum
}
