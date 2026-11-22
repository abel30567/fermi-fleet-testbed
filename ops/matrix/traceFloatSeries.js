/**
 * Computes the trace of a square n x n matrix of finite IEEE-754 float64 numbers:
 *   tr(A) = sum_{i=0}^{n-1} A[i][i]
 *
 * Uses Neumaier's improved Kahan-Babuška compensated summation algorithm to minimize
 * floating-point rounding and catastrophic cancellation errors along the diagonal,
 * with exact power-of-two scaling fallback if an intermediate sum would overflow.
 *
 * @param {number[][]} matrix - A non-empty square n x n 2D array of finite numbers.
 * @returns {number} The trace of the matrix as an IEEE-754 float64 number.
 * @throws {TypeError} If `matrix` is not a 2D array or contains non-number entries.
 * @throws {RangeError} If `matrix` is empty, jagged, non-square, or contains non-finite numbers (NaN, ±Infinity).
 */
export function traceFloatSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a 2D array of finite numbers')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('Expected matrix to be a non-empty square 2D array')
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${i} to be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`Expected a square ${n}x${n} matrix, but row ${i} has length ${row.length}`
			)
		}
		for (let j = 0; j < n; j++) {
			const entry = row[j]
			if (typeof entry !== 'number') {
				throw new TypeError(
					`Expected finite number at matrix[${i}][${j}], got ${typeof entry}`
				)
			}
			if (!Number.isFinite(entry)) {
				throw new RangeError(
					`Expected finite number at matrix[${i}][${j}], got ${entry}`
				)
			}
		}
	}

	// Neumaier compensated summation along the main diagonal
	let sum = 0.0
	let compensation = 0.0
	let overflowed = false

	for (let i = 0; i < n; i++) {
		const x = matrix[i][i]
		const t = sum + x
		if (!Number.isFinite(t)) {
			overflowed = true
			break
		}
		if (Math.abs(sum) >= Math.abs(x)) {
			compensation += (sum - t) + x
		} else {
			compensation += (x - t) + sum
		}
		sum = t
	}

	if (!overflowed) {
		return sum + compensation
	}

	// Exact power-of-two scaling fallback to avoid spurious intermediate overflow
	const shift = Math.ceil(Math.log2(n)) + 1
	const scale = 2 ** -shift
	const invScale = 2 ** shift

	let scaledSum = 0.0
	let scaledComp = 0.0
	for (let i = 0; i < n; i++) {
		const x = matrix[i][i] * scale
		const t = scaledSum + x
		if (Math.abs(scaledSum) >= Math.abs(x)) {
			scaledComp += (scaledSum - t) + x
		} else {
			scaledComp += (x - t) + scaledSum
		}
		scaledSum = t
	}

	return (scaledSum + scaledComp) * invScale
}
