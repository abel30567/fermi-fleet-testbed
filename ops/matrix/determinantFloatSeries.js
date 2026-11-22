/**
 * Validates that the input is a non-empty square 2D array of finite numbers.
 *
 * @param {unknown} matrix
 * @returns {number} The dimension n of the n x n matrix.
 * @throws {TypeError} If matrix is not an array, any row is not an array, or any entry is not a number.
 * @throws {RangeError} If matrix is empty, not square, or contains non-finite numbers (NaN, ±Infinity).
 */
function validateSquareMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of finite numbers');
	}
	const n = matrix.length;
	if (n === 0) {
		throw new RangeError('matrix must be non-empty');
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${i} must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			);
		}
		for (let j = 0; j < n; j++) {
			const value = row[j];
			if (typeof value !== 'number') {
				throw new TypeError(
					`matrix[${i}][${j}] must be a number, got ${typeof value}`
				);
			}
			if (!Number.isFinite(value)) {
				throw new RangeError(
					`matrix[${i}][${j}] must be a finite number, got ${value}`
				);
			}
		}
	}

	return n;
}

/**
 * Computes the determinant of an n x n square matrix over IEEE-754 float64 Numbers.
 *
 * Algorithm:
 * - For 1x1, 2x2, and 3x3 matrices, uses exact closed-form formulas (direct value,
 *   2x2 cross-product, and 3x3 first-row cofactor expansion).
 * - For n >= 4, computes the PA = LU factorization via Gaussian elimination with
 *   partial pivoting on an internal Float64Array copy (leaving the input unmutated),
 *   then returns det(P) * prod(diag(U)) = (-1)^swaps * prod_{k=0}^{n-1} U[k][k].
 *   If intermediate diagonal multiplication overflows or underflows while all pivots
 *   are nonzero, falls back to summing log(|U[k][k]|) to preserve finite results.
 *
 * @param {number[][]} matrix - Non-empty n x n square matrix of finite IEEE-754 numbers.
 * @returns {number} The determinant of `matrix`.
 * @throws {TypeError} If `matrix` is not a 2D array of numbers.
 * @throws {RangeError} If `matrix` is empty, non-square, or contains NaN or ±Infinity.
 */
export function determinantFloatSeries(matrix) {
	const n = validateSquareMatrix(matrix);

	if (n === 1) {
		const det = matrix[0][0];
		return det === 0 ? 0 : det;
	}

	if (n === 2) {
		const det = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
		return det === 0 ? 0 : det;
	}

	if (n === 3) {
		const [r0, r1, r2] = matrix;
		const det =
			r0[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
			r0[1] * (r1[0] * r2[2] - r1[2] * r2[0]) +
			r0[2] * (r1[0] * r2[1] - r1[1] * r2[0]);
		return det === 0 ? 0 : det;
	}

	// Copy into row-wise Float64Arrays so the input matrix is never mutated
	// and row swaps during partial pivoting are O(1) reference swaps.
	const lu = new Array(n);
	for (let i = 0; i < n; i++) {
		lu[i] = Float64Array.from(matrix[i]);
	}

	let sign = 1;

	for (let k = 0; k < n; k++) {
		// Partial pivoting: select row >= k with largest |lu[i][k]|
		let pivotRow = k;
		let pivotAbs = Math.abs(lu[k][k]);
		for (let i = k + 1; i < n; i++) {
			const candidateAbs = Math.abs(lu[i][k]);
			if (candidateAbs > pivotAbs) {
				pivotAbs = candidateAbs;
				pivotRow = i;
			}
		}

		// Exact zero pivot column implies a singular matrix
		if (pivotAbs === 0) {
			return 0;
		}

		if (pivotRow !== k) {
			const tmp = lu[k];
			lu[k] = lu[pivotRow];
			lu[pivotRow] = tmp;
			sign = -sign;
		}

		const pivotRowArr = lu[k];
		const pivot = pivotRowArr[k];

		for (let i = k + 1; i < n; i++) {
			const rowI = lu[i];
			const factor = rowI[k] / pivot;
			if (factor === 0) {
				continue;
			}
			for (let j = k + 1; j < n; j++) {
				rowI[j] -= factor * pivotRowArr[j];
			}
		}
	}

	// Direct product of U's diagonal entries times permutation sign
	let det = sign;
	for (let k = 0; k < n; k++) {
		det *= lu[k][k];
	}

	// Guard against intermediate overflow/underflow when the final product is finite
	if (!Number.isFinite(det) || det === 0) {
		let logAbs = 0;
		let prodSign = sign;
		for (let k = 0; k < n; k++) {
			const d = lu[k][k];
			if (d === 0) {
				return 0;
			}
			if (d < 0) {
				prodSign = -prodSign;
			}
			logAbs += Math.log(Math.abs(d));
		}
		det = prodSign * Math.exp(logAbs);
	}

	return det === 0 ? 0 : det;
}
