/**
 * Normalizes negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Adds two complex numbers represented as `{ re, im }`.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function addComplex(a, b) {
	return {
		re: normalizeZero(a.re + b.re),
		im: normalizeZero(a.im + b.im),
	}
}

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value
 * @param {number} row
 * @param {number} col
 * @throws {TypeError} If `value` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `value.re` or `value.im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplexEntry(value, row, col) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must be a complex number object { re, im }`,
		)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must have numeric "re" and "im" properties`,
		)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(
			`Matrix entry at [${row}][${col}] must have finite "re" and "im" values`,
		)
	}
}

/**
 * Validates that `matrix` is a square `n x n` 2D array of finite complex numbers `{ re, im }`.
 *
 * @param {unknown} matrix
 * @throws {TypeError} If `matrix` or any row is not an array, or any entry is not a valid complex object.
 * @throws {RangeError} If `matrix` is not square or any entry contains non-finite numbers.
 */
function validateComplexSquareMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of complex numbers { re, im }')
	}

	const n = matrix.length
	for (let row = 0; row < n; row++) {
		if (!Array.isArray(matrix[row])) {
			throw new TypeError(`Matrix row at index ${row} must be an array`)
		}
		if (matrix[row].length !== n) {
			throw new RangeError(
				`Matrix must be square: expected row ${row} to have length ${n}, got ${matrix[row].length}`,
			)
		}
		for (let col = 0; col < n; col++) {
			validateComplexEntry(matrix[row][col], row, col)
		}
	}
}

/**
 * Recursively computes the trace over the principal submatrix covering diagonal
 * indices `[start, end)` using divide-and-conquer block decomposition:
 *   tr([A11, A12; A21, A22]) = tr(A11) + tr(A22).
 *
 * @param {Array<Array<{ re: number, im: number }>>} matrix
 * @param {number} start Inclusive starting diagonal index.
 * @param {number} end Exclusive ending diagonal index.
 * @returns {{ re: number, im: number }}
 */
function tracePrincipalSubmatrix(matrix, start, end) {
	const size = end - start
	if (size <= 0) {
		return { re: 0, im: 0 }
	}
	if (size === 1) {
		const entry = matrix[start][start]
		return {
			re: normalizeZero(entry.re),
			im: normalizeZero(entry.im),
		}
	}

	const mid = start + Math.floor(size / 2)
	const topLeftTrace = tracePrincipalSubmatrix(matrix, start, mid)
	const bottomRightTrace = tracePrincipalSubmatrix(matrix, mid, end)
	return addComplex(topLeftTrace, bottomRightTrace)
}

/**
 * Computes the trace of a square complex matrix using a recursive divide-and-conquer
 * algorithm based on the block-matrix identity `tr(A) = tr(A11) + tr(A22)`.
 *
 * For an `n x n` matrix `A` with complex entries `{ re, im }`, the trace is the sum of
 * its main diagonal entries `A[0][0] + A[1][1] + ... + A[n-1][n-1]`. For the empty
 * `0 x 0` matrix `[]`, the trace is `{ re: 0, im: 0 }`.
 *
 * Algorithm:
 * 1. Validate that `matrix` is a square `n x n` 2D array of finite complex objects `{ re, im }`.
 * 2. Recursively split the diagonal index range `[start, end)` at the midpoint `mid`,
 *    compute `tr(A11)` on `[start, mid)` and `tr(A22)` on `[mid, end)`, and combine
 *    their sums pairwise (`O(log n)` recursion depth, `O(n)` diagonal additions).
 *
 * @param {Array<Array<{ re: number, im: number }>>} matrix Square matrix of complex numbers `{ re, im }`.
 * @returns {{ re: number, im: number }} The complex trace `{ re, im }` (with `-0` normalized to `0`).
 * @throws {TypeError} If `matrix` is not a 2D array or any entry is not an object with numeric `re` and `im`.
 * @throws {RangeError} If `matrix` is not square or any entry has non-finite `re` or `im` values.
 */
export function traceComplexRecursive(matrix) {
	validateComplexSquareMatrix(matrix)
	return tracePrincipalSubmatrix(matrix, 0, matrix.length)
}
