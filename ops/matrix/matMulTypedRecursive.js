/**
 * Multiplies two row-major matrices stored as Float64Array instances using a
 * divide-and-conquer recursive algorithm.
 *
 * Computes `C = A * B`, where `A` has shape `rowsA x colsA`, `B` has shape
 * `colsA x colsB`, and the returned matrix `C` has shape `rowsA x colsB`.
 * At each recursive step, the largest dimension among `(m, k, n)` is split in
 * half and the resulting subproblems are solved recursively, accumulating
 * partial products directly into `C`.
 *
 * @param {Float64Array} a - Row-major matrix A of length `rowsA * colsA`.
 * @param {Float64Array} b - Row-major matrix B of length `colsA * colsB`.
 * @param {number} rowsA - Number of rows in matrix A (non-negative safe integer).
 * @param {number} colsA - Number of columns in A and rows in B (non-negative safe integer).
 * @param {number} colsB - Number of columns in matrix B (non-negative safe integer).
 * @returns {Float64Array} New row-major matrix C of length `rowsA * colsB`.
 * @throws {TypeError} If `a` or `b` is not a Float64Array, or any dimension is not a number.
 * @throws {RangeError} If any dimension is not a non-negative safe integer, input array
 *   lengths do not match the declared dimensions, the output size is not a safe integer,
 *   or any input element is non-finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function matMulTypedRecursive(a, b, rowsA, colsA, colsB) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Matrix a must be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Matrix b must be a Float64Array')
	}

	validateDimension(rowsA, 'rowsA')
	validateDimension(colsA, 'colsA')
	validateDimension(colsB, 'colsB')

	const expectedLenA = rowsA * colsA
	const expectedLenB = colsA * colsB
	const resultLen = rowsA * colsB

	if (!Number.isSafeInteger(expectedLenA) || a.length !== expectedLenA) {
		throw new RangeError(
			`Matrix a length (${a.length}) must equal rowsA * colsA (${rowsA} * ${colsA})`
		)
	}
	if (!Number.isSafeInteger(expectedLenB) || b.length !== expectedLenB) {
		throw new RangeError(
			`Matrix b length (${b.length}) must equal colsA * colsB (${colsA} * ${colsB})`
		)
	}
	if (!Number.isSafeInteger(resultLen)) {
		throw new RangeError(
			`Result matrix size (${rowsA} * ${colsB}) exceeds safe integer range`
		)
	}

	validateFiniteElements(a, 'a')
	validateFiniteElements(b, 'b')

	const result = new Float64Array(resultLen)
	if (rowsA === 0 || colsA === 0 || colsB === 0) {
		return result
	}

	mulRecursive(a, b, result, colsA, colsB, 0, 0, 0, rowsA, colsA, colsB)
	return result
}

/**
 * Validates that a matrix dimension is a non-negative safe integer.
 *
 * @param {unknown} value - Dimension value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is not a non-negative safe integer.
 */
function validateDimension(value, name) {
	if (typeof value !== 'number') {
		throw new TypeError(`${name} must be a number`)
	}
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`${name} must be a non-negative safe integer`)
	}
}

/**
 * Validates that all elements of a Float64Array are finite numbers.
 *
 * @param {Float64Array} arr - Typed array to check.
 * @param {string} name - Parameter name for error messages.
 * @throws {RangeError} If any element is non-finite.
 */
function validateFiniteElements(arr, name) {
	for (let i = 0; i < arr.length; i++) {
		if (!Number.isFinite(arr[i])) {
			throw new RangeError(
				`Matrix ${name} contains non-finite value at index ${i}`
			)
		}
	}
}

/**
 * Recursively accumulates `A[rowA..rowA+m, colA..colA+k] * B[colA..colA+k, colB..colB+n]`
 * into `C[rowA..rowA+m, colB..colB+n]` by bisecting the largest dimension among `m`, `k`, `n`.
 *
 * @param {Float64Array} a - Row-major matrix A.
 * @param {Float64Array} b - Row-major matrix B.
 * @param {Float64Array} c - Row-major output matrix C.
 * @param {number} strideA - Number of columns in full matrix A (`colsA`).
 * @param {number} strideB - Number of columns in full matrix B and C (`colsB`).
 * @param {number} rowA - Starting row offset in A and C.
 * @param {number} colA - Starting column offset in A (and row offset in B).
 * @param {number} colB - Starting column offset in B and C.
 * @param {number} m - Submatrix row count of A and C.
 * @param {number} k - Shared inner submatrix dimension.
 * @param {number} n - Submatrix column count of B and C.
 */
function mulRecursive(a, b, c, strideA, strideB, rowA, colA, colB, m, k, n) {
	if (m === 0 || k === 0 || n === 0) {
		return
	}

	if (m === 1 && k === 1 && n === 1) {
		c[rowA * strideB + colB] +=
			a[rowA * strideA + colA] * b[colA * strideB + colB]
		return
	}

	if (m >= k && m >= n) {
		const half = Math.floor(m / 2)
		mulRecursive(a, b, c, strideA, strideB, rowA, colA, colB, half, k, n)
		mulRecursive(
			a,
			b,
			c,
			strideA,
			strideB,
			rowA + half,
			colA,
			colB,
			m - half,
			k,
			n
		)
	} else if (k >= m && k >= n) {
		const half = Math.floor(k / 2)
		mulRecursive(a, b, c, strideA, strideB, rowA, colA, colB, m, half, n)
		mulRecursive(
			a,
			b,
			c,
			strideA,
			strideB,
			rowA,
			colA + half,
			colB,
			m,
			k - half,
			n
		)
	} else {
		const half = Math.floor(n / 2)
		mulRecursive(a, b, c, strideA, strideB, rowA, colA, colB, m, k, half)
		mulRecursive(
			a,
			b,
			c,
			strideA,
			strideB,
			rowA,
			colA,
			colB + half,
			m,
			k,
			n - half
		)
	}
}
