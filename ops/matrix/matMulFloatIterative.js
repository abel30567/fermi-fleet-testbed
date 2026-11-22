/**
 * Validates that a value is a non-empty rectangular 2D array of IEEE-754 float64 numbers.
 *
 * @param {unknown} matrix - Candidate matrix to validate.
 * @param {string} name - Parameter name used in error messages.
 * @returns {{ rows: number, cols: number }} The validated matrix dimensions.
 * @throws {TypeError} If the input is not a 2D array or contains any non-number element.
 * @throws {RangeError} If the matrix is empty (0 rows or 0 columns) or ragged.
 */
function validateMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of numbers`)
	}

	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError(`${name} must not be empty`)
	}

	let cols = -1
	for (let i = 0; i < rows; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${i}] must be an array of numbers`)
		}
		if (i === 0) {
			cols = row.length
			if (cols === 0) {
				throw new RangeError(`${name} must not have empty rows`)
			}
		} else if (row.length !== cols) {
			throw new RangeError(
				`${name} must be a rectangular matrix (row ${i} has length ${row.length}, expected ${cols})`
			)
		}

		for (let j = 0; j < cols; j++) {
			if (typeof row[j] !== 'number') {
				throw new TypeError(`${name}[${i}][${j}] must be a number`)
			}
		}
	}

	return { rows, cols }
}

/**
 * Multiplies two matrices of IEEE-754 float64 numbers using a straightforward
 * iterative triple-nested loop (`O(m * n * p)` time, `O(m * p)` space).
 *
 * Given an `m × n` matrix `a` and an `n × p` matrix `b`, computes the `m × p`
 * product matrix `c` where:
 * `c[i][j] = sum_{k = 0}^{n - 1} a[i][k] * b[k][j]`.
 *
 * Does not mutate either input matrix.
 *
 * @param {number[][]} a - Left-hand `m × n` matrix of IEEE-754 float64 numbers.
 * @param {number[][]} b - Right-hand `n × p` matrix of IEEE-754 float64 numbers.
 * @returns {number[][]} The resulting `m × p` product matrix.
 * @throws {TypeError} If `a` or `b` is not a 2D array or contains non-number elements.
 * @throws {RangeError} If `a` or `b` is empty, ragged, or has incompatible inner dimensions (`a[0].length !== b.length`).
 */
export function matMulFloatIterative(a, b) {
	const { rows: aRows, cols: aCols } = validateMatrix(a, 'a')
	const { rows: bRows, cols: bCols } = validateMatrix(b, 'b')

	if (aCols !== bRows) {
		throw new RangeError(
			`Incompatible matrix dimensions for multiplication: ${aRows}x${aCols} and ${bRows}x${bCols}`
		)
	}

	const result = new Array(aRows)

	for (let i = 0; i < aRows; i++) {
		const aRow = a[i]
		const resultRow = new Array(bCols)
		for (let j = 0; j < bCols; j++) {
			let sum = 0
			for (let k = 0; k < aCols; k++) {
				sum += aRow[k] * b[k][j]
			}
			resultRow[j] = sum
		}
		result[i] = resultRow
	}

	return result
}
