/**
 * Computes the exact trace of a square matrix of BigInt integers using
 * iterative pairwise (binary-tree) summation.
 *
 * The trace of an n x n matrix A is the sum of its main diagonal entries:
 *   tr(A) = A[0][0] + A[1][1] + ... + A[n - 1][n - 1]
 *
 * Because all entries are exact BigInt integers, the trace is always an exact
 * BigInt integer with zero rounding error. Iterative pairwise summation keeps
 * intermediate BigInt operand sizes balanced in O(log n) auxiliary space
 * without recursion.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Square 2D array of BigInt values.
 * @returns {bigint} Exact BigInt trace of the matrix (0n for a 0x0 empty matrix).
 * @throws {TypeError} If `matrix` is not a 2D array or contains any non-BigInt entry.
 * @throws {RangeError} If `matrix` is not square (any row length differs from `matrix.length`).
 */
export function traceBigIntStable(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a 2D array of BigInt values');
	}

	const n = matrix.length;

	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected matrix[${i}] to be an array of BigInt values`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`Expected a square ${n}x${n} matrix, but row ${i} has length ${row.length}`
			);
		}
		for (let j = 0; j < n; j++) {
			const value = row[j];
			if (typeof value !== 'bigint') {
				const actualType = value === null ? 'null' : typeof value;
				throw new TypeError(
					`Expected BigInt at matrix[${i}][${j}], received ${actualType}`
				);
			}
		}
	}

	// Iterative pairwise (cascade) summation over the main diagonal.
	// levels[k] stores either null or an exact partial sum of 2^k diagonal terms.
	const levels = [];
	for (let i = 0; i < n; i++) {
		let carry = matrix[i][i];
		let level = 0;
		while (level < levels.length && levels[level] !== null) {
			carry += levels[level];
			levels[level] = null;
			level++;
		}
		levels[level] = carry;
	}

	let total = 0n;
	for (let level = 0; level < levels.length; level++) {
		if (levels[level] !== null) {
			total += levels[level];
		}
	}

	return total;
}
