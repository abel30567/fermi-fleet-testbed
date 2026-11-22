/**
 * @typedef {{ re: number, im: number }} Complex
 * A complex number with finite real (`re`) and imaginary (`im`) IEEE-754 components.
 */

/**
 * Normalizes IEEE-754 negative zero (`-0`) to `+0`.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates a single complex object `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 * @throws {TypeError} If `value` is not a plain-like object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex object { re, im }`)
	}
	const { re, im } = /** @type {{ re?: unknown, im?: unknown }} */ (value)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label} must have numeric re and im properties`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label} must have finite re and im values`)
	}
	return { re, im }
}

/**
 * Validates and extracts a 1D complex vector or 2D rectangular complex matrix
 * into contiguous real/imaginary Float64Array buffers along with shape metadata.
 *
 * @param {unknown} input
 * @param {string} name
 * @returns {{
 *   rank: 1 | 2,
 *   rows: number,
 *   cols: number,
 *   re: Float64Array,
 *   im: Float64Array,
 *   gaussSafe: boolean,
 *   maxAbsSum: number
 * }}
 */
function parseComplexTensor(input, name) {
	if (!Array.isArray(input)) {
		throw new TypeError(`${name} must be an Array of complex objects or a 2D matrix of complex objects`)
	}
	if (input.length === 0) {
		throw new RangeError(`${name} must not be empty`)
	}

	const isMatrix = Array.isArray(input[0])
	let rows
	let cols

	if (isMatrix) {
		rows = input.length
		cols = input[0].length
		if (cols === 0) {
			throw new RangeError(`${name}[0] must not be an empty row`)
		}
		for (let i = 1; i < rows; i++) {
			const row = input[i]
			if (!Array.isArray(row)) {
				throw new TypeError(`${name}[${i}] must be an Array (2D matrix row)`)
			}
			if (row.length === 0) {
				throw new RangeError(`${name}[${i}] must not be an empty row`)
			}
			if (row.length !== cols) {
				throw new RangeError(`${name} must be a rectangular 2D matrix (row ${i} length ${row.length} !== ${cols})`)
			}
		}
	} else {
		rows = input.length
		cols = 1
	}

	const total = rows * cols
	const re = new Float64Array(total)
	const im = new Float64Array(total)
	let gaussSafe = true
	let maxAbsSum = 0

	if (isMatrix) {
		let idx = 0
		for (let i = 0; i < rows; i++) {
			const row = input[i]
			for (let j = 0; j < cols; j++) {
				const z = validateComplex(row[j], `${name}[${i}][${j}]`)
				re[idx] = z.re
				im[idx] = z.im
				const absR = Math.abs(z.re)
				const absI = Math.abs(z.im)
				const sumAbs = absR + absI
				if (!Number.isFinite(sumAbs)) {
					gaussSafe = false
				} else if (sumAbs > maxAbsSum) {
					maxAbsSum = sumAbs
				}
				if (absR > 0 && absI > 0 && Math.max(absR, absI) > 16 * Math.min(absR, absI)) {
					gaussSafe = false
				}
				idx++
			}
		}
	} else {
		for (let i = 0; i < rows; i++) {
			const z = validateComplex(input[i], `${name}[${i}]`)
			re[i] = z.re
			im[i] = z.im
			const absR = Math.abs(z.re)
			const absI = Math.abs(z.im)
			const sumAbs = absR + absI
			if (!Number.isFinite(sumAbs)) {
				gaussSafe = false
			} else if (sumAbs > maxAbsSum) {
				maxAbsSum = sumAbs
			}
			if (absR > 0 && absI > 0 && Math.max(absR, absI) > 16 * Math.min(absR, absI)) {
				gaussSafe = false
			}
		}
	}

	return {
		rank: isMatrix ? 2 : 1,
		rows,
		cols,
		re,
		im,
		gaussSafe,
		maxAbsSum
	}
}

/**
 * Computes the real Kronecker product of two row-major real matrices
 * X (m x n) and Y (p x q), returning a row-major Float64Array of shape (m*p) x (n*q).
 *
 * Uses the algebraic Kronecker block expansion:
 *   X ⊗ Y = sum_{i,j} X_{i,j} (E_{i,j} ⊗ Y)
 *
 * @param {Float64Array} x
 * @param {number} m
 * @param {number} n
 * @param {Float64Array} y
 * @param {number} p
 * @param {number} q
 * @returns {Float64Array}
 */
function realKronecker(x, m, n, y, p, q) {
	const outRows = m * p
	const outCols = n * q
	const out = new Float64Array(outRows * outCols)

	for (let i = 0; i < m; i++) {
		const xRowOffset = i * n
		const outBlockRow = i * p
		for (let j = 0; j < n; j++) {
			const xij = x[xRowOffset + j]
			const outColOffset = j * q
			if (xij === 0) {
				continue
			}
			for (let k = 0; k < p; k++) {
				const yRowOffset = k * q
				const outRowStart = (outBlockRow + k) * outCols + outColOffset
				for (let l = 0; l < q; l++) {
					out[outRowStart + l] = xij * y[yRowOffset + l]
				}
			}
		}
	}

	return out
}

/**
 * Computes the tensor (outer / Kronecker) product `a ⊗ b` over complex numbers
 * represented as `{ re, im }` objects.
 *
 * Supported input shapes (both arguments must have the same rank):
 * - **1D complex vectors**: `a` of length `m` and `b` of length `n` produce the
 *   `m × n` outer / tensor product matrix where `result[i][j] = a[i] * b[j]`
 *   (equivalent to the Kronecker product of an `m × 1` column vector and a `1 × n` row vector).
 * - **2D complex matrices**: `a` of shape `m × n` and `b` of shape `p × q` produce
 *   the `(m * p) × (n * q)` Kronecker product matrix where
 *   `result[i * p + k][j * q + l] = a[i][j] * b[k][l]`.
 *
 * Algorithm & Algebraic Identities:
 * Decomposes `A = A_R + i A_I` and `B = B_R + i B_I` into real and imaginary parts
 * and applies bilinearity of the tensor product over ℝ:
 *
 * 1. **Gauss 3-multiplication bilinear Kronecker identity** (primary fast path when
 *    real/imaginary components are well-scaled and free of overflow):
 *    - `P1 = A_R ⊗ B_R`
 *    - `P2 = A_I ⊗ B_I`
 *    - `P3 = (A_R + A_I) ⊗ (B_R + B_I)`
 *    - `Re(A ⊗ B) = P1 - P2`
 *    - `Im(A ⊗ B) = P3 - P1 - P2`
 *    reducing 4 real Kronecker products to 3.
 * 2. **4-term bilinear Kronecker identity** (automatic precision-preserving fallback
 *    when components exhibit extreme dynamic range or near-overflow):
 *    - `Re(A ⊗ B) = (A_R ⊗ B_R) - (A_I ⊗ B_I)`
 *    - `Im(A ⊗ B) = (A_R ⊗ B_I) + (A_I ⊗ B_R)`
 *
 * Each real Kronecker product is evaluated via the algebraic block series
 * `X ⊗ Y = Σ_{i,j} X_{i,j} (E_{i,j} ⊗ Y)`.
 *
 * @param {Complex[] | Complex[][]} a - Non-empty 1D complex vector or rectangular 2D complex matrix.
 * @param {Complex[] | Complex[][]} b - Non-empty 1D complex vector or rectangular 2D complex matrix (matching rank of `a`).
 * @returns {Complex[][]} Newly allocated complex matrix representing `a ⊗ b`.
 * @throws {TypeError} If `a` or `b` is not an array, if their ranks differ (1D vs 2D),
 *   if a 2D matrix contains non-array rows, or if any element lacks numeric `re`/`im` properties.
 * @throws {RangeError} If `a` or `b` is empty, if a 2D matrix has empty or ragged rows,
 *   or if any complex component is non-finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function tensorProductComplexSeries(a, b) {
	const left = parseComplexTensor(a, 'a')
	const right = parseComplexTensor(b, 'b')

	if (left.rank !== right.rank) {
		throw new TypeError(
			`Rank mismatch: a is ${left.rank}D while b is ${right.rank}D (both must be 1D vectors or both 2D matrices)`
		)
	}

	// For 1D vectors a (length m) and b (length n), interpret as (m x 1) ⊗ (1 x n) -> (m x n).
	const m = left.rows
	const n = left.rank === 1 ? 1 : left.cols
	const p = right.rank === 1 ? 1 : right.rows
	const q = right.rank === 1 ? right.rows : right.cols

	const outRows = m * p
	const outCols = n * q
	const outSize = outRows * outCols

	const canUseGauss =
		left.gaussSafe &&
		right.gaussSafe &&
		Number.isFinite(left.maxAbsSum * right.maxAbsSum) &&
		left.maxAbsSum * right.maxAbsSum <= Number.MAX_VALUE / 4

	let outRe
	let outIm

	if (canUseGauss) {
		const aSum = new Float64Array(left.re.length)
		for (let i = 0; i < left.re.length; i++) {
			aSum[i] = left.re[i] + left.im[i]
		}
		const bSum = new Float64Array(right.re.length)
		for (let i = 0; i < right.re.length; i++) {
			bSum[i] = right.re[i] + right.im[i]
		}

		const p1 = realKronecker(left.re, m, n, right.re, p, q)
		const p2 = realKronecker(left.im, m, n, right.im, p, q)
		const p3 = realKronecker(aSum, m, n, bSum, p, q)

		outRe = new Float64Array(outSize)
		outIm = new Float64Array(outSize)
		for (let i = 0; i < outSize; i++) {
			outRe[i] = p1[i] - p2[i]
			outIm[i] = p3[i] - p1[i] - p2[i]
		}
	} else {
		const rr = realKronecker(left.re, m, n, right.re, p, q)
		const ii = realKronecker(left.im, m, n, right.im, p, q)
		const ri = realKronecker(left.re, m, n, right.im, p, q)
		const ir = realKronecker(left.im, m, n, right.re, p, q)

		outRe = new Float64Array(outSize)
		outIm = new Float64Array(outSize)
		for (let i = 0; i < outSize; i++) {
			outRe[i] = rr[i] - ii[i]
			outIm[i] = ri[i] + ir[i]
		}
	}

	/** @type {Complex[][]} */
	const result = new Array(outRows)
	for (let r = 0; r < outRows; r++) {
		const row = new Array(outCols)
		const rowOffset = r * outCols
		for (let c = 0; c < outCols; c++) {
			row[c] = {
				re: normalizeZero(outRe[rowOffset + c]),
				im: normalizeZero(outIm[rowOffset + c])
			}
		}
		result[r] = row
	}

	return result
}
