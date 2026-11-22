/**
 * Computes the determinant of a square complex matrix using a recursive
 * divide-and-conquer LU factorization with partial pivoting (Toledo's algorithm).
 *
 * Complex numbers are represented as plain objects `{ re, im }` with finite
 * real numbers. The input matrix is never mutated.
 *
 * Algorithm:
 * - For `0 x 0` matrices, returns `{ re: 1, im: 0 }` (standard empty-product convention).
 * - For `1 x 1` and `2 x 2` matrices, evaluates the exact closed-form base cases.
 * - For `n >= 3`, recursively splits the matrix columns in half (`n1 = floor(n / 2)`,
 *   `n2 = n - n1`):
 *   1. Recursively factors the left `m x n1` panel with partial pivoting, applying
 *      row permutations to the full rows.
 *   2. Solves the unit lower-triangular system `L11 * U12 = A12` via recursive
 *      divide-and-conquer triangular substitution.
 *   3. Updates the trailing Schur complement `A22 <- A22 - L21 * U12`.
 *   4. Recursively factors the trailing `(m - n1) x n2` submatrix.
 * - Combines the diagonal pivots of `U` using a divide-and-conquer product tree
 *   with exact power-of-two scaling to prevent premature intermediate overflow
 *   or underflow, multiplied by the permutation sign.
 * - Complex division uses Smith's overflow-safe algorithm and pivot selection
 *   uses `Math.hypot`.
 *
 * Conventions:
 * - `-0` components in the returned `{ re, im }` are normalized to `+0`.
 * - Singular matrices return `{ re: 0, im: 0 }` (exact zero if a zero pivot is
 *   encountered, or within floating-point rounding otherwise).
 *
 * @param {Array<Array<{ re: number, im: number }>>} matrix - Square `n x n` matrix of complex numbers.
 * @returns {{ re: number, im: number }} The determinant as `{ re, im }`.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array,
 *   or any entry is not a `{ re, im }` object with numeric `re` and `im` fields.
 * @throws {RangeError} If `matrix` is non-square or ragged, or if any entry
 *   contains non-finite (`NaN`, `Infinity`, `-Infinity`) components.
 */
export function determinantComplexRecursive(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be an array of rows')
	}

	const n = matrix.length
	if (n === 0) {
		return { re: 1, im: 0 }
	}

	// Validate row types before checking dimensions so structural TypeErrors take precedence.
	for (let i = 0; i < n; i++) {
		if (!Array.isArray(matrix[i])) {
			throw new TypeError(`matrix[${i}] must be an array`)
		}
	}

	// Validate dimensions and entries while creating an isolated working copy.
	const work = new Array(n)
	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			)
		}
		const copyRow = new Array(n)
		for (let j = 0; j < n; j++) {
			const entry = row[j]
			if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
				throw new TypeError(`matrix[${i}][${j}] must be a { re, im } object`)
			}
			const { re, im } = entry
			if (typeof re !== 'number' || typeof im !== 'number') {
				throw new TypeError(`matrix[${i}][${j}] must have numeric re and im properties`)
			}
			if (!Number.isFinite(re) || !Number.isFinite(im)) {
				throw new RangeError(`matrix[${i}][${j}] must have finite re and im components`)
			}
			copyRow[j] = { re, im }
		}
		work[i] = copyRow
	}

	// Exact base cases for small dimensions.
	if (n === 1) {
		return {
			re: normalizeZero(work[0][0].re),
			im: normalizeZero(work[0][0].im),
		}
	}

	if (n === 2) {
		const ad = cMul(work[0][0], work[1][1])
		const bc = cMul(work[0][1], work[1][0])
		return {
			re: normalizeZero(ad.re - bc.re),
			im: normalizeZero(ad.im - bc.im),
		}
	}

	// Divide-and-conquer recursive LU factorization with partial pivoting.
	const sign = factorPanelRecursive(work, 0, 0, n, n)
	if (sign === 0) {
		return { re: 0, im: 0 }
	}

	// Divide-and-conquer scaled product of diagonal pivots of U.
	const scaledProd = productDiagonalRecursive(work, 0, n)
	if (scaledProd.re === 0 && scaledProd.im === 0) {
		return { re: 0, im: 0 }
	}

	const det = scaleByPow2(
		{ re: sign * scaledProd.re, im: sign * scaledProd.im },
		scaledProd.exp
	)

	return {
		re: normalizeZero(det.re),
		im: normalizeZero(det.im),
	}
}

const POW2_POS = 2 ** 512
const POW2_NEG = 2 ** -512

function normalizeZero(x) {
	return x === 0 ? 0 : x
}

function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Overflow-safe complex division (Smith's algorithm): computes a / b.
 */
function cDiv(a, b) {
	if (Math.abs(b.re) >= Math.abs(b.im)) {
		const r = b.im / b.re
		const denom = b.re + b.im * r
		return {
			re: (a.re + a.im * r) / denom,
			im: (a.im - a.re * r) / denom,
		}
	}
	const r = b.re / b.im
	const denom = b.im + b.re * r
	return {
		re: (a.im + a.re * r) / denom,
		im: (a.im * r - a.re) / denom,
	}
}

/**
 * Scales a complex number by an exact power of two (2 ** exp) in safe steps
 * to avoid premature overflow or underflow of intermediate scale factors.
 */
function scaleByPow2(z, exp) {
	let re = z.re
	let im = z.im
	let e = exp
	while (e > 512) {
		re *= POW2_POS
		im *= POW2_POS
		e -= 512
	}
	while (e < -512) {
		re *= POW2_NEG
		im *= POW2_NEG
		e += 512
	}
	if (e !== 0) {
		const factor = 2 ** e
		re *= factor
		im *= factor
	}
	return { re, im }
}

/**
 * Toledo's recursive divide-and-conquer LU factorization with partial pivoting.
 *
 * Factors the `rows x cols` panel starting at `(rowStart, colStart)` in-place.
 * Invariant for square matrices: `rowStart === colStart` and `rows >= cols`.
 * Row swaps are applied to full rows of `M`, preserving the permutation across
 * all columns to the right and all previously computed `L` entries to the left.
 *
 * Returns `+1` or `-1` for the permutation parity, or `0` if a zero pivot
 * indicates exact singularity.
 */
function factorPanelRecursive(M, rowStart, colStart, rows, cols) {
	if (cols === 1) {
		let pivotRow = rowStart
		let maxAbs = Math.hypot(M[rowStart][colStart].re, M[rowStart][colStart].im)
		const rowEnd = rowStart + rows
		for (let r = rowStart + 1; r < rowEnd; r++) {
			const entry = M[r][colStart]
			const abs = Math.hypot(entry.re, entry.im)
			if (abs > maxAbs) {
				maxAbs = abs
				pivotRow = r
			}
		}

		if (maxAbs === 0) {
			return 0
		}

		let sign = 1
		if (pivotRow !== rowStart) {
			const tmp = M[rowStart]
			M[rowStart] = M[pivotRow]
			M[pivotRow] = tmp
			sign = -1
		}

		const pivot = M[rowStart][colStart]
		for (let r = rowStart + 1; r < rowEnd; r++) {
			const entry = M[r][colStart]
			if (entry.re !== 0 || entry.im !== 0) {
				M[r][colStart] = cDiv(entry, pivot)
			}
		}
		return sign
	}

	const n1 = cols >> 1
	const n2 = cols - n1

	// 1. Recursively factor the left rows x n1 panel.
	const sign1 = factorPanelRecursive(M, rowStart, colStart, rows, n1)
	if (sign1 === 0) {
		return 0
	}

	// 2. Solve L11 * U12 = A12 in-place via divide-and-conquer triangular solve.
	solveUnitLowerRecursive(M, rowStart, colStart, n1, colStart + n1, n2)

	// 3. Schur complement update: A22 <- A22 - L21 * U12.
	gemmSub(
		M,
		rowStart + n1,
		colStart,
		rowStart,
		colStart + n1,
		rowStart + n1,
		colStart + n1,
		rows - n1,
		n1,
		n2
	)

	// 4. Recursively factor the trailing (rows - n1) x n2 submatrix.
	const sign2 = factorPanelRecursive(M, rowStart + n1, colStart + n1, rows - n1, n2)
	if (sign2 === 0) {
		return 0
	}

	return sign1 * sign2
}

/**
 * Recursive divide-and-conquer forward substitution for `L * X = B` in-place,
 * where `L` is a `dim x dim` unit lower-triangular submatrix at `(lRow, lCol)`
 * and `B` (overwritten by `X`) is a `dim x rhsCols` submatrix at `(lRow, rhsCol)`.
 */
function solveUnitLowerRecursive(M, lRow, lCol, dim, rhsCol, rhsCols) {
	if (dim <= 1) {
		return
	}
	const d1 = dim >> 1
	const d2 = dim - d1

	// Solve top block: L11 * X1 = B1.
	solveUnitLowerRecursive(M, lRow, lCol, d1, rhsCol, rhsCols)

	// Update bottom block: B2 <- B2 - L21 * X1.
	gemmSub(M, lRow + d1, lCol, lRow, rhsCol, lRow + d1, rhsCol, d2, d1, rhsCols)

	// Solve bottom block: L22 * X2 = B2.
	solveUnitLowerRecursive(M, lRow + d1, lCol + d1, d2, rhsCol, rhsCols)
}

/**
 * Computes `C <- C - A * B` in-place on disjoint submatrices of `M`:
 * - `A` is `m x k` at `(aRow, aCol)`
 * - `B` is `k x p` at `(bRow, bCol)`
 * - `C` is `m x p` at `(cRow, cCol)`
 */
function gemmSub(M, aRow, aCol, bRow, bCol, cRow, cCol, m, k, p) {
	for (let i = 0; i < m; i++) {
		const rowA = M[aRow + i]
		const rowC = M[cRow + i]
		for (let j = 0; j < p; j++) {
			let sumRe = 0
			let sumIm = 0
			for (let t = 0; t < k; t++) {
				const a = rowA[aCol + t]
				const b = M[bRow + t][bCol + j]
				sumRe += a.re * b.re - a.im * b.im
				sumIm += a.re * b.im + a.im * b.re
			}
			const c = rowC[cCol + j]
			c.re -= sumRe
			c.im -= sumIm
		}
	}
}

/**
 * Divide-and-conquer product of diagonal entries `M[i][i]` for `start <= i < end`,
 * keeping intermediate magnitudes in `[1, 2)` via exact power-of-two scaling.
 */
function productDiagonalRecursive(M, start, end) {
	const len = end - start
	if (len === 1) {
		const z = M[start][start]
		const abs = Math.hypot(z.re, z.im)
		if (abs === 0) {
			return { re: 0, im: 0, exp: 0 }
		}
		const exp = Math.floor(Math.log2(abs))
		const scaled = scaleByPow2(z, -exp)
		return { re: scaled.re, im: scaled.im, exp }
	}

	const mid = start + (len >> 1)
	const left = productDiagonalRecursive(M, start, mid)
	if (left.re === 0 && left.im === 0) {
		return { re: 0, im: 0, exp: 0 }
	}
	const right = productDiagonalRecursive(M, mid, end)
	if (right.re === 0 && right.im === 0) {
		return { re: 0, im: 0, exp: 0 }
	}

	const prod = cMul(left, right)
	const abs = Math.hypot(prod.re, prod.im)
	if (abs === 0) {
		return { re: 0, im: 0, exp: 0 }
	}
	const shift = Math.floor(Math.log2(abs))
	const scaled = scaleByPow2(prod, -shift)
	return { re: scaled.re, im: scaled.im, exp: left.exp + right.exp + shift }
}
