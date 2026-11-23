/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Matrix identifier for error messages.
 * @param {number} row - Row index of the entry.
 * @param {number} col - Column index of the entry.
 * @throws {TypeError} If the entry is not a valid `{ re, im }` object with finite numeric parts.
 */
function assertComplex(value, name, row, col) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name}[${row}][${col}] must be a complex object { re, im }`);
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (value);
	if (typeof re !== 'number' || !Number.isFinite(re)) {
		throw new TypeError(`${name}[${row}][${col}].re must be a finite number`);
	}
	if (typeof im !== 'number' || !Number.isFinite(im)) {
		throw new TypeError(`${name}[${row}][${col}].im must be a finite number`);
	}
}

/**
 * Validates that a value is a non-empty rectangular 2D matrix of complex `{ re, im }` objects.
 *
 * @param {unknown} matrix - Matrix to validate.
 * @param {string} name - Matrix identifier for error messages.
 * @returns {{ rows: number, cols: number }} Validated dimensions of the matrix.
 * @throws {TypeError} If the matrix or its rows/entries have invalid types.
 * @throws {RangeError} If the matrix is empty or ragged.
 */
function validateComplexMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of complex { re, im } objects`);
	}
	const rows = matrix.length;
	if (rows === 0) {
		throw new RangeError(`${name} must not be empty`);
	}

	let cols = -1;
	for (let r = 0; r < rows; r++) {
		const row = matrix[r];
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${r}] must be an array`);
		}
		if (row.length === 0) {
			throw new RangeError(`${name}[${r}] must not be empty`);
		}
		if (cols === -1) {
			cols = row.length;
		} else if (row.length !== cols) {
			throw new RangeError(`${name} must be rectangular: row ${r} has length ${row.length}, expected ${cols}`);
		}
		for (let c = 0; c < cols; c++) {
			assertComplex(row[c], name, r, c);
		}
	}

	return { rows, cols };
}

/**
 * Recursively computes `C[cRow..cRow+m, cCol..cCol+n] += A[aRow..aRow+m, aCol..aCol+k] * B[bRow..bRow+k, bCol..bCol+n]`
 * using divide-and-conquer by splitting the largest dimension among `(m, k, n)` in half until the 1x1x1 base case.
 *
 * @param {Complex[][]} A
 * @param {number} aRow
 * @param {number} aCol
 * @param {Complex[][]} B
 * @param {number} bRow
 * @param {number} bCol
 * @param {Complex[][]} C
 * @param {number} cRow
 * @param {number} cCol
 * @param {number} m
 * @param {number} k
 * @param {number} n
 */
function multiplyAddRecursive(A, aRow, aCol, B, bRow, bCol, C, cRow, cCol, m, k, n) {
	if (m === 1 && k === 1 && n === 1) {
		const a = A[aRow][aCol];
		const b = B[bRow][bCol];
		const cell = C[cRow][cCol];
		cell.re += a.re * b.re - a.im * b.im;
		cell.im += a.re * b.im + a.im * b.re;
		return;
	}

	if (m >= k && m >= n) {
		const m1 = Math.floor(m / 2);
		const m2 = m - m1;
		multiplyAddRecursive(A, aRow, aCol, B, bRow, bCol, C, cRow, cCol, m1, k, n);
		multiplyAddRecursive(A, aRow + m1, aCol, B, bRow, bCol, C, cRow + m1, cCol, m2, k, n);
	} else if (n >= m && n >= k) {
		const n1 = Math.floor(n / 2);
		const n2 = n - n1;
		multiplyAddRecursive(A, aRow, aCol, B, bRow, bCol, C, cRow, cCol, m, k, n1);
		multiplyAddRecursive(A, aRow, aCol, B, bRow, bCol + n1, C, cRow, cCol + n1, m, k, n2);
	} else {
		const k1 = Math.floor(k / 2);
		const k2 = k - k1;
		multiplyAddRecursive(A, aRow, aCol, B, bRow, bCol, C, cRow, cCol, m, k1, n);
		multiplyAddRecursive(A, aRow, aCol + k1, B, bRow + k1, bCol, C, cRow, cCol, m, k2, n);
	}
}

/**
 * Multiplies two matrices of complex numbers `{ re, im }` using a recursive
 * divide-and-conquer block algorithm.
 *
 * At each recursive step, the largest dimension among `(m, k, n)` is split in
 * half until reaching the `1x1` scalar complex multiplication base case.
 * Works for arbitrary non-empty rectangular matrices with compatible inner dimensions
 * without mutating the inputs.
 *
 * @param {Complex[][]} A - Left matrix of shape `m x k` containing `{ re, im }` entries.
 * @param {Complex[][]} B - Right matrix of shape `k x n` containing `{ re, im }` entries.
 * @returns {Complex[][]} Product matrix `A * B` of shape `m x n` with `{ re, im }` entries.
 * @throws {TypeError} If `A` or `B` is not a 2D array of valid finite `{ re, im }` objects.
 * @throws {RangeError} If `A` or `B` is empty, ragged, or has incompatible inner dimensions.
 */
export function matMulComplexRecursive(A, B) {
	const dimA = validateComplexMatrix(A, 'A');
	const dimB = validateComplexMatrix(B, 'B');

	if (dimA.cols !== dimB.rows) {
		throw new RangeError(
			`Incompatible matrix dimensions: A is ${dimA.rows}x${dimA.cols} and B is ${dimB.rows}x${dimB.cols}`,
		);
	}

	const m = dimA.rows;
	const k = dimA.cols;
	const n = dimB.cols;

	/** @type {Complex[][]} */
	const C = Array.from({ length: m }, () =>
		Array.from({ length: n }, () => ({ re: 0, im: 0 })),
	);

	multiplyAddRecursive(A, 0, 0, B, 0, 0, C, 0, 0, m, k, n);

	for (let r = 0; r < m; r++) {
		for (let c = 0; c < n; c++) {
			if (C[r][c].re === 0) C[r][c].re = 0;
			if (C[r][c].im === 0) C[r][c].im = 0;
		}
	}

	return C;
}
