/**
 * Exact rational matrix multiplication over Q using exact BigInt arithmetic.
 *
 * Each rational is represented as `{ num: bigint, den: bigint }` in canonical
 * lowest terms: `den > 0n`, `gcd(|num|, den) === 1n`, and zero is
 * `{ num: 0n, den: 1n }`.
 *
 * @module ops/matrix/matMulRationalSeries
 */

/**
 * Compute the greatest common divisor of two non-negative BigInts using
 * the Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Compute the least common multiple of two positive BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function lcm(a, b) {
	return (a / gcd(a, b)) * b
}

/**
 * Reduce a rational `num / den` (with `den !== 0n`) to canonical lowest terms:
 * `den > 0n`, `gcd(|num|, den) === 1n`, and `0` as `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validate a single rational object and return its canonical reduced form.
 *
 * @param {unknown} q
 * @param {string} label
 * @returns {{ num: bigint, den: bigint }}
 * @throws {TypeError} If `q` is not an object with BigInt `num` and `den`.
 * @throws {RangeError} If `q.den === 0n`.
 */
function validateRational(q, label) {
	if (typeof q !== 'object' || q === null) {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`)
	}
	if (typeof q.num !== 'bigint' || typeof q.den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt num and den properties`)
	}
	if (q.den === 0n) {
		throw new RangeError(`${label} has zero denominator`)
	}
	return normalizeRational(q.num, q.den)
}

/**
 * Validate a 2D matrix of rationals and return a normalized copy with its
 * dimensions `(rows, cols)`.
 *
 * @param {unknown} matrix
 * @param {string} name
 * @returns {{ rows: number, cols: number, data: Array<Array<{ num: bigint, den: bigint }>> }}
 * @throws {TypeError} If `matrix` or any row is not an Array, or any entry is not a valid rational object.
 * @throws {RangeError} If `matrix` is empty, has empty rows, is non-rectangular, or contains a zero denominator.
 */
function validateMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of rational objects`)
	}
	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError(`${name} must be a non-empty matrix`)
	}

	let cols = -1
	const data = new Array(rows)

	for (let i = 0; i < rows; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${i}] must be an array`)
		}
		if (row.length === 0) {
			throw new RangeError(`${name}[${i}] must be non-empty`)
		}
		if (cols === -1) {
			cols = row.length
		} else if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular: row ${i} has length ${row.length}, expected ${cols}`
			)
		}

		const normRow = new Array(cols)
		for (let j = 0; j < cols; j++) {
			normRow[j] = validateRational(row[j], `${name}[${i}][${j}]`)
		}
		data[i] = normRow
	}

	return { rows, cols, data }
}

/**
 * Compute exact rational matrix multiplication `A * B` for an `m × k` matrix `A`
 * and a `k × n` matrix `B`, returning an `m × n` matrix of exact rationals
 * `{ num: bigint, den: bigint }` in canonical lowest terms (`den > 0n`,
 * `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 *
 * Algorithm:
 * Uses the exact bilinear summation identity with row/column LCM denominator
 * clearing:
 * - For each row `i` of `A`, let `L_i = lcm_{p=0..k-1} den(A[i][p])` and
 *   `a_{i,p} = num(A[i][p]) * (L_i / den(A[i][p]))`, so `A[i][p] = a_{i,p} / L_i`.
 * - For each column `j` of `B`, let `R_j = lcm_{p=0..k-1} den(B[p][j])` and
 *   `b_{p,j} = num(B[p][j]) * (R_j / den(B[p][j]))`, so `B[p][j] = b_{p,j} / R_j`.
 * - Then `(A * B)[i][j] = (sum_{p=0}^{k-1} a_{i,p} * b_{p,j}) / (L_i * R_j)`,
 *   reduced once to canonical lowest terms via Euclidean GCD.
 *
 * @param {Array<Array<{ num: bigint, den: bigint }>>} A - Non-empty rectangular `m × k` rational matrix.
 * @param {Array<Array<{ num: bigint, den: bigint }>>} B - Non-empty rectangular `k × n` rational matrix.
 * @returns {Array<Array<{ num: bigint, den: bigint }>>} Exact `m × n` product matrix in lowest terms.
 * @throws {TypeError} If `A` or `B` is not a 2D array of rational objects with BigInt `num` and `den`.
 * @throws {RangeError} If `A` or `B` is empty, has empty rows, is non-rectangular, contains a zero denominator, or has mismatched inner dimensions (`A[0].length !== B.length`).
 */
export function matMulRationalSeries(A, B) {
	const matA = validateMatrix(A, 'A')
	const matB = validateMatrix(B, 'B')

	const m = matA.rows
	const k = matA.cols
	const n = matB.cols

	if (k !== matB.rows) {
		throw new RangeError(
			`Inner dimensions must match: A is ${m}x${k} and B is ${matB.rows}x${n}`
		)
	}

	// Clear denominators per row of A: A[i][p] = scaledRowsA[i][p] / rowLcmsA[i]
	const rowLcmsA = new Array(m)
	const scaledRowsA = new Array(m)
	for (let i = 0; i < m; i++) {
		let rowLcm = 1n
		const row = matA.data[i]
		for (let p = 0; p < k; p++) {
			rowLcm = lcm(rowLcm, row[p].den)
		}
		rowLcmsA[i] = rowLcm
		const scaled = new Array(k)
		for (let p = 0; p < k; p++) {
			scaled[p] = row[p].num * (rowLcm / row[p].den)
		}
		scaledRowsA[i] = scaled
	}

	// Clear denominators per column of B: B[p][j] = scaledColsB[j][p] / colLcmsB[j]
	const colLcmsB = new Array(n)
	const scaledColsB = new Array(n)
	for (let j = 0; j < n; j++) {
		let colLcm = 1n
		for (let p = 0; p < k; p++) {
			colLcm = lcm(colLcm, matB.data[p][j].den)
		}
		colLcmsB[j] = colLcm
		const scaled = new Array(k)
		for (let p = 0; p < k; p++) {
			const entry = matB.data[p][j]
			scaled[p] = entry.num * (colLcm / entry.den)
		}
		scaledColsB[j] = scaled
	}

	// Compute exact dot products and reduce each output entry to lowest terms
	const result = new Array(m)
	for (let i = 0; i < m; i++) {
		const rowOut = new Array(n)
		const aRow = scaledRowsA[i]
		const aDen = rowLcmsA[i]
		for (let j = 0; j < n; j++) {
			const bCol = scaledColsB[j]
			let sum = 0n
			for (let p = 0; p < k; p++) {
				sum += aRow[p] * bCol[p]
			}
			rowOut[j] = normalizeRational(sum, aDen * colLcmsB[j])
		}
		result[i] = rowOut
	}

	return result
}
