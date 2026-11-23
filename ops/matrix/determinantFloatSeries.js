/**
 * Computes the determinant of a non-empty square matrix of finite IEEE-754
 * float64 numbers without mutating the input.
 *
 * Uses closed-form algebraic formulas for 1x1, 2x2, and 3x3 matrices, and
 * LU decomposition with partial pivoting via the identity
 * `det(A) = (-1)^s * prod(U_ii)` for general n x n matrices (n >= 4), with
 * log-magnitude fallback to avoid spurious intermediate overflow/underflow.
 *
 * @param {number[][]} matrix - Non-empty square 2D array of finite numbers.
 * @returns {number} The determinant as an IEEE-754 float64 number.
 * @throws {TypeError} If `matrix` is not a 2D array of finite numbers.
 * @throws {RangeError} If `matrix` is empty, ragged, or non-square.
 */
export function determinantFloatSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError("matrix must be a 2D array of finite numbers");
	}

	const n = matrix.length;
	if (n === 0) {
		throw new RangeError("matrix must be non-empty");
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${i} must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square (expected row ${i} length ${n}, got ${row.length})`,
			);
		}
		for (let j = 0; j < n; j++) {
			const val = row[j];
			if (typeof val !== "number" || !Number.isFinite(val)) {
				throw new TypeError(
					`matrix[${i}][${j}] must be a finite number`,
				);
			}
		}
	}

	// Closed-form formulas for 1x1, 2x2, and 3x3 matrices.
	if (n === 1) {
		const det = matrix[0][0];
		return det === 0 ? 0 : det;
	}

	if (n === 2) {
		const det = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
		return det === 0 ? 0 : det;
	}

	if (n === 3) {
		const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
		const det =
			a * (e * i - f * h) -
			b * (d * i - f * g) +
			c * (d * h - e * g);
		return det === 0 ? 0 : det;
	}

	// General n x n (n >= 4): LU decomposition with partial pivoting.
	// Copy into row-indexed Float64Arrays so input is never mutated and
	// row swaps are O(1) reference swaps.
	const u = new Array(n);
	for (let i = 0; i < n; i++) {
		u[i] = Float64Array.from(matrix[i]);
	}

	let swapSign = 1;

	for (let k = 0; k < n; k++) {
		let pivotRow = k;
		let maxAbs = Math.abs(u[k][k]);

		for (let r = k + 1; r < n; r++) {
			const absVal = Math.abs(u[r][k]);
			if (absVal > maxAbs) {
				maxAbs = absVal;
				pivotRow = r;
			}
		}

		if (maxAbs === 0) {
			return 0;
		}

		if (pivotRow !== k) {
			const tmp = u[k];
			u[k] = u[pivotRow];
			u[pivotRow] = tmp;
			swapSign = -swapSign;
		}

		const pivotRowArr = u[k];
		const pivot = pivotRowArr[k];

		for (let r = k + 1; r < n; r++) {
			const targetRow = u[r];
			const entry = targetRow[k];
			if (entry === 0) continue;

			const factor = entry / pivot;
			targetRow[k] = 0;
			for (let c = k + 1; c < n; c++) {
				targetRow[c] -= factor * pivotRowArr[c];
			}
		}
	}

	// Identity: det(A) = (-1)^s * prod_{i=0}^{n-1} U_{ii}
	let directDet = swapSign;
	let totalSign = swapSign;
	let logAbsSum = 0;

	for (let i = 0; i < n; i++) {
		const diag = u[i][i];
		if (diag === 0) {
			return 0;
		}
		if (diag < 0) {
			totalSign = -totalSign;
		}
		directDet *= diag;
		logAbsSum += Math.log(Math.abs(diag));
	}

	// Fall back to log-magnitude accumulation if intermediate overflow/underflow occurred.
	if (directDet === 0 || !Number.isFinite(directDet)) {
		const recovered = totalSign * Math.exp(logAbsSum);
		return recovered === 0 ? 0 : recovered;
	}

	return directDet === 0 ? 0 : directDet;
}
