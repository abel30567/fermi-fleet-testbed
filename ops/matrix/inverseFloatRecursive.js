/**
 * Computes the inverse of a square matrix of IEEE-754 float64 numbers using a
 * recursive divide-and-conquer algorithm:
 * 1. Recursive block LU factorization with partial pivoting (PA = LU) so zero
 *    diagonal pivots and singular leading principal submatrices are handled
 *    reliably.
 * 2. Recursive divide-and-conquer triangular inversion of L and U.
 * 3. Reassembly via A^-1 = U^-1 * L^-1 * P.
 *
 * @param {number[][]} matrix - Non-empty n x n matrix of finite numbers.
 * @returns {number[][]} The n x n inverse matrix.
 * @throws {TypeError} If the input is not a 2D array of finite numbers.
 * @throws {RangeError} If the matrix is empty or not square.
 * @throws {Error} If the matrix is singular (or numerically singular / overflows).
 */
export function inverseFloatRecursive(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Input must be a 2D array of numbers')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('Matrix must be non-empty')
	}

	const work = new Array(n)
	let maxAbs = 0

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`Matrix must be square: expected row ${i} length ${n}, got ${row.length}`
			)
		}
		const copy = new Array(n)
		for (let j = 0; j < n; j++) {
			const val = row[j]
			if (typeof val !== 'number' || !Number.isFinite(val)) {
				throw new TypeError(
					`Matrix entry [${i}][${j}] must be a finite number`
				)
			}
			const abs = Math.abs(val)
			if (abs > maxAbs) {
				maxAbs = abs
			}
			copy[j] = val
		}
		work[i] = copy
	}

	if (maxAbs === 0) {
		throw new Error('Matrix is singular and cannot be inverted')
	}

	if (n === 1) {
		const inv = 1 / work[0][0]
		if (!Number.isFinite(inv)) {
			throw new Error('Matrix is singular or inverse overflows float64')
		}
		return [[inv === 0 ? 0 : inv]]
	}

	const tol = maxAbs * n * Number.EPSILON * 4
	const perm = new Array(n)
	for (let i = 0; i < n; i++) {
		perm[i] = i
	}

	factorLUPRecursive(work, 0, n, n, perm, tol)

	const L = new Array(n)
	const U = new Array(n)
	for (let i = 0; i < n; i++) {
		const lRow = new Array(n).fill(0)
		const uRow = new Array(n).fill(0)
		const wRow = work[i]
		lRow[i] = 1
		for (let j = 0; j < i; j++) {
			lRow[j] = wRow[j]
		}
		for (let j = i; j < n; j++) {
			uRow[j] = wRow[j]
		}
		L[i] = lRow
		U[i] = uRow
	}

	const lInv = invertUnitLowerRecursive(L, 0, n)
	const uInv = invertUpperRecursive(U, 0, n, tol)

	const result = new Array(n)
	for (let i = 0; i < n; i++) {
		const resRow = new Array(n)
		const uRow = uInv[i]
		for (let j = 0; j < n; j++) {
			let sum = 0
			const kStart = i > j ? i : j
			for (let k = kStart; k < n; k++) {
				sum += uRow[k] * lInv[k][j]
			}
			if (!Number.isFinite(sum)) {
				throw new Error('Matrix is singular or inverse overflows float64')
			}
			resRow[perm[j]] = sum === 0 ? 0 : sum
		}
		result[i] = resRow
	}

	return result
}

/**
 * In-place recursive divide-and-conquer LU factorization with partial pivoting
 * on the m x k submatrix starting at (offset, offset) of `work`.
 *
 * Swapping full rows in `work` keeps previously computed L columns and
 * trailing unfactored columns aligned with `perm` without separate pivot replay.
 *
 * @param {number[][]} work - Full n x n working matrix.
 * @param {number} offset - Top-left row/column index of the active panel.
 * @param {number} m - Number of rows in the active panel (m >= k).
 * @param {number} k - Number of columns in the active panel.
 * @param {number[]} perm - Row permutation tracking P * A = L * U.
 * @param {number} tol - Numerical singularity threshold.
 */
function factorLUPRecursive(work, offset, m, k, perm, tol) {
	if (k === 1) {
		let pivotRow = offset
		let pivotAbs = Math.abs(work[offset][offset])
		const rowEnd = offset + m
		for (let r = offset + 1; r < rowEnd; r++) {
			const candidate = Math.abs(work[r][offset])
			if (candidate > pivotAbs) {
				pivotAbs = candidate
				pivotRow = r
			}
		}

		if (pivotAbs <= tol) {
			throw new Error('Matrix is singular and cannot be inverted')
		}

		if (pivotRow !== offset) {
			const tmpRow = work[offset]
			work[offset] = work[pivotRow]
			work[pivotRow] = tmpRow

			const tmpPerm = perm[offset]
			perm[offset] = perm[pivotRow]
			perm[pivotRow] = tmpPerm
		}

		const pivotVal = work[offset][offset]
		for (let r = offset + 1; r < rowEnd; r++) {
			work[r][offset] /= pivotVal
		}
		return
	}

	const k1 = k >> 1
	const k2 = k - k1

	// 1. Recursively factor left m x k1 panel.
	factorLUPRecursive(work, offset, m, k1, perm, tol)

	// 2. Recursively solve L11 * U12 = M12 in-place.
	solveUnitLowerRecursive(work, offset, k1, offset + k1, k2)

	// 3. Schur complement update: M22 -= L21 * U12.
	const rStart = offset + k1
	const rEnd = offset + m
	const cStart = offset + k1
	const cEnd = offset + k
	for (let i = rStart; i < rEnd; i++) {
		const rowI = work[i]
		for (let t = 0; t < k1; t++) {
			const lVal = rowI[offset + t]
			if (lVal === 0) continue
			const uRow = work[offset + t]
			for (let j = cStart; j < cEnd; j++) {
				rowI[j] -= lVal * uRow[j]
			}
		}
	}

	// 4. Recursively factor trailing (m - k1) x k2 Schur complement.
	factorLUPRecursive(work, offset + k1, m - k1, k2, perm, tol)
}

/**
 * Recursive divide-and-conquer forward substitution solving L11 * X = B
 * in-place, where L11 is the unit lower triangular k x k block at
 * work[row0..row0+k-1][row0..row0+k-1] and B is work[row0..row0+k-1][colB..colB+colsB-1].
 *
 * @param {number[][]} work - Full n x n working matrix.
 * @param {number} row0 - Starting row/column index of L11.
 * @param {number} k - Dimension of L11.
 * @param {number} colB - Starting column of RHS block B.
 * @param {number} colsB - Number of columns in RHS block B.
 */
function solveUnitLowerRecursive(work, row0, k, colB, colsB) {
	if (k <= 1) {
		return
	}

	const h = k >> 1
	const r = k - h

	solveUnitLowerRecursive(work, row0, h, colB, colsB)

	const colEnd = colB + colsB
	for (let i = 0; i < r; i++) {
		const rowI = work[row0 + h + i]
		for (let t = 0; t < h; t++) {
			const lVal = rowI[row0 + t]
			if (lVal === 0) continue
			const xRow = work[row0 + t]
			for (let j = colB; j < colEnd; j++) {
				rowI[j] -= lVal * xRow[j]
			}
		}
	}

	solveUnitLowerRecursive(work, row0 + h, r, colB, colsB)
}

/**
 * Recursive divide-and-conquer inversion of a unit lower triangular matrix block
 * L[offset..offset+size-1][offset..offset+size-1].
 *
 * Uses block identity:
 * [[L11, 0], [L21, L22]]^-1 = [[L11^-1, 0], [-L22^-1 * L21 * L11^-1, L22^-1]]
 *
 * @param {number[][]} L - Full unit lower triangular matrix.
 * @param {number} offset - Starting index of the diagonal block.
 * @param {number} size - Dimension of the diagonal block.
 * @returns {number[][]} The size x size inverse of the block.
 */
function invertUnitLowerRecursive(L, offset, size) {
	if (size === 1) {
		return [[1]]
	}

	const m = size >> 1
	const r = size - m

	const x11 = invertUnitLowerRecursive(L, offset, m)
	const x22 = invertUnitLowerRecursive(L, offset + m, r)

	// temp = L21 * x11 (r x m)
	const temp = new Array(r)
	for (let i = 0; i < r; i++) {
		const lRow = L[offset + m + i]
		const tRow = new Array(m).fill(0)
		for (let k = 0; k < m; k++) {
			const lVal = lRow[offset + k]
			if (lVal === 0) continue
			const xRow = x11[k]
			for (let j = 0; j <= k; j++) {
				tRow[j] += lVal * xRow[j]
			}
		}
		temp[i] = tRow
	}

	// Assemble size x size inverse.
	const inv = new Array(size)
	for (let i = 0; i < m; i++) {
		const row = new Array(size).fill(0)
		for (let j = 0; j <= i; j++) {
			row[j] = x11[i][j]
		}
		inv[i] = row
	}
	for (let i = 0; i < r; i++) {
		const row = new Array(size).fill(0)
		// x21 = -x22 * temp
		const x22Row = x22[i]
		for (let k = 0; k <= i; k++) {
			const factor = -x22Row[k]
			if (factor === 0) continue
			const tRow = temp[k]
			for (let j = 0; j < m; j++) {
				row[j] += factor * tRow[j]
			}
		}
		for (let j = 0; j <= i; j++) {
			row[m + j] = x22Row[j]
		}
		inv[m + i] = row
	}

	return inv
}

/**
 * Recursive divide-and-conquer inversion of an upper triangular matrix block
 * U[offset..offset+size-1][offset..offset+size-1].
 *
 * Uses block identity:
 * [[U11, U12], [0, U22]]^-1 = [[U11^-1, -U11^-1 * U12 * U22^-1], [0, U22^-1]]
 *
 * @param {number[][]} U - Full upper triangular matrix.
 * @param {number} offset - Starting index of the diagonal block.
 * @param {number} size - Dimension of the diagonal block.
 * @param {number} tol - Numerical singularity threshold.
 * @returns {number[][]} The size x size inverse of the block.
 */
function invertUpperRecursive(U, offset, size, tol) {
	if (size === 1) {
		const diag = U[offset][offset]
		if (Math.abs(diag) <= tol) {
			throw new Error('Matrix is singular and cannot be inverted')
		}
		const invDiag = 1 / diag
		if (!Number.isFinite(invDiag)) {
			throw new Error('Matrix is singular or inverse overflows float64')
		}
		return [[invDiag]]
	}

	const m = size >> 1
	const r = size - m

	const y11 = invertUpperRecursive(U, offset, m, tol)
	const y22 = invertUpperRecursive(U, offset + m, r, tol)

	// temp = y11 * U12 (m x r)
	const temp = new Array(m)
	for (let i = 0; i < m; i++) {
		const yRow = y11[i]
		const tRow = new Array(r).fill(0)
		for (let k = i; k < m; k++) {
			const yVal = yRow[k]
			if (yVal === 0) continue
			const uRow = U[offset + k]
			for (let j = 0; j < r; j++) {
				tRow[j] += yVal * uRow[offset + m + j]
			}
		}
		temp[i] = tRow
	}

	// Assemble size x size inverse.
	const inv = new Array(size)
	for (let i = 0; i < m; i++) {
		const row = new Array(size).fill(0)
		const yRow = y11[i]
		for (let j = i; j < m; j++) {
			row[j] = yRow[j]
		}
		// y12 = -temp * y22
		const tRow = temp[i]
		for (let k = 0; k < r; k++) {
			const factor = -tRow[k]
			if (factor === 0) continue
			const y22Row = y22[k]
			for (let j = k; j < r; j++) {
				row[m + j] += factor * y22Row[j]
			}
		}
		inv[i] = row
	}
	for (let i = 0; i < r; i++) {
		const row = new Array(size).fill(0)
		const y22Row = y22[i]
		for (let j = i; j < r; j++) {
			row[m + j] = y22Row[j]
		}
		inv[m + i] = row
	}

	return inv
}
