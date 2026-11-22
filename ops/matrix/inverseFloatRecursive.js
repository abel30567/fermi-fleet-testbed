/**
 * Computes the inverse of an invertible square matrix over IEEE-754 float64
 * Numbers using a recursive divide-and-conquer algorithm:
 *
 * 1. Toledo's recursive block LUP factorization with partial pivoting
 *    (`P * M = L * U`), using a recursive unit-lower-triangular block solve
 *    and Schur-complement trailing updates. Partial pivoting handles singular
 *    or zero leading principal submatrices without squaring the condition number.
 * 2. Recursive divide-and-conquer block inversion of the resulting unit-lower
 *    triangular factor `L` and upper-triangular factor `U`.
 * 3. Recombination `M^-1 = U^-1 * L^-1 * P`.
 *
 * Does not mutate the input matrix.
 *
 * @param {number[][]} M - Non-empty square 2D array of finite IEEE-754 float64 numbers.
 * @returns {number[][]} The inverse matrix `M^-1` of the same dimensions as `M`.
 * @throws {TypeError} If `M` is not a 2D array of numbers.
 * @throws {RangeError} If `M` is empty, non-square, contains non-finite numbers,
 *   or is singular / numerically singular.
 */
export function inverseFloatRecursive(M) {
	if (!Array.isArray(M)) {
		throw new TypeError('Expected a 2D array representing a square matrix');
	}

	const n = M.length;
	if (n === 0) {
		throw new RangeError('Matrix must be non-empty');
	}

	let maxElement = 0;
	const work = new Array(n);

	for (let i = 0; i < n; i++) {
		const row = M[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Row ${i} must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(`Matrix must be square: row ${i} has length ${row.length}, expected ${n}`);
		}
		const copy = new Array(n);
		for (let j = 0; j < n; j++) {
			const val = row[j];
			if (typeof val !== 'number') {
				throw new TypeError(`Matrix entry at (${i}, ${j}) must be a number`);
			}
			if (!Number.isFinite(val)) {
				throw new RangeError(`Matrix entry at (${i}, ${j}) must be finite`);
			}
			const absVal = Math.abs(val);
			if (absVal > maxElement) {
				maxElement = absVal;
			}
			copy[j] = val;
		}
		work[i] = copy;
	}

	if (maxElement === 0) {
		throw new RangeError('Matrix is singular');
	}

	const tol = maxElement * n * Number.EPSILON * 16;
	const perm = Array.from({ length: n }, (_, i) => i);

	// Step 1: Recursive block LUP factorization in place (P * M = L * U)
	factorLupRecursive(work, 0, 0, n, n, perm, tol);

	// Extract L (unit lower triangular) and U (upper triangular)
	const L = Array.from({ length: n }, (_, i) => {
		const row = new Array(n).fill(0);
		row[i] = 1;
		for (let j = 0; j < i; j++) {
			row[j] = work[i][j];
		}
		return row;
	});

	const U = Array.from({ length: n }, (_, i) => {
		const row = new Array(n).fill(0);
		for (let j = i; j < n; j++) {
			row[j] = work[i][j];
		}
		return row;
	});

	// Step 2: Recursive divide-and-conquer triangular inversions
	const LInv = invertUnitLowerRecursive(L);
	const UInv = invertUpperRecursive(U);

	// Step 3: Recombine M^-1 = U^-1 * L^-1 * P
	// Since (P * M) = L * U with (P * M)[k][j] = M[perm[k]][j],
	// column k of (U^-1 * L^-1) maps to column perm[k] of M^-1.
	const result = Array.from({ length: n }, () => new Array(n));
	for (let i = 0; i < n; i++) {
		const uRow = UInv[i];
		const outRow = result[i];
		for (let j = 0; j < n; j++) {
			let sum = 0;
			const start = i > j ? i : j;
			for (let k = start; k < n; k++) {
				sum += uRow[k] * LInv[k][j];
			}
			if (!Number.isFinite(sum)) {
				throw new RangeError('Matrix is singular or nearly singular (non-finite inverse entry)');
			}
			outRow[perm[j]] = sum === 0 ? 0 : sum;
		}
	}

	return result;
}

/**
 * Toledo's recursive block LUP factorization of the submatrix
 * `A[rowStart..rowStart+rows-1][colStart..colStart+cols-1]` (`rows >= cols`).
 * Swaps full rows of `A` and `perm` so all previously factored `L` columns
 * and unfactored right-panel columns remain consistently permuted.
 *
 * @param {number[][]} A
 * @param {number} rowStart
 * @param {number} colStart
 * @param {number} rows
 * @param {number} cols
 * @param {number[]} perm
 * @param {number} tol
 */
function factorLupRecursive(A, rowStart, colStart, rows, cols, perm, tol) {
	if (cols === 1) {
		let pivotRow = rowStart;
		let maxAbs = Math.abs(A[rowStart][colStart]);
		for (let r = rowStart + 1; r < rowStart + rows; r++) {
			const absVal = Math.abs(A[r][colStart]);
			if (absVal > maxAbs) {
				maxAbs = absVal;
				pivotRow = r;
			}
		}

		if (maxAbs <= tol) {
			throw new RangeError('Matrix is singular or nearly singular');
		}

		if (pivotRow !== rowStart) {
			const tmpRow = A[rowStart];
			A[rowStart] = A[pivotRow];
			A[pivotRow] = tmpRow;

			const tmpPerm = perm[rowStart];
			perm[rowStart] = perm[pivotRow];
			perm[pivotRow] = tmpPerm;
		}

		const pivot = A[rowStart][colStart];
		for (let r = rowStart + 1; r < rowStart + rows; r++) {
			A[r][colStart] /= pivot;
		}
		return;
	}

	const leftCols = cols >> 1;
	const rightCols = cols - leftCols;

	// Recursively factor left panel
	factorLupRecursive(A, rowStart, colStart, rows, leftCols, perm, tol);

	// Solve L11 * U12 = A12 in place
	solveUnitLowerRecursive(A, rowStart, colStart, leftCols, colStart + leftCols, rightCols);

	// Schur complement update: A22 -= L21 * U12
	const rMid = rowStart + leftCols;
	const rEnd = rowStart + rows;
	const cMid = colStart + leftCols;
	const cEnd = colStart + cols;

	for (let i = rMid; i < rEnd; i++) {
		const rowI = A[i];
		for (let k = 0; k < leftCols; k++) {
			const lVal = rowI[colStart + k];
			if (lVal === 0) continue;
			const uRow = A[rowStart + k];
			for (let j = cMid; j < cEnd; j++) {
				rowI[j] -= lVal * uRow[j];
			}
		}
	}

	// Recursively factor trailing submatrix
	factorLupRecursive(A, rMid, cMid, rows - leftCols, rightCols, perm, tol);
}

/**
 * Recursively solves `L * X = B` in place, where `L` is the unit-lower-triangular
 * `size x size` block stored in the strictly lower triangle of
 * `A[rowStart..rowStart+size-1][colStart..colStart+size-1]` and `B` is stored in
 * `A[rowStart..rowStart+size-1][rhsColStart..rhsColStart+rhsCols-1]`.
 *
 * @param {number[][]} A
 * @param {number} rowStart
 * @param {number} colStart
 * @param {number} size
 * @param {number} rhsColStart
 * @param {number} rhsCols
 */
function solveUnitLowerRecursive(A, rowStart, colStart, size, rhsColStart, rhsCols) {
	if (size <= 1) {
		return;
	}

	const topSize = size >> 1;
	const botSize = size - topSize;

	// Solve L11 * X1 = B1
	solveUnitLowerRecursive(A, rowStart, colStart, topSize, rhsColStart, rhsCols);

	// Update B2 -= L21 * X1
	const rMid = rowStart + topSize;
	const rEnd = rowStart + size;
	const rhsEnd = rhsColStart + rhsCols;

	for (let i = rMid; i < rEnd; i++) {
		const rowI = A[i];
		for (let k = 0; k < topSize; k++) {
			const lVal = rowI[colStart + k];
			if (lVal === 0) continue;
			const xRow = A[rowStart + k];
			for (let j = rhsColStart; j < rhsEnd; j++) {
				rowI[j] -= lVal * xRow[j];
			}
		}
	}

	// Solve L22 * X2 = B2
	solveUnitLowerRecursive(A, rMid, colStart + topSize, botSize, rhsColStart, rhsCols);
}

/**
 * Recursively inverts a non-singular upper-triangular matrix `U`:
 * `[[U11, U12], [0, U22]]^-1 = [[U11^-1, -U11^-1 * U12 * U22^-1], [0, U22^-1]]`.
 *
 * @param {number[][]} U
 * @returns {number[][]}
 */
function invertUpperRecursive(U) {
	const n = U.length;
	if (n === 1) {
		return [[1 / U[0][0]]];
	}

	const mid = n >> 1;
	const U11 = subMatrix(U, 0, mid, 0, mid);
	const U12 = subMatrix(U, 0, mid, mid, n);
	const U22 = subMatrix(U, mid, n, mid, n);

	const W11 = invertUpperRecursive(U11);
	const W22 = invertUpperRecursive(U22);
	const W12 = negateMatrix(matMul(matMul(W11, U12), W22));

	const res = Array.from({ length: n }, () => new Array(n).fill(0));
	copyBlock(res, W11, 0, 0);
	copyBlock(res, W12, 0, mid);
	copyBlock(res, W22, mid, mid);
	return res;
}

/**
 * Recursively inverts a unit-lower-triangular matrix `L`:
 * `[[L11, 0], [L21, L22]]^-1 = [[L11^-1, 0], [-L22^-1 * L21 * L11^-1, L22^-1]]`.
 *
 * @param {number[][]} L
 * @returns {number[][]}
 */
function invertUnitLowerRecursive(L) {
	const n = L.length;
	if (n === 1) {
		return [[1]];
	}

	const mid = n >> 1;
	const L11 = subMatrix(L, 0, mid, 0, mid);
	const L21 = subMatrix(L, mid, n, 0, mid);
	const L22 = subMatrix(L, mid, n, mid, n);

	const V11 = invertUnitLowerRecursive(L11);
	const V22 = invertUnitLowerRecursive(L22);
	const V21 = negateMatrix(matMul(matMul(V22, L21), V11));

	const res = Array.from({ length: n }, () => new Array(n).fill(0));
	copyBlock(res, V11, 0, 0);
	copyBlock(res, V21, mid, 0);
	copyBlock(res, V22, mid, mid);
	return res;
}

/**
 * Extracts a rectangular submatrix `M[r0..r1-1][c0..c1-1]`.
 *
 * @param {number[][]} M
 * @param {number} r0
 * @param {number} r1
 * @param {number} c0
 * @param {number} c1
 * @returns {number[][]}
 */
function subMatrix(M, r0, r1, c0, c1) {
	const rows = r1 - r0;
	const out = new Array(rows);
	for (let i = 0; i < rows; i++) {
		out[i] = M[r0 + i].slice(c0, c1);
	}
	return out;
}

/**
 * Copies `block` into `target` starting at `(rowOffset, colOffset)`.
 *
 * @param {number[][]} target
 * @param {number[][]} block
 * @param {number} rowOffset
 * @param {number} colOffset
 */
function copyBlock(target, block, rowOffset, colOffset) {
	for (let i = 0; i < block.length; i++) {
		const srcRow = block[i];
		const dstRow = target[rowOffset + i];
		for (let j = 0; j < srcRow.length; j++) {
			dstRow[colOffset + j] = srcRow[j];
		}
	}
}

/**
 * Standard rectangular matrix multiplication `A * B`.
 *
 * @param {number[][]} A
 * @param {number[][]} B
 * @returns {number[][]}
 */
function matMul(A, B) {
	const rows = A.length;
	const inner = B.length;
	const cols = B[0].length;
	const out = Array.from({ length: rows }, () => new Array(cols).fill(0));

	for (let i = 0; i < rows; i++) {
		const aRow = A[i];
		const outRow = out[i];
		for (let k = 0; k < inner; k++) {
			const aVal = aRow[k];
			if (aVal === 0) continue;
			const bRow = B[k];
			for (let j = 0; j < cols; j++) {
				outRow[j] += aVal * bRow[j];
			}
		}
	}
	return out;
}

/**
 * Returns `-M` as a new matrix.
 *
 * @param {number[][]} M
 * @returns {number[][]}
 */
function negateMatrix(M) {
	return M.map((row) => row.map((v) => (v === 0 ? 0 : -v)));
}
