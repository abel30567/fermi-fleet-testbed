/**
 * Validates that a value is a non-empty rectangular 2D array of IEEE-754 float64 numbers
 * and returns its dimensions.
 *
 * @param {unknown} matrix - Candidate matrix to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {{ rows: number, cols: number }} The validated matrix dimensions.
 * @throws {TypeError} If the input is not a 2D array of numbers.
 * @throws {RangeError} If the matrix is empty or ragged.
 */
function validateMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of numbers`);
	}
	const rows = matrix.length;
	if (rows === 0) {
		throw new RangeError(`${name} must not be empty`);
	}

	let cols = -1;
	for (let i = 0; i < rows; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${i}] must be an array of numbers`);
		}
		if (row.length === 0) {
			throw new RangeError(`${name}[${i}] must not be empty`);
		}
		if (cols === -1) {
			cols = row.length;
		} else if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular: row 0 has length ${cols}, but row ${i} has length ${row.length}`,
			);
		}
		for (let j = 0; j < cols; j++) {
			if (!(j in row) || typeof row[j] !== 'number') {
				throw new TypeError(`${name}[${i}][${j}] must be a number`);
			}
		}
	}

	return { rows, cols };
}

/**
 * Recursively computes C[cRow..cRow+m-1][cCol..cCol+n-1] +=
 * A[aRow..aRow+m-1][aCol..aCol+k-1] * B[bRow..bRow+k-1][bCol..bCol+n-1]
 * by splitting along the largest of (m, k, n).
 *
 * @param {number[][]} A
 * @param {number[][]} B
 * @param {number[][]} C
 * @param {number} aRow
 * @param {number} aCol
 * @param {number} bRow
 * @param {number} bCol
 * @param {number} cRow
 * @param {number} cCol
 * @param {number} m
 * @param {number} k
 * @param {number} n
 */
function multiplyAddRecursive(A, B, C, aRow, aCol, bRow, bCol, cRow, cCol, m, k, n) {
	if (m === 1 && k === 1 && n === 1) {
		C[cRow][cCol] += A[aRow][aCol] * B[bRow][bCol];
		return;
	}

	if (m >= k && m >= n) {
		const m1 = Math.floor(m / 2);
		multiplyAddRecursive(A, B, C, aRow, aCol, bRow, bCol, cRow, cCol, m1, k, n);
		multiplyAddRecursive(A, B, C, aRow + m1, aCol, bRow, bCol, cRow + m1, cCol, m - m1, k, n);
	} else if (n >= m && n >= k) {
		const n1 = Math.floor(n / 2);
		multiplyAddRecursive(A, B, C, aRow, aCol, bRow, bCol, cRow, cCol, m, k, n1);
		multiplyAddRecursive(A, B, C, aRow, aCol, bRow, bCol + n1, cRow, cCol + n1, m, k, n - n1);
	} else {
		const k1 = Math.floor(k / 2);
		multiplyAddRecursive(A, B, C, aRow, aCol, bRow, bCol, cRow, cCol, m, k1, n);
		multiplyAddRecursive(A, B, C, aRow, aCol + k1, bRow + k1, bCol, cRow, cCol, m, k - k1, n);
	}
}

/**
 * Multiplies two matrices A (m x k) and B (k x n) over IEEE-754 float64 numbers
 * using a divide-and-conquer recursive block multiplication algorithm.
 *
 * The recursion splits along the largest dimension among (m, k, n), handling
 * arbitrary rectangular and non-power-of-2 dimensions cleanly without padding.
 *
 * @param {number[][]} A - Left matrix of shape m x k.
 * @param {number[][]} B - Right matrix of shape k x n.
 * @returns {number[][]} Product matrix C = A * B of shape m x n.
 * @throws {TypeError} If A or B is not a 2D array of numbers.
 * @throws {RangeError} If A or B is empty, ragged, or has incompatible inner dimensions.
 */
export function matMulFloatRecursive(A, B) {
	const { rows: m, cols: kA } = validateMatrix(A, 'A');
	const { rows: kB, cols: n } = validateMatrix(B, 'B');

	if (kA !== kB) {
		throw new RangeError(
			`Incompatible matrix dimensions: A is ${m}x${kA} and B is ${kB}x${n}`,
		);
	}

	const C = Array.from({ length: m }, () => new Array(n).fill(0));
	multiplyAddRecursive(A, B, C, 0, 0, 0, 0, 0, 0, m, kA, n);
	return C;
}
