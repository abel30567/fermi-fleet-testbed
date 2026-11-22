/**
 * Computes the exact BigInt trace of a square n×n BigInt matrix via the
 * finite diagonal series identity:
 *
 *   tr(A) = Σ_{i=0}^{n-1} A[i][i]
 *
 * Since all entries are exact BigInts, the trace is an exact BigInt with
 * arbitrary precision and no scaling or rounding loss.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Non-empty square n×n matrix of BigInt entries.
 * @returns {bigint} The exact sum of the main diagonal entries of `matrix`.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any entry is not a BigInt.
 * @throws {RangeError} If `matrix` is empty, ragged, or not square.
 */
export function traceBigIntSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of BigInt values')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			)
		}
		for (let j = 0; j < n; j++) {
			if (typeof row[j] !== 'bigint') {
				throw new TypeError(
					`matrix entry [${i}][${j}] must be a BigInt, got ${typeof row[j]}`
				)
			}
		}
	}

	let sum = 0n
	for (let i = 0; i < n; i++) {
		sum += matrix[i][i]
	}

	return sum
}
