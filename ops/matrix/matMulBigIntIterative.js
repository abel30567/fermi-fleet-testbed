/**
 * Validates that a value is a non-empty rectangular 2D array of BigInt values.
 *
 * @param {unknown} matrix - Candidate matrix to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {{ rows: number, cols: number }} Validated matrix dimensions.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any entry is not a `bigint`.
 * @throws {RangeError} If `matrix` has zero rows, zero columns, or ragged rows.
 */
function validateBigIntMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of bigint values`)
	}
	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError(`${name} must have at least one row`)
	}
	if (!Array.isArray(matrix[0])) {
		throw new TypeError(`${name}[0] must be an array`)
	}
	const cols = matrix[0].length
	if (cols === 0) {
		throw new RangeError(`${name} must have at least one column`)
	}

	for (let r = 0; r < rows; r++) {
		const row = matrix[r]
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${r}] must be an array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular: row ${r} has length ${row.length}, expected ${cols}`,
			)
		}
		for (let c = 0; c < cols; c++) {
			if (typeof row[c] !== 'bigint') {
				throw new TypeError(
					`${name}[${r}][${c}] must be a bigint, received ${typeof row[c]}`,
				)
			}
		}
	}

	return { rows, cols }
}

/**
 * Computes the exact matrix product `C = A * B` of two rectangular `BigInt` matrices
 * using a straightforward iterative triple-loop algorithm (`O(m * k * n)`).
 *
 * Scaling / fixed-point semantics:
 * Matrix multiplication over exact `BigInt` integers is closed over the integers
 * (`C[i][j] = sum_{p=0}^{k-1} A[i][p] * B[p][j]`), so every entry of the product is
 * already an exact integer with no division or rounding. Consequently, no fixed-point
 * scaling factor (such as `10n ** 18n`) is applied; inputs and outputs are exact
 * unscaled `bigint` values.
 *
 * Does not mutate `a` or `b`.
 *
 * @param {readonly (readonly bigint[])[]} a - Left matrix of shape `m x k`.
 * @param {readonly (readonly bigint[])[]} b - Right matrix of shape `k x n`.
 * @returns {bigint[][]} Exact product matrix of shape `m x n`.
 * @throws {TypeError} If `a` or `b` is not a 2D array of `bigint` values.
 * @throws {RangeError} If `a` or `b` is empty, ragged, or has incompatible inner dimensions (`cols(a) !== rows(b)`).
 */
export function matMulBigIntIterative(a, b) {
	const dimsA = validateBigIntMatrix(a, 'a')
	const dimsB = validateBigIntMatrix(b, 'b')

	if (dimsA.cols !== dimsB.rows) {
		throw new RangeError(
			`Incompatible matrix dimensions for multiplication: (${dimsA.rows}x${dimsA.cols}) * (${dimsB.rows}x${dimsB.cols})`,
		)
	}

	const rowsA = dimsA.rows
	const inner = dimsA.cols
	const colsB = dimsB.cols

	const result = new Array(rowsA)
	for (let i = 0; i < rowsA; i++) {
		const rowC = new Array(colsB).fill(0n)
		const rowA = a[i]
		for (let k = 0; k < inner; k++) {
			const aik = rowA[k]
			if (aik === 0n) continue
			const rowB = b[k]
			for (let j = 0; j < colsB; j++) {
				rowC[j] += aik * rowB[j]
			}
		}
		result[i] = rowC
	}

	return result
}
