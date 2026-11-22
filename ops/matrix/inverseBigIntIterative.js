/**
 * Default fixed-point scaling factor (10^18) for non-integer inverse entries.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

/**
 * Divides `num` by positive `den`, rounding to the nearest BigInt with ties
 * rounded to the nearest even integer (banker's rounding).
 *
 * @param {bigint} num
 * @param {bigint} den - Must be strictly positive (`den > 0n`).
 * @returns {bigint}
 */
function roundDivHalfToEven(num, den) {
	if (num === 0n) return 0n
	const negative = num < 0n
	const absNum = negative ? -num : num
	let quotient = absNum / den
	const remainder = absNum % den
	const twiceRemainder = remainder * 2n
	if (twiceRemainder > den || (twiceRemainder === den && (quotient & 1n) === 1n)) {
		quotient += 1n
	}
	return negative ? -quotient : quotient
}

/**
 * Computes the inverse of a square matrix of exact `BigInt` integers using
 * straightforward iterative fraction-free Gauss-Jordan elimination (Bareiss
 * algorithm), returning a matrix of fixed-point `BigInt` values scaled by
 * `scale` (default `10n ** 18n`).
 *
 * All intermediate elimination steps are performed in exact `BigInt` integer
 * arithmetic with exact division by the previous pivot (guaranteed by
 * Sylvester's determinant identity), yielding the exact signed adjugate matrix
 * and signed determinant with zero accumulated rounding error. Scaling by
 * `scale` and rounding (nearest integer, ties to even) is performed once at
 * the end for each entry.
 *
 * The input matrix is never mutated.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Non-empty square `n x n`
 *   matrix of exact `BigInt` integers.
 * @param {bigint} [scale=SCALE] - Positive `BigInt` fixed-point scaling factor
 *   applied to each entry of the inverse matrix (defaults to `10n ** 18n`).
 * @returns {bigint[][]} The `n x n` inverse matrix where entry `[r][c]` equals
 *   `round((A^-1)[r][c] * scale)` (ties to even).
 * @throws {TypeError} If `matrix` is not a 2D array of `BigInt` values, or if
 *   `scale` is not a `BigInt`.
 * @throws {RangeError} If `matrix` is empty, not square, singular
 *   (determinant equals `0n`), or if `scale <= 0n`.
 */
export function inverseBigIntIterative(matrix, scale = SCALE) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of BigInt values')
	}
	if (typeof scale !== 'bigint') {
		throw new TypeError('scale must be a BigInt')
	}
	if (scale <= 0n) {
		throw new RangeError('scale must be a positive BigInt')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	/** @type {bigint[][]} */
	const work = new Array(n)
	/** @type {bigint[][]} */
	const inv = new Array(n)

	for (let r = 0; r < n; r++) {
		const row = matrix[r]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${r}] must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square (expected ${n} columns in row ${r}, got ${row.length})`
			)
		}

		const workRow = new Array(n)
		const invRow = new Array(n)
		for (let c = 0; c < n; c++) {
			const val = row[c]
			if (typeof val !== 'bigint') {
				throw new TypeError(`matrix[${r}][${c}] must be a BigInt`)
			}
			workRow[c] = val
			invRow[c] = r === c ? 1n : 0n
		}
		work[r] = workRow
		inv[r] = invRow
	}

	let prevPivot = 1n

	for (let k = 0; k < n; k++) {
		let pivotRow = -1
		for (let r = k; r < n; r++) {
			if (work[r][k] !== 0n) {
				pivotRow = r
				break
			}
		}

		if (pivotRow === -1) {
			throw new RangeError('matrix is singular and cannot be inverted')
		}

		if (pivotRow !== k) {
			const tmpWork = work[k]
			work[k] = work[pivotRow]
			work[pivotRow] = tmpWork

			const tmpInv = inv[k]
			inv[k] = inv[pivotRow]
			inv[pivotRow] = tmpInv
		}

		const pivot = work[k][k]
		const pivotWorkRow = work[k]
		const pivotInvRow = inv[k]

		for (let i = 0; i < n; i++) {
			if (i === k) continue
			const rowWork = work[i]
			const rowInv = inv[i]
			const factor = rowWork[k]

			if (factor === 0n && pivot === prevPivot) {
				continue
			}

			for (let j = k + 1; j < n; j++) {
				rowWork[j] = (pivot * rowWork[j] - factor * pivotWorkRow[j]) / prevPivot
			}
			for (let j = 0; j < n; j++) {
				rowInv[j] = (pivot * rowInv[j] - factor * pivotInvRow[j]) / prevPivot
			}
		}

		prevPivot = pivot
	}

	// At this point, `prevPivot` is the signed determinant of the pivoted matrix
	// and `inv[r][c] / prevPivot` is the exact rational entry (A^-1)[r][c].
	const detNegative = prevPivot < 0n
	const absDet = detNegative ? -prevPivot : prevPivot

	for (let r = 0; r < n; r++) {
		const rowInv = inv[r]
		for (let c = 0; c < n; c++) {
			const num = (detNegative ? -rowInv[c] : rowInv[c]) * scale
			rowInv[c] = roundDivHalfToEven(num, absDet)
		}
	}

	return inv
}
