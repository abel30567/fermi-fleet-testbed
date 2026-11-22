/**
 * Exact BigInt matrix multiplication using cache-oblivious recursive
 * divide-and-conquer (Frigo, Leiserson, Prokop, & Ramachandran, 1999).
 *
 * Computes the exact product `C = A * B` for an `m x k` BigInt matrix `A`
 * and a `k x n` BigInt matrix `B`, yielding an `m x n` BigInt matrix `C`.
 *
 * Because the product of exact integers is always an exact integer, results
 * are unscaled exact `BigInt` values (no fixed-point scaling is applied).
 *
 * Algorithm:
 *   Given submatrices of dimensions `(m, k)` and `(k, n)`:
 *   - Base case (`m === 1 && k === 1 && n === 1`): performs the scalar
 *     multiply-accumulate `C[cRow][cCol] += A[aRow][aCol] * B[bRow][bCol]`.
 *   - Recursive step: splits along the largest of `(m, k, n)`:
 *     - Largest `m`: splits `A` and `C` horizontally (`C1 += A1*B`, `C2 += A2*B`).
 *     - Largest `n`: splits `B` and `C` vertically (`C1 += A*B1`, `C2 += A*B2`).
 *     - Largest `k`: splits `A` vertically and `B` horizontally
 *       (`C += A1*B1`, `C += A2*B2`).
 *
 *   This handles arbitrary rectangular dimensions without padding or
 *   intermediate submatrix allocations, and bounds recursion stack depth
 *   to `O(log m + log k + log n)`.
 *
 * @module ops/matrix/matMulBigIntRecursive
 */

/**
 * Validates that the given value is a non-empty rectangular 2D array of BigInts.
 *
 * @param {unknown} matrix - Candidate matrix value.
 * @param {string} name - Parameter name for error messages.
 * @returns {{ rows: number, cols: number }} Validated matrix dimensions.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array,
 *   or any element is not a `bigint`.
 * @throws {RangeError} If `matrix` has zero rows, zero columns, or ragged rows.
 */
function validateBigIntMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of BigInts`)
	}

	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError(`${name} must have at least 1 row`)
	}

	let cols = -1
	for (let i = 0; i < rows; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${i}] must be an array of BigInts`)
		}
		if (cols === -1) {
			cols = row.length
			if (cols === 0) {
				throw new RangeError(`${name} must have at least 1 column`)
			}
		} else if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular: row 0 has length ${cols}, but row ${i} has length ${row.length}`
			)
		}

		for (let j = 0; j < cols; j++) {
			if (typeof row[j] !== 'bigint') {
				throw new TypeError(
					`${name}[${i}][${j}] must be a BigInt, got ${typeof row[j]}`
				)
			}
		}
	}

	return { rows, cols }
}

/**
 * Recursively accumulates the submatrix product `A_sub * B_sub` into `C_sub`
 * by bisecting the largest active dimension `(m, k, n)`.
 *
 * @param {readonly (readonly bigint[])[]} A - Left operand matrix.
 * @param {readonly (readonly bigint[])[]} B - Right operand matrix.
 * @param {bigint[][]} C - Mutable accumulator result matrix.
 * @param {number} aRow - Starting row offset in `A`.
 * @param {number} aCol - Starting column offset in `A`.
 * @param {number} bRow - Starting row offset in `B`.
 * @param {number} bCol - Starting column offset in `B`.
 * @param {number} cRow - Starting row offset in `C`.
 * @param {number} cCol - Starting column offset in `C`.
 * @param {number} m - Number of rows in `A_sub` (and `C_sub`).
 * @param {number} k - Inner shared dimension (`A_sub` cols / `B_sub` rows).
 * @param {number} n - Number of columns in `B_sub` (and `C_sub`).
 */
function recursiveMulAdd(A, B, C, aRow, aCol, bRow, bCol, cRow, cCol, m, k, n) {
	if (m === 1 && k === 1 && n === 1) {
		C[cRow][cCol] += A[aRow][aCol] * B[bRow][bCol]
		return
	}

	if (m >= k && m >= n) {
		const m1 = m >>> 1
		const m2 = m - m1
		recursiveMulAdd(A, B, C, aRow, aCol, bRow, bCol, cRow, cCol, m1, k, n)
		recursiveMulAdd(A, B, C, aRow + m1, aCol, bRow, bCol, cRow + m1, cCol, m2, k, n)
	} else if (n >= m && n >= k) {
		const n1 = n >>> 1
		const n2 = n - n1
		recursiveMulAdd(A, B, C, aRow, aCol, bRow, bCol, cRow, cCol, m, k, n1)
		recursiveMulAdd(A, B, C, aRow, aCol, bRow, bCol + n1, cRow, cCol + n1, m, k, n2)
	} else {
		const k1 = k >>> 1
		const k2 = k - k1
		recursiveMulAdd(A, B, C, aRow, aCol, bRow, bCol, cRow, cCol, m, k1, n)
		recursiveMulAdd(A, B, C, aRow, aCol + k1, bRow + k1, bCol, cRow, cCol, m, k2, n)
	}
}

/**
 * Multiplies two exact BigInt matrices `A` (`m x k`) and `B` (`k x n`) using
 * recursive divide-and-conquer, returning a new exact `m x n` BigInt matrix.
 *
 * Input matrices are never mutated.
 *
 * @param {readonly (readonly bigint[])[]} A - Left matrix of shape `m x k`.
 * @param {readonly (readonly bigint[])[]} B - Right matrix of shape `k x n`.
 * @returns {bigint[][]} Exact product matrix `A * B` of shape `m x n`.
 * @throws {TypeError} If `A` or `B` is not a 2D array of `bigint` values.
 * @throws {RangeError} If either matrix is empty, ragged, or has incompatible
 *   inner dimensions (`A[0].length !== B.length`).
 */
export function matMulBigIntRecursive(A, B) {
	const { rows: m, cols: kA } = validateBigIntMatrix(A, 'A')
	const { rows: kB, cols: n } = validateBigIntMatrix(B, 'B')

	if (kA !== kB) {
		throw new RangeError(
			`Incompatible matrix dimensions: cannot multiply ${m}x${kA} by ${kB}x${n}`
		)
	}

	const C = Array.from({ length: m }, () => new Array(n).fill(0n))
	recursiveMulAdd(A, B, C, 0, 0, 0, 0, 0, 0, m, kA, n)
	return C
}
