/**
 * Validates that a value is a non-empty rectangular 2D matrix of BigInt values.
 *
 * @param {unknown} matrix - Candidate matrix to validate.
 * @param {string} name - Parameter name used in error messages.
 * @returns {{ rows: number, cols: number }} Validated matrix dimensions.
 * @throws {TypeError} If the matrix, any row, or any element has an invalid type.
 * @throws {RangeError} If the matrix is empty, has empty rows, or is jagged.
 */
function validateBigIntMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of BigInt values`);
	}
	const rows = matrix.length;
	if (rows === 0) {
		throw new RangeError(`${name} must not be empty`);
	}

	let cols = -1;
	for (let i = 0; i < rows; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${i}] must be an array`);
		}
		if (i === 0) {
			cols = row.length;
			if (cols === 0) {
				throw new RangeError(`${name} rows must not be empty`);
			}
		} else if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular (row 0 has length ${cols}, row ${i} has length ${row.length})`
			);
		}
		for (let j = 0; j < cols; j++) {
			if (typeof row[j] !== 'bigint') {
				throw new TypeError(
					`${name}[${i}][${j}] must be a bigint, got ${typeof row[j]}`
				);
			}
		}
	}

	return { rows, cols };
}

/**
 * Multiplies two matrices of exact BigInt integers using a straightforward
 * iterative triple-loop algorithm.
 *
 * Given an `m × k` matrix `a` and a `k × n` matrix `b`, returns a new `m × n`
 * matrix `c` where `c[i][j] = sum_{p=0}^{k-1} a[i][p] * b[p][j]`.
 *
 * Neither input matrix is mutated. All arithmetic is exact arbitrary-precision
 * BigInt integer arithmetic.
 *
 * @param {readonly (readonly bigint[])[]} a - Left matrix of shape `m × k`.
 * @param {readonly (readonly bigint[])[]} b - Right matrix of shape `k × n`.
 * @returns {bigint[][]} Product matrix of shape `m × n`.
 * @throws {TypeError} If `a` or `b` is not a 2D array of `bigint` values.
 * @throws {RangeError} If `a` or `b` is empty, jagged, or has incompatible dimensions (`a[0].length !== b.length`).
 */
export function matMulBigIntIterative(a, b) {
	const { rows: m, cols: kDim } = validateBigIntMatrix(a, 'a');
	const { rows: bRows, cols: n } = validateBigIntMatrix(b, 'b');

	if (kDim !== bRows) {
		throw new RangeError(
			`Incompatible matrix dimensions: cannot multiply ${m}x${kDim} by ${bRows}x${n}`
		);
	}

	const result = new Array(m);
	for (let i = 0; i < m; i++) {
		const rowA = a[i];
		const rowOut = new Array(n);
		for (let j = 0; j < n; j++) {
			let sum = 0n;
			for (let k = 0; k < kDim; k++) {
				sum += rowA[k] * b[k][j];
			}
			rowOut[j] = sum;
		}
		result[i] = rowOut;
	}

	return result;
}
