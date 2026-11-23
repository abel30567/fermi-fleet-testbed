/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Tangent (first-order derivative) component.
 */

/**
 * @typedef {Object} InverseDualSeriesOptions
 * @property {number} [tolerance=1e-12] - Relative pivot tolerance for singularity detection
 *   (scaled by the maximum absolute primal entry). Must be a non-negative finite number.
 */

/**
 * Normalizes negative zero (-0) to positive zero (+0).
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validates that the input is a non-empty square matrix of finite dual numbers { v, d },
 * and extracts the primal matrix A and derivative matrix B.
 *
 * @param {DualNumber[][]} matrix
 * @returns {{ n: number, A: number[][], B: number[][], maxAbsA: number }}
 */
function parseAndValidateMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of dual numbers { v, d }')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	const A = new Array(n)
	const B = new Array(n)
	let maxAbsA = 0

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(`matrix must be square (expected row ${i} length ${n}, got ${row.length})`)
		}

		const aRow = new Array(n)
		const bRow = new Array(n)

		for (let j = 0; j < n; j++) {
			const cell = row[j]
			if (cell === null || typeof cell !== 'object' || Array.isArray(cell)) {
				throw new TypeError(`matrix[${i}][${j}] must be a dual number object { v, d }`)
			}
			const { v, d } = cell
			if (typeof v !== 'number' || !Number.isFinite(v)) {
				throw new TypeError(`matrix[${i}][${j}].v must be a finite number`)
			}
			if (typeof d !== 'number' || !Number.isFinite(d)) {
				throw new TypeError(`matrix[${i}][${j}].d must be a finite number`)
			}

			aRow[j] = v
			bRow[j] = d
			const absV = Math.abs(v)
			if (absV > maxAbsA) {
				maxAbsA = absV
			}
		}

		A[i] = aRow
		B[i] = bRow
	}

	return { n, A, B, maxAbsA }
}

/**
 * Validates the optional configuration object.
 *
 * @param {InverseDualSeriesOptions} options
 * @returns {number}
 */
function parseTolerance(options) {
	if (options === undefined) {
		return 1e-12
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be an object')
	}
	if (options.tolerance === undefined) {
		return 1e-12
	}
	const { tolerance } = options
	if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError('options.tolerance must be a non-negative finite number')
	}
	return tolerance
}

/**
 * Computes the inverse of a real n x n matrix A via LU factorization with partial pivoting.
 *
 * @param {number[][]} A
 * @param {number} n
 * @param {number} pivotThreshold
 * @returns {number[][]}
 */
function invertRealMatrix(A, n, pivotThreshold) {
	if (n === 1) {
		const a00 = A[0][0]
		if (Math.abs(a00) <= pivotThreshold) {
			throw new RangeError('matrix primal part is singular or nearly singular')
		}
		const inv = 1 / a00
		if (!Number.isFinite(inv)) {
			throw new RangeError('matrix inverse overflowed finite floating-point range')
		}
		return [[inv]]
	}

	// Copy A into working LU matrix and initialize permutation vector
	const lu = new Array(n)
	const perm = new Int32Array(n)
	for (let i = 0; i < n; i++) {
		lu[i] = A[i].slice()
		perm[i] = i
	}

	// Doolittle LU factorization with partial pivoting: P * A = L * U
	for (let k = 0; k < n; k++) {
		let pivotRow = k
		let pivotAbs = Math.abs(lu[k][k])
		for (let i = k + 1; i < n; i++) {
			const candidate = Math.abs(lu[i][k])
			if (candidate > pivotAbs) {
				pivotAbs = candidate
				pivotRow = i
			}
		}

		if (pivotAbs <= pivotThreshold) {
			throw new RangeError('matrix primal part is singular or nearly singular')
		}

		if (pivotRow !== k) {
			const tmpRow = lu[k]
			lu[k] = lu[pivotRow]
			lu[pivotRow] = tmpRow

			const tmpPerm = perm[k]
			perm[k] = perm[pivotRow]
			perm[pivotRow] = tmpPerm
		}

		const pivotVal = lu[k][k]
		const rowK = lu[k]
		for (let i = k + 1; i < n; i++) {
			const rowI = lu[i]
			const factor = rowI[k] / pivotVal
			rowI[k] = factor
			for (let j = k + 1; j < n; j++) {
				rowI[j] -= factor * rowK[j]
			}
		}
	}

	// Allocate inverse matrix X
	const X = new Array(n)
	for (let i = 0; i < n; i++) {
		X[i] = new Array(n)
	}

	// Solve L * U * x_col = P * e_col for each column col = 0..n-1
	const y = new Float64Array(n)
	for (let col = 0; col < n; col++) {
		// Forward substitution: L * y = P * e_col
		for (let i = 0; i < n; i++) {
			let sum = perm[i] === col ? 1 : 0
			const rowI = lu[i]
			for (let j = 0; j < i; j++) {
				sum -= rowI[j] * y[j]
			}
			y[i] = sum
		}

		// Back substitution: U * x = y
		for (let i = n - 1; i >= 0; i--) {
			let sum = y[i]
			const rowI = lu[i]
			for (let j = i + 1; j < n; j++) {
				sum -= rowI[j] * X[j][col]
			}
			const val = sum / rowI[i]
			if (!Number.isFinite(val)) {
				throw new RangeError('matrix inverse overflowed finite floating-point range')
			}
			X[i][col] = val
		}
	}

	return X
}

/**
 * Multiplies two n x n real matrices.
 *
 * @param {number[][]} M1
 * @param {number[][]} M2
 * @param {number} n
 * @returns {number[][]}
 */
function multiplyRealMatrices(M1, M2, n) {
	const out = new Array(n)
	for (let i = 0; i < n; i++) {
		const rowOut = new Array(n).fill(0)
		const row1 = M1[i]
		for (let k = 0; k < n; k++) {
			const aik = row1[k]
			if (aik === 0) continue
			const row2 = M2[k]
			for (let j = 0; j < n; j++) {
				rowOut[j] += aik * row2[j]
			}
		}
		out[i] = rowOut
	}
	return out
}

/**
 * Computes the inverse of a square matrix of dual numbers `{ v, d }` carrying
 * a forward-mode derivative alongside the value.
 *
 * Treating a dual matrix as `M = A + εB` with `ε² = 0`, factoring out `A` gives
 * `M⁻¹ = (I + ε A⁻¹ B)⁻¹ A⁻¹`. Expanding via the Neumann series
 * `(I + Z)⁻¹ = Σ_{k=0}^∞ (-1)^k Z^k` for `Z = ε A⁻¹ B`, all terms with `k ≥ 2`
 * vanish identically because `ε² = 0`, yielding the exact closed-form identity:
 *
 *   `M⁻¹ = A⁻¹ - ε (A⁻¹ B A⁻¹)`
 *
 * The primal inverse `A⁻¹` is computed via LU decomposition with partial pivoting.
 * The input matrix is not mutated.
 *
 * @param {DualNumber[][]} matrix - Non-empty square 2D array of dual numbers `{ v, d }`.
 * @param {InverseDualSeriesOptions} [options] - Optional configuration.
 * @returns {DualNumber[][]} Square 2D array of dual numbers representing `matrix⁻¹`.
 * @throws {TypeError} If `matrix` is not a 2D array of `{ v, d }` objects with finite numbers,
 *   or if `options` is not an object.
 * @throws {RangeError} If `matrix` is empty, non-square, singular/nearly singular,
 *   if `options.tolerance` is invalid, or if the inverse overflows finite numbers.
 */
export function inverseDualSeries(matrix, options) {
	const tolerance = parseTolerance(options)
	const { n, A, B, maxAbsA } = parseAndValidateMatrix(matrix)

	if (maxAbsA === 0) {
		throw new RangeError('matrix primal part is singular or nearly singular')
	}

	const pivotThreshold = tolerance * maxAbsA
	const X = invertRealMatrix(A, n, pivotThreshold)

	// Dual part from exact truncated Neumann series: Y = -A⁻¹ * B * A⁻¹ = -(X * B) * X
	const XB = multiplyRealMatrices(X, B, n)
	const XBX = multiplyRealMatrices(XB, X, n)

	const result = new Array(n)
	for (let i = 0; i < n; i++) {
		const row = new Array(n)
		for (let j = 0; j < n; j++) {
			const v = X[i][j]
			const d = -XBX[i][j]
			if (!Number.isFinite(v) || !Number.isFinite(d)) {
				throw new RangeError('matrix inverse overflowed finite floating-point range')
			}
			row[j] = {
				v: normalizeZero(v),
				d: normalizeZero(d),
			}
		}
		result[i] = row
	}

	return result
}
