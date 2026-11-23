/**
 * Exact rational matrix multiplication via the inner-product series
 * C[i][j] = sum_{p=0}^{k-1} A[i][p] * B[p][j] over Q, with every entry
 * represented and returned in lowest terms as `{ num: BigInt, den: BigInt }`
 * where `den > 0n` and `gcd(|num|, den) === 1n`.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the absolute value of a BigInt.
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x
}

/**
 * Computes the non-negative greatest common divisor of two BigInts
 * using the Euclidean algorithm.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validates and normalizes a rational number `{ num: bigint, den: bigint }`
 * into canonical lowest terms with `den > 0n` and `gcd(|num|, den) === 1n`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function normalizeRational(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be an object with BigInt num and den properties`)
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} has zero denominator`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validates a 2D matrix of rationals and returns a normalized copy along with its dimensions.
 *
 * @param {unknown} matrix
 * @param {string} name
 * @returns {{ rows: number, cols: number, data: Rational[][] }}
 */
function validateAndNormalizeMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of rationals`)
	}
	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError(`${name} must not be empty`)
	}
	if (!Array.isArray(matrix[0])) {
		throw new TypeError(`${name}[0] must be an array`)
	}
	const cols = matrix[0].length
	if (cols === 0) {
		throw new RangeError(`${name} rows must not be empty`)
	}

	const data = new Array(rows)
	for (let i = 0; i < rows; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${i}] must be an array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular: row ${i} has length ${row.length}, expected ${cols}`,
			)
		}
		const normRow = new Array(cols)
		for (let j = 0; j < cols; j++) {
			normRow[j] = normalizeRational(row[j], `${name}[${i}][${j}]`)
		}
		data[i] = normRow
	}

	return { rows, cols, data }
}

/**
 * Multiplies two already-normalized rationals and returns a normalized rational.
 * Uses cross-cancellation before multiplication to keep intermediate BigInts small.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function mulNormalized(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Adds two already-normalized rationals and returns a normalized rational.
 * Uses gcd of denominators to minimize intermediate growth.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addNormalized(a, b) {
	if (a.num === 0n) return b
	if (b.num === 0n) return a
	const g = gcdBigInt(a.den, b.den)
	const aDenDiv = a.den / g
	const bDenDiv = b.den / g
	const num = a.num * bDenDiv + b.num * aDenDiv
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const den = aDenDiv * b.den
	const h = gcdBigInt(num, den)
	return { num: num / h, den: den / h }
}

/**
 * Multiplies two matrices of exact rational numbers.
 *
 * Computes the matrix product `C = A * B` where each entry is evaluated via the
 * finite inner-product series `C[i][j] = sum_{p=0}^{k-1} A[i][p] * B[p][j]`
 * in exact BigInt rational arithmetic, with every resulting entry reduced to
 * canonical lowest terms (`den > 0n` and `gcd(|num|, den) === 1n`).
 *
 * @param {Rational[][]} a Left matrix of shape `m x k`.
 * @param {Rational[][]} b Right matrix of shape `k x n`.
 * @returns {Rational[][]} Product matrix of shape `m x n` with normalized rational entries.
 * @throws {TypeError} If `a` or `b` is not a 2D array or contains invalid rational entries.
 * @throws {RangeError} If `a` or `b` is empty, ragged, has incompatible dimensions, or contains a zero denominator.
 */
export function matMulRationalSeries(a, b) {
	const matA = validateAndNormalizeMatrix(a, 'a')
	const matB = validateAndNormalizeMatrix(b, 'b')

	if (matA.cols !== matB.rows) {
		throw new RangeError(
			`Incompatible matrix dimensions: ${matA.rows}x${matA.cols} cannot be multiplied by ${matB.rows}x${matB.cols}`,
		)
	}

	const m = matA.rows
	const k = matA.cols
	const n = matB.cols
	const result = new Array(m)

	for (let i = 0; i < m; i++) {
		const rowA = matA.data[i]
		const outRow = new Array(n)
		for (let j = 0; j < n; j++) {
			let acc = { num: 0n, den: 1n }
			for (let p = 0; p < k; p++) {
				const term = mulNormalized(rowA[p], matB.data[p][j])
				acc = addNormalized(acc, term)
			}
			outRow[j] = acc
		}
		result[i] = outRow
	}

	return result
}
