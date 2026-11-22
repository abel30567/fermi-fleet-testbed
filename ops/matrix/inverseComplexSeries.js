/**
 * Computes the inverse of a square complex matrix whose entries are represented
 * as `{ re, im }` objects with finite numeric components.
 *
 * Uses closed-form formulas for 1x1 and 2x2 matrices and Gauss-Jordan
 * elimination with partial pivoting for n x n (n >= 3) matrices, using
 * overflow-safe complex division (Smith's algorithm). Does not mutate the input
 * matrix.
 *
 * @typedef {{ re: number, im: number }} Complex
 *
 * @param {Complex[][]} matrix - Non-empty square 2D array of finite complex numbers `{ re, im }`.
 * @returns {Complex[][]} The inverse matrix `A^-1` as a new square 2D array of `{ re, im }`.
 * @throws {TypeError} If `matrix` is not a 2D array of objects with finite numeric `re` and `im` properties.
 * @throws {RangeError} If `matrix` is empty, not square, or singular (not invertible).
 */
export function inverseComplexSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of { re, im } complex numbers')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	let maxAbs = 0
	const validated = new Array(n)

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(`matrix must be square (expected ${n} columns, got ${row.length} in row ${i})`)
		}

		const copyRow = new Array(n)
		for (let j = 0; j < n; j++) {
			const cell = row[j]
			if (
				cell === null ||
				typeof cell !== 'object' ||
				Array.isArray(cell) ||
				typeof cell.re !== 'number' ||
				typeof cell.im !== 'number' ||
				!Number.isFinite(cell.re) ||
				!Number.isFinite(cell.im)
			) {
				throw new TypeError(`matrix[${i}][${j}] must be an object with finite numeric re and im`)
			}
			const abs = Math.hypot(cell.re, cell.im)
			if (abs > maxAbs) {
				maxAbs = abs
			}
			copyRow[j] = { re: cell.re, im: cell.im }
		}
		validated[i] = copyRow
	}

	if (maxAbs === 0) {
		throw new RangeError('matrix is singular and cannot be inverted')
	}

	// Closed-form 1x1 inverse
	if (n === 1) {
		const inv = cDiv({ re: 1, im: 0 }, validated[0][0])
		return [[normalizeComplex(inv)]]
	}

	// Closed-form 2x2 adjugate inverse: (1 / det) * [[d, -b], [-c, a]]
	if (n === 2) {
		const a = validated[0][0]
		const b = validated[0][1]
		const c = validated[1][0]
		const d = validated[1][1]

		const ad = cMul(a, d)
		const bc = cMul(b, c)
		const det = cSub(ad, bc)
		const detAbs = Math.hypot(det.re, det.im)
		const scale = Math.max(Math.hypot(ad.re, ad.im), Math.hypot(bc.re, bc.im))

		if (scale === 0 || detAbs <= scale * 1e-12) {
			throw new RangeError('matrix is singular and cannot be inverted')
		}

		return [
			[
				normalizeComplex(cDiv(d, det)),
				normalizeComplex(cDiv({ re: -b.re, im: -b.im }, det)),
			],
			[
				normalizeComplex(cDiv({ re: -c.re, im: -c.im }, det)),
				normalizeComplex(cDiv(a, det)),
			],
		]
	}

	// Gauss-Jordan elimination with partial pivoting on augmented [A | I]
	const aug = new Array(n)
	for (let i = 0; i < n; i++) {
		const row = new Array(2 * n)
		for (let j = 0; j < n; j++) {
			row[j] = validated[i][j]
			row[n + j] = { re: i === j ? 1 : 0, im: 0 }
		}
		aug[i] = row
	}

	const pivotTol = maxAbs * n * 1e-12

	for (let col = 0; col < n; col++) {
		// Find pivot row with maximum modulus in current column
		let pivotRow = col
		let pivotAbs = Math.hypot(aug[col][col].re, aug[col][col].im)

		for (let r = col + 1; r < n; r++) {
			const candidateAbs = Math.hypot(aug[r][col].re, aug[r][col].im)
			if (candidateAbs > pivotAbs) {
				pivotAbs = candidateAbs
				pivotRow = r
			}
		}

		if (pivotAbs <= pivotTol) {
			throw new RangeError('matrix is singular and cannot be inverted')
		}

		// Swap pivot row into position
		if (pivotRow !== col) {
			const tmp = aug[col]
			aug[col] = aug[pivotRow]
			aug[pivotRow] = tmp
		}

		// Scale pivot row so pivot becomes 1 + 0i
		const pivot = aug[col][col]
		const pRow = aug[col]
		pRow[col] = { re: 1, im: 0 }
		for (let j = col + 1; j < 2 * n; j++) {
			pRow[j] = cDiv(pRow[j], pivot)
		}

		// Eliminate current column from all other rows
		for (let r = 0; r < n; r++) {
			if (r === col) continue
			const targetRow = aug[r]
			const factor = targetRow[col]
			if (factor.re === 0 && factor.im === 0) continue
			targetRow[col] = { re: 0, im: 0 }
			for (let j = col + 1; j < 2 * n; j++) {
				const prod = cMul(factor, pRow[j])
				targetRow[j] = {
					re: targetRow[j].re - prod.re,
					im: targetRow[j].im - prod.im,
				}
			}
		}
	}

	// Extract right half as the inverse matrix
	const inv = new Array(n)
	for (let i = 0; i < n; i++) {
		const outRow = new Array(n)
		for (let j = 0; j < n; j++) {
			outRow[j] = normalizeComplex(aug[i][n + j])
		}
		inv[i] = outRow
	}

	return inv
}

function cSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im }
}

function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

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
		re: (a.re * r + a.im) / denom,
		im: (a.im * r - a.re) / denom,
	}
}

function normalizeComplex(z) {
	return {
		re: z.re === 0 ? 0 : z.re,
		im: z.im === 0 ? 0 : z.im,
	}
}
