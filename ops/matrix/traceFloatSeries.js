/**
 * Computes the trace of a square matrix over IEEE-754 float64 numbers using
 * Neumaier's improved Kahan-Babuška compensated summation algorithm.
 *
 * The trace of an n x n matrix A is defined as the sum of its main diagonal
 * entries: tr(A) = sum_{i=0}^{n-1} A[i][i].
 *
 * @param {number[][]} matrix - A non-empty square 2D array of finite float64 numbers.
 * @returns {number} The trace of the matrix.
 * @throws {TypeError} If `matrix` is not a 2D array or contains non-number entries.
 * @throws {RangeError} If `matrix` is empty, ragged, non-square, or contains non-finite numbers (NaN, ±Infinity).
 */
export function traceFloatSeries(matrix) {
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

	// Neumaier compensated summation over the main diagonal A[i][i]
	let sum = 0;
	let compensation = 0;

	for (let i = 0; i < n; i++) {
		const value = matrix[i][i];
		const nextSum = sum + value;

		if (!Number.isFinite(nextSum)) {
			sum = nextSum;
			compensation = 0;
			continue;
		}

		if (Math.abs(sum) >= Math.abs(value)) {
			compensation += (sum - nextSum) + value;
		} else {
			compensation += (value - nextSum) + sum;
		}
		sum = nextSum;
	}

	const result = sum + compensation;
	return result === 0 ? 0 : result;
}
