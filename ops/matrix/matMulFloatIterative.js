/**
 * Validates that a value is a non-empty, rectangular 2D matrix of finite
 * IEEE-754 float64 numbers and returns its dimensions.
 *
 * @param {unknown} matrix - Candidate matrix to validate.
 * @param {string} name - Parameter name used in error messages.
 * @returns {{ rows: number, cols: number }} Validated matrix dimensions.
 * @throws {TypeError} If the matrix is not an array of arrays of numbers.
 * @throws {RangeError} If the matrix is empty, ragged, or contains non-finite numbers.
 */
function validateMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of finite numbers`)
	}
	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError(`${name} must have at least one row`)
	}

	let cols = -1
	for (let i = 0; i < rows; i++) {
		if (!(i in matrix)) {
			throw new TypeError(`${name}[${i}] must be an array (sparse rows are not allowed)`)
		}
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${i}] must be an array`)
		}
		if (row.length === 0) {
			throw new RangeError(`${name}[${i}] must have at least one column`)
		}
		if (cols === -1) {
			cols = row.length
		} else if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular: row 0 has length ${cols}, row ${i} has length ${row.length}`
			)
		}

		for (let j = 0; j < cols; j++) {
			if (!(j in row)) {
				throw new TypeError(`${name}[${i}][${j}] must be a number (sparse entries are not allowed)`)
			}
			const value = row[j]
			if (typeof value !== 'number') {
				throw new TypeError(`${name}[${i}][${j}] must be a number, got ${typeof value}`)
			}
			if (!Number.isFinite(value)) {
				throw new RangeError(`${name}[${i}][${j}] must be a finite IEEE-754 float64 number`)
			}
		}
	}

	return { rows, cols }
}

/**
 * Multiplies two 2D matrices of finite IEEE-754 float64 numbers using a
 * straightforward iterative triple-loop algorithm.
 *
 * Given an `m x k` matrix `a` and a `k x n` matrix `b`, computes the `m x n`
 * product matrix `c` where:
 * `c[i][j] = sum_{p=0}^{k-1} a[i][p] * b[p][j]`.
 *
 * Neither input matrix is mutated.
 *
 * @param {number[][]} a - Left-hand `m x k` matrix of finite IEEE-754 float64 numbers.
 * @param {number[][]} b - Right-hand `k x n` matrix of finite IEEE-754 float64 numbers.
 * @returns {number[][]} Resulting `m x n` product matrix.
 * @throws {TypeError} If `a` or `b` is not a valid 2D array of numbers.
 * @throws {RangeError} If `a` or `b` is empty, ragged, contains non-finite numbers, or has incompatible dimensions.
 */
export function matMulFloatIterative(a, b) {
	const { rows: m, cols: k } = validateMatrix(a, 'a')
	const { rows: bRows, cols: n } = validateMatrix(b, 'b')

	if (k !== bRows) {
		throw new RangeError(
			`Incompatible matrix dimensions: cannot multiply ${m}x${k} by ${bRows}x${n}`
		)
	}

	const result = new Array(m)
	for (let i = 0; i < m; i++) {
		const aRow = a[i]
		const outRow = new Array(n)
		for (let j = 0; j < n; j++) {
			let sum = 0
			for (let p = 0; p < k; p++) {
				sum += aRow[p] * b[p][j]
			}
			outRow[j] = sum
		}
		result[i] = outRow
	}

	return result
}
