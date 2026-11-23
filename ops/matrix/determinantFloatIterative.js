/**
 * Computes the determinant of a square matrix of finite IEEE-754 float64
 * numbers using an iterative Gaussian elimination algorithm with partial
 * pivoting.
 *
 * The input matrix is validated and never mutated. By mathematical convention,
 * the determinant of an empty 0x0 matrix (`[]`) is `1`.
 *
 * @param {number[][]} matrix - Square `n x n` matrix of finite float64 numbers.
 * @returns {number} The determinant of `matrix` as an IEEE-754 float64 number.
 * @throws {TypeError} If `matrix` or any row is not an Array, or any entry is not a number.
 * @throws {RangeError} If `matrix` is not square or contains non-finite numbers (`NaN`, `±Infinity`).
 */
export function determinantFloatIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be an array of row arrays');
	}

	const n = matrix.length;

	/** @type {Float64Array[]} */
	const work = new Array(n);

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

		const copy = new Float64Array(n);
		for (let j = 0; j < n; j++) {
			const val = row[j];
			if (typeof val !== 'number') {
				throw new TypeError(`matrix[${i}][${j}] must be a number`);
			}
			if (!Number.isFinite(val)) {
				throw new RangeError(`matrix[${i}][${j}] must be a finite number`);
			}
			copy[j] = val;
		}
		work[i] = copy;
	}

	if (n === 0) {
		return 1;
	}

	if (n === 1) {
		const det = work[0][0];
		return det === 0 ? 0 : det;
	}

	let sign = 1;

	for (let col = 0; col < n; col++) {
		let pivotRow = col;
		let maxAbs = Math.abs(work[col][col]);

		for (let row = col + 1; row < n; row++) {
			const absVal = Math.abs(work[row][col]);
			if (absVal > maxAbs) {
				maxAbs = absVal;
				pivotRow = row;
			}
		}

		if (maxAbs === 0) {
			return 0;
		}

		if (pivotRow !== col) {
			const tmp = work[col];
			work[col] = work[pivotRow];
			work[pivotRow] = tmp;
			sign = -sign;
		}

		const pivotRowArr = work[col];
		const pivot = pivotRowArr[col];

		for (let row = col + 1; row < n; row++) {
			const targetRow = work[row];
			const factor = targetRow[col] / pivot;
			if (factor === 0) {
				continue;
			}
			targetRow[col] = 0;
			for (let k = col + 1; k < n; k++) {
				targetRow[k] -= factor * pivotRowArr[k];
			}
		}
	}

	let det = sign;
	for (let i = 0; i < n; i++) {
		det *= work[i][i];
	}

	return det === 0 ? 0 : det;
}
