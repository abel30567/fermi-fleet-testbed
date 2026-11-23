/**
 * Computes the exact determinant of a square matrix of `BigInt` entries using
 * Bareiss fraction-free Gaussian elimination with minimal-magnitude partial pivoting.
 *
 * Because every intermediate elimination step divides cleanly by the previous
 * pivot (Sylvester's determinant identity), the computation remains strictly in
 * exact arbitrary-precision integer arithmetic with zero rounding error and
 * bounded intermediate coefficient growth (Hadamard bound). Choosing the
 * smallest non-zero pivot in each column minimizes intermediate BigInt bit-length
 * while handling zero pivots safely.
 *
 * Conventions:
 * - The determinant of an empty 0x0 matrix (`[]`) is `1n` (empty product).
 * - The input matrix and its rows are never mutated.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Square `n x n` matrix of `BigInt` values.
 * @returns {bigint} Exact `BigInt` determinant of `matrix`.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any entry is not a `bigint`.
 * @throws {RangeError} If `matrix` is not square (any row length differs from `matrix.length`).
 */
export function determinantBigIntStable(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be an array of rows');
	}

	const n = matrix.length;
	const work = new Array(n);

	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} length ${n}, got ${row.length}`
			);
		}
		const copy = new Array(n);
		for (let j = 0; j < n; j++) {
			const val = row[j];
			if (typeof val !== 'bigint') {
				throw new TypeError(
					`matrix[${i}][${j}] must be a bigint, got ${val === null ? 'null' : typeof val}`
				);
			}
			copy[j] = val;
		}
		work[i] = copy;
	}

	if (n === 0) {
		return 1n;
	}
	if (n === 1) {
		return work[0][0];
	}

	let sign = 1n;
	let prevPivot = 1n;

	for (let k = 0; k < n - 1; k++) {
		// Partial pivoting: select the non-zero pivot in column k with minimal
		// absolute value to reduce intermediate BigInt coefficient swell.
		let pivotRowIdx = -1;
		let bestAbs = 0n;

		for (let r = k; r < n; r++) {
			const v = work[r][k];
			if (v !== 0n) {
				const absV = v < 0n ? -v : v;
				if (pivotRowIdx === -1 || absV < bestAbs) {
					pivotRowIdx = r;
					bestAbs = absV;
					if (bestAbs === 1n) {
						break;
					}
				}
			}
		}

		// Entire remaining column is zero => matrix is singular.
		if (pivotRowIdx === -1) {
			return 0n;
		}

		if (pivotRowIdx !== k) {
			const tmp = work[k];
			work[k] = work[pivotRowIdx];
			work[pivotRowIdx] = tmp;
			sign = -sign;
		}

		const pivotRow = work[k];
		const pivot = pivotRow[k];

		for (let i = k + 1; i < n; i++) {
			const rowI = work[i];
			const factor = rowI[k];
			if (factor === 0n) {
				// Still must scale by pivot / prevPivot to preserve the Bareiss invariant.
				for (let j = k + 1; j < n; j++) {
					rowI[j] = (pivot * rowI[j]) / prevPivot;
				}
			} else {
				for (let j = k + 1; j < n; j++) {
					rowI[j] = (pivot * rowI[j] - factor * pivotRow[j]) / prevPivot;
				}
			}
		}

		prevPivot = pivot;
	}

	const det = sign * work[n - 1][n - 1];
	return det === 0n ? 0n : det;
}
