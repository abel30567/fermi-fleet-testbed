/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalizes IEEE-754 negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} x
 * @returns {number}
 */
function cleanZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Overflow-safe complex magnitude `|z|`.
 *
 * @param {Complex} z
 * @returns {number}
 */
function cAbs(z) {
	return Math.hypot(z.re, z.im)
}

/**
 * Complex division `a / b` using Smith's numerically stable formula.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function cDiv(a, b) {
	const absRe = Math.abs(b.re)
	const absIm = Math.abs(b.im)
	if (absRe === 0 && absIm === 0) {
		throw new RangeError('Matrix is singular: division by zero')
	}
	if (absRe >= absIm) {
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

/**
 * Allocates an `rows x cols` complex zero matrix.
 *
 * @param {number} rows
 * @param {number} cols
 * @returns {Complex[][]}
 */
function createZeroMatrix(rows, cols) {
	const out = new Array(rows)
	for (let i = 0; i < rows; i++) {
		const row = new Array(cols)
		for (let j = 0; j < cols; j++) {
			row[j] = { re: 0, im: 0 }
		}
		out[i] = row
	}
	return out
}

/**
 * Allocates an `n x n` complex identity matrix.
 *
 * @param {number} n
 * @returns {Complex[][]}
 */
function createIdentityMatrix(n) {
	const out = createZeroMatrix(n, n)
	for (let i = 0; i < n; i++) {
		out[i][i].re = 1
	}
	return out
}

/**
 * Cache-oblivious recursive divide-and-conquer complex matrix multiply-accumulate:
 * `C[rC..rC+m-1][cC..cC+p-1] += sign * A[rA..rA+m-1][cA..cA+k-1] * B[rB..rB+k-1][cB..cB+p-1]`.
 *
 * Splits along the largest of `(m, k, p)` until reaching the `1 x 1` scalar base case.
 *
 * @param {Complex[][]} A
 * @param {number} rA
 * @param {number} cA
 * @param {Complex[][]} B
 * @param {number} rB
 * @param {number} cB
 * @param {Complex[][]} C
 * @param {number} rC
 * @param {number} cC
 * @param {number} m
 * @param {number} k
 * @param {number} p
 * @param {1 | -1} sign
 */
function matMulAddRecursive(A, rA, cA, B, rB, cB, C, rC, cC, m, k, p, sign) {
	if (m === 0 || k === 0 || p === 0) {
		return
	}
	if (m === 1 && k === 1 && p === 1) {
		const a = A[rA][cA]
		const b = B[rB][cB]
		const c = C[rC][cC]
		const prodRe = a.re * b.re - a.im * b.im
		const prodIm = a.re * b.im + a.im * b.re
		c.re += sign * prodRe
		c.im += sign * prodIm
		return
	}
	if (m >= k && m >= p) {
		const m1 = m >> 1
		const m2 = m - m1
		matMulAddRecursive(A, rA, cA, B, rB, cB, C, rC, cC, m1, k, p, sign)
		matMulAddRecursive(A, rA + m1, cA, B, rB, cB, C, rC + m1, cC, m2, k, p, sign)
	} else if (p >= m && p >= k) {
		const p1 = p >> 1
		const p2 = p - p1
		matMulAddRecursive(A, rA, cA, B, rB, cB, C, rC, cC, m, k, p1, sign)
		matMulAddRecursive(A, rA, cA, B, rB, cB + p1, C, rC, cC + p1, m, k, p2, sign)
	} else {
		const k1 = k >> 1
		const k2 = k - k1
		matMulAddRecursive(A, rA, cA, B, rB, cB, C, rC, cC, m, k1, p, sign)
		matMulAddRecursive(A, rA, cA + k1, B, rB + k1, cB, C, rC, cC, m, k2, p, sign)
	}
}

/**
 * Recursive divide-and-conquer solve of `L * X = B` in-place (overwriting `B`),
 * where `L` is the `size x size` unit lower triangular block stored in the strict
 * lower triangle of `M` at `(rL, cL)`.
 *
 * @param {Complex[][]} M
 * @param {number} rL
 * @param {number} cL
 * @param {number} rB
 * @param {number} cB
 * @param {number} size
 * @param {number} cols
 */
function solveUnitLowerRecursive(M, rL, cL, rB, cB, size, cols) {
	if (size <= 1 || cols === 0) {
		return
	}
	const k1 = size >> 1
	const k2 = size - k1

	// Solve L11 * X1 = B1
	solveUnitLowerRecursive(M, rL, cL, rB, cB, k1, cols)

	// Update B2 <- B2 - L21 * X1
	matMulAddRecursive(M, rL + k1, cL, M, rB, cB, M, rB + k1, cB, k2, k1, cols, -1)

	// Solve L22 * X2 = B2
	solveUnitLowerRecursive(M, rL + k1, cL + k1, rB + k1, cB, k2, cols)
}

/**
 * Toledo's recursive divide-and-conquer LU factorization with partial pivoting.
 *
 * Factors the `(n - offset) x width` panel of `M` starting at `(offset, offset)`
 * in-place, storing `L` (unit diagonal implicit) in the strict lower triangle
 * and `U` in the upper triangle (including diagonal), while recording row
 * permutations in `perm`.
 *
 * @param {Complex[][]} M
 * @param {number[]} perm
 * @param {number} offset
 * @param {number} width
 * @param {number} tol
 */
function luFactorRecursive(M, perm, offset, width, tol) {
	const n = M.length
	if (width === 1) {
		let pivotRow = offset
		let pivotAbs = cAbs(M[offset][offset])
		for (let i = offset + 1; i < n; i++) {
			const mag = cAbs(M[i][offset])
			if (mag > pivotAbs) {
				pivotAbs = mag
				pivotRow = i
			}
		}

		if (pivotAbs === 0 || pivotAbs <= tol || !Number.isFinite(pivotAbs)) {
			throw new RangeError('Matrix is singular or numerically singular')
		}

		if (pivotRow !== offset) {
			const tmpRow = M[offset]
			M[offset] = M[pivotRow]
			M[pivotRow] = tmpRow

			const tmpPerm = perm[offset]
			perm[offset] = perm[pivotRow]
			perm[pivotRow] = tmpPerm
		}

		const pivot = M[offset][offset]
		for (let i = offset + 1; i < n; i++) {
			M[i][offset] = cDiv(M[i][offset], pivot)
		}
		return
	}

	const k1 = width >> 1
	const k2 = width - k1

	// 1. Recursively factor the left half of the panel
	luFactorRecursive(M, perm, offset, k1, tol)

	// 2. Solve L11 * U12 = A12 in-place
	solveUnitLowerRecursive(M, offset, offset, offset, offset + k1, k1, k2)

	// 3. Schur complement update: A22 <- A22 - L21 * U12
	const remRows = n - offset - k1
	matMulAddRecursive(
		M,
		offset + k1,
		offset,
		M,
		offset,
		offset + k1,
		M,
		offset + k1,
		offset + k1,
		remRows,
		k1,
		k2,
		-1,
	)

	// 4. Recursively factor the right half Schur complement
	luFactorRecursive(M, perm, offset + k1, k2, tol)
}

/**
 * Recursive divide-and-conquer inversion of a unit lower triangular matrix `L`
 * stored in the strict lower triangle of `M`:
 *
 *   [ L11   0 ]^-1   [         L11^-1          0    ]
 *   [ L21 L22 ]    = [ -L22^-1 * L21 * L11^-1 L22^-1 ]
 *
 * @param {Complex[][]} M
 * @param {Complex[][]} Linv
 * @param {number} offset
 * @param {number} size
 */
function invertUnitLowerRecursive(M, Linv, offset, size) {
	if (size <= 1) {
		return
	}
	const k1 = size >> 1
	const k2 = size - k1

	invertUnitLowerRecursive(M, Linv, offset, k1)
	invertUnitLowerRecursive(M, Linv, offset + k1, k2)

	// T = L21 * L11^-1  (k2 x k1)
	const T = createZeroMatrix(k2, k1)
	matMulAddRecursive(M, offset + k1, offset, Linv, offset, offset, T, 0, 0, k2, k1, k1, 1)

	// Linv21 = -L22^-1 * T  (k2 x k1)
	matMulAddRecursive(
		Linv,
		offset + k1,
		offset + k1,
		T,
		0,
		0,
		Linv,
		offset + k1,
		offset,
		k2,
		k2,
		k1,
		-1,
	)
}

/**
 * Recursive divide-and-conquer inversion of an upper triangular matrix `U`
 * stored in the upper triangle (including diagonal) of `M`:
 *
 *   [ U11 U12 ]^-1   [ U11^-1  -U11^-1 * U12 * U22^-1 ]
 *   [  0  U22 ]    = [   0             U22^-1          ]
 *
 * @param {Complex[][]} M
 * @param {Complex[][]} Uinv
 * @param {number} offset
 * @param {number} size
 */
function invertUpperRecursive(M, Uinv, offset, size) {
	if (size === 1) {
		Uinv[offset][offset] = cDiv({ re: 1, im: 0 }, M[offset][offset])
		return
	}
	const k1 = size >> 1
	const k2 = size - k1

	invertUpperRecursive(M, Uinv, offset, k1)
	invertUpperRecursive(M, Uinv, offset + k1, k2)

	// T = U11^-1 * U12  (k1 x k2)
	const T = createZeroMatrix(k1, k2)
	matMulAddRecursive(Uinv, offset, offset, M, offset, offset + k1, T, 0, 0, k1, k1, k2, 1)

	// Uinv12 = -T * U22^-1  (k1 x k2)
	matMulAddRecursive(
		T,
		0,
		0,
		Uinv,
		offset + k1,
		offset + k1,
		Uinv,
		offset,
		offset + k1,
		k1,
		k2,
		k2,
		-1,
	)
}

/**
 * Validates and clones a square matrix of complex numbers `{ re, im }`.
 *
 * @param {unknown} matrix
 * @returns {{ copy: Complex[][], maxAbs: number }}
 */
function validateAndClone(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Input must be a 2D array of complex numbers')
	}
	const n = matrix.length
	if (n === 0) {
		throw new RangeError('Matrix must be non-empty')
	}

	const copy = new Array(n)
	let maxAbs = 0

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`Matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`,
			)
		}

		const copyRow = new Array(n)
		for (let j = 0; j < n; j++) {
			const entry = row[j]
			if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
				throw new TypeError(`Entry [${i}][${j}] must be an object with numeric { re, im } properties`)
			}
			const { re, im } = entry
			if (typeof re !== 'number' || typeof im !== 'number') {
				throw new TypeError(`Entry [${i}][${j}] must have numeric re and im properties`)
			}
			if (!Number.isFinite(re) || !Number.isFinite(im)) {
				throw new RangeError(`Entry [${i}][${j}] must have finite re and im values`)
			}

			const mag = Math.hypot(re, im)
			if (mag > maxAbs) {
				maxAbs = mag
			}
			copyRow[j] = { re: cleanZero(re), im: cleanZero(im) }
		}
		copy[i] = copyRow
	}

	return { copy, maxAbs }
}

/**
 * Computes the inverse `A^-1` of an `n x n` complex matrix `A` using a
 * recursive divide-and-conquer algorithm over complex numbers `{ re, im }`.
 *
 * Algorithm:
 * 1. **Toledo's recursive LU factorization with partial pivoting** computes
 *    `P * A = L * U` by recursively splitting column panels in half, solving
 *    `L11 * U12 = A12` via recursive triangular substitution, and updating
 *    the Schur complement `A22 - L21 * U12` via recursive divide-and-conquer
 *    block multiplication. Partial pivoting ensures stability and handles
 *    arbitrary nonsingular matrices, including those with zero leading
 *    principal minors (such as permutation matrices).
 * 2. **Recursive block triangular inversion** computes `L^-1` and `U^-1` by
 *    recursively bisecting each triangular factor into `2 x 2` block form.
 * 3. **Recursive block matrix multiplication** computes `B = U^-1 * L^-1`,
 *    and column permutation recovers `A^-1 = B * P`.
 *
 * Conventions:
 * - Complex numbers are plain objects `{ re, im }` with finite IEEE-754 numbers.
 * - Input matrices are never mutated; output entries normalize `-0` to `0`.
 * - Complex division uses Smith's algorithm and magnitudes use `Math.hypot`
 *   to avoid spurious overflow/underflow.
 *
 * @param {Complex[][]} matrix - Non-empty `n x n` matrix of `{ re, im }` entries.
 * @returns {Complex[][]} The `n x n` inverse matrix `A^-1` of `{ re, im }` entries.
 * @throws {TypeError} If `matrix` is not a 2D array or any entry is not `{ re: number, im: number }`.
 * @throws {RangeError} If `matrix` is empty, non-square, contains non-finite values,
 *   is singular (or numerically singular), or overflows finite floating-point range.
 */
export function inverseComplexRecursive(matrix) {
	const { copy: M, maxAbs } = validateAndClone(matrix)
	const n = M.length

	if (maxAbs === 0) {
		throw new RangeError('Matrix is singular (all entries are zero)')
	}

	// Scale-invariant singularity tolerance relative to matrix entry magnitude
	const tol = n * Number.EPSILON * maxAbs * 16

	const perm = new Array(n)
	for (let i = 0; i < n; i++) {
		perm[i] = i
	}

	// 1. Recursive LU factorization with partial pivoting: P * A = L * U
	luFactorRecursive(M, perm, 0, n, tol)

	// 2. Recursive triangular inversions of L and U
	const Linv = createIdentityMatrix(n)
	invertUnitLowerRecursive(M, Linv, 0, n)

	const Uinv = createZeroMatrix(n, n)
	invertUpperRecursive(M, Uinv, 0, n)

	// 3. Recursive matrix multiplication: B = U^-1 * L^-1
	const B = createZeroMatrix(n, n)
	matMulAddRecursive(Uinv, 0, 0, Linv, 0, 0, B, 0, 0, n, n, n, 1)

	// 4. Apply column permutation: A^-1 = B * P  (column k of B -> column perm[k])
	const result = new Array(n)
	for (let i = 0; i < n; i++) {
		const outRow = new Array(n)
		for (let k = 0; k < n; k++) {
			const val = B[i][k]
			if (!Number.isFinite(val.re) || !Number.isFinite(val.im)) {
				throw new RangeError('Matrix inverse overflowed finite floating-point range')
			}
			outRow[perm[k]] = {
				re: cleanZero(val.re),
				im: cleanZero(val.im),
			}
		}
		result[i] = outRow
	}

	return result
}
