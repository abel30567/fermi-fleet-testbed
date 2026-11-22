/**
 * Validates that the given value is a non-empty rectangular 2D array of BigInts.
 *
 * @param {unknown} matrix - Candidate matrix to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {{ rows: number, cols: number }} Validated matrix dimensions.
 * @throws {TypeError} If the matrix is not a 2D array or contains non-BigInt entries.
 * @throws {RangeError} If the matrix is empty, has empty rows, or is ragged.
 */
function validateBigIntMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of BigInts`)
	}
	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError(`${name} must not be empty`)
	}

	let cols = -1
	for (let i = 0; i < rows; i++) {
		if (!(i in matrix) || !Array.isArray(matrix[i])) {
			throw new TypeError(`${name}[${i}] must be an array of BigInts`)
		}
		const row = matrix[i]
		if (i === 0) {
			cols = row.length
			if (cols === 0) {
				throw new RangeError(`${name} must not contain empty rows`)
			}
		} else if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular (row ${i} has length ${row.length}, expected ${cols})`,
			)
		}

		for (let j = 0; j < cols; j++) {
			if (!(j in row) || typeof row[j] !== 'bigint') {
				throw new TypeError(`${name}[${i}][${j}] must be a BigInt`)
			}
		}
	}

	return { rows, cols }
}

/**
 * Multiplies two exact BigInt matrices `a` (m × k) and `b` (k × n), returning
 * their exact m × n BigInt matrix product.
 *
 * Computed directly via the finite rank-1 outer-product / inner-product series
 * identity `(A · B)[i][j] = Σ_{p=0}^{k-1} A[i][p] * B[p][j]` over exact
 * arbitrary-precision BigInt integers with zero floating-point rounding.
 *
 * @param {readonly (readonly bigint[])[]} a - Left matrix of dimensions m × k.
 * @param {readonly (readonly bigint[])[]} b - Right matrix of dimensions k × n.
 * @returns {bigint[][]} Product matrix of dimensions m × n with BigInt entries.
 * @throws {TypeError} If either input is not a 2D array of BigInts.
 * @throws {RangeError} If either matrix is empty, ragged, or has incompatible inner dimensions.
 */
export function matMulBigIntSeries(a, b) {
	const { rows: m, cols: kA } = validateBigIntMatrix(a, 'a')
	const { rows: kB, cols: n } = validateBigIntMatrix(b, 'b')

	if (kA !== kB) {
		throw new RangeError(
			`Incompatible matrix dimensions: cannot multiply ${m}x${kA} by ${kB}x${n}`,
		)
	}

	const result = Array.from({ length: m }, () => new Array(n).fill(0n))

	for (let i = 0; i < m; i++) {
		const rowA = a[i]
		const rowC = result[i]
		for (let p = 0; p < kA; p++) {
			const aVal = rowA[p]
			if (aVal === 0n) continue
			const rowB = b[p]
			for (let j = 0; j < n; j++) {
				rowC[j] += aVal * rowB[j]
			}
		}
	}

	return result
}
