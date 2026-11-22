/**
 * Compute the exact determinant of an n x n rational matrix.
 *
 * Algorithm:
 * 1. Validate that `M` is a non-empty square 2D array of valid rational objects
 *    `{ num: bigint, den: bigint }` with `den !== 0n`, and normalize every entry.
 * 2. Clear denominators row-by-row by multiplying row `i` by the least common
 *    multiple `L_i` of its denominators, producing an exact integer matrix `A`
 *    such that `det(M) = det(A) / prod(L_i)`.
 * 3. Apply the fraction-free Bareiss algorithm with partial pivoting (using
 *    Sylvester's / Desnanot-Jacobi determinant identity) to compute `det(A)`
 *    exactly in `BigInt` arithmetic without intermediate rational reductions.
 * 4. Reduce `det(A) / prod(L_i)` to lowest terms with `den > 0n` (and
 *    `{ num: 0n, den: 1n }` when the determinant is zero).
 *
 * The input matrix `M` is not mutated.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 *
 * @param {Rational[][]} M - Non-empty n x n matrix of exact rationals.
 * @returns {Rational} Exact determinant in lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`).
 * @throws {TypeError} If `M` is not a 2D array or any entry is not a `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `M` is empty, not square, or any entry has `den === 0n`.
 */
export function determinantRationalSeries(M) {
	const { intMatrix, denomProd } = validateAndScaleMatrix(M)
	const n = intMatrix.length

	let prevPivot = 1n
	let sign = 1n

	for (let k = 0; k < n; k++) {
		// Partial pivoting: select row p >= k with maximum |intMatrix[p][k]|
		let pivotRow = k
		let maxAbs = absBigInt(intMatrix[k][k])
		for (let i = k + 1; i < n; i++) {
			const candAbs = absBigInt(intMatrix[i][k])
			if (candAbs > maxAbs) {
				maxAbs = candAbs
				pivotRow = i
			}
		}

		if (maxAbs === 0n) {
			return { num: 0n, den: 1n }
		}

		if (pivotRow !== k) {
			const tmp = intMatrix[k]
			intMatrix[k] = intMatrix[pivotRow]
			intMatrix[pivotRow] = tmp
			sign = -sign
		}

		const pivot = intMatrix[k][k]
		for (let i = k + 1; i < n; i++) {
			const aik = intMatrix[i][k]
			const rowI = intMatrix[i]
			const rowK = intMatrix[k]
			for (let j = k + 1; j < n; j++) {
				rowI[j] = (pivot * rowI[j] - aik * rowK[j]) / prevPivot
			}
		}

		prevPivot = pivot
	}

	return normalizeRational(sign * intMatrix[n - 1][n - 1], denomProd)
}

/**
 * Compute absolute value of a BigInt.
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x
}

/**
 * Compute greatest common divisor of two non-negative BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a
	let y = b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Compute least common multiple of two positive BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function lcmBigInt(a, b) {
	return (a / gcdBigInt(a, b)) * b
}

/**
 * Reduce a rational `num / den` to canonical lowest terms (`den > 0n`).
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be 0n')
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
	const g = gcdBigInt(absBigInt(n), d)
	return { num: n / g, den: d / g }
}

/**
 * Validate input matrix `M`, normalize all entries, and clear row denominators.
 * @param {unknown} M
 * @returns {{ intMatrix: bigint[][], denomProd: bigint }}
 */
function validateAndScaleMatrix(M) {
	if (!Array.isArray(M)) {
		throw new TypeError('Matrix M must be a non-empty square 2D array of rationals')
	}
	const n = M.length
	if (n === 0) {
		throw new RangeError('Matrix M must be non-empty')
	}

	const intMatrix = new Array(n)
	let denomProd = 1n

	for (let i = 0; i < n; i++) {
		const row = M[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Matrix row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(`Matrix must be square: row ${i} has length ${row.length}, expected ${n}`)
		}

		const normalizedRow = new Array(n)
		let rowLcm = 1n

		for (let j = 0; j < n; j++) {
			const entry = row[j]
			if (typeof entry !== 'object' || entry === null) {
				throw new TypeError(`Matrix entry [${i}][${j}] must be a rational object { num: bigint, den: bigint }`)
			}
			if (typeof entry.num !== 'bigint' || typeof entry.den !== 'bigint') {
				throw new TypeError(`Matrix entry [${i}][${j}] must have BigInt num and den`)
			}
			if (entry.den === 0n) {
				throw new RangeError(`Matrix entry [${i}][${j}] has zero denominator`)
			}

			const r = normalizeRational(entry.num, entry.den)
			normalizedRow[j] = r
			rowLcm = lcmBigInt(rowLcm, r.den)
		}

		const intRow = new Array(n)
		for (let j = 0; j < n; j++) {
			const r = normalizedRow[j]
			intRow[j] = r.num * (rowLcm / r.den)
		}

		intMatrix[i] = intRow
		denomProd *= rowLcm
	}

	return { intMatrix, denomProd }
}
