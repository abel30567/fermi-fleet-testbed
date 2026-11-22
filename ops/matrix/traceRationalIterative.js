/**
 * Computes the greatest common divisor of two BigInt values using the iterative
 * Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Normalizes a rational pair (num, den) into lowest terms with den > 0n,
 * representing zero as { num: 0n, den: 1n }.
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
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validates that a value is a well-formed rational object `{ num: bigint, den: bigint }`
 * with a non-zero denominator.
 *
 * @param {unknown} value
 * @param {number} rowIndex
 * @param {number} colIndex
 */
function validateRational(value, rowIndex, colIndex) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Matrix entry at (${rowIndex}, ${colIndex}) must be an object with BigInt num and den properties`
		)
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`Matrix entry at (${rowIndex}, ${colIndex}) must have BigInt num and den properties`
		)
	}
	if (den === 0n) {
		throw new RangeError(
			`Matrix entry at (${rowIndex}, ${colIndex}) must have a non-zero denominator`
		)
	}
}

/**
 * Computes the exact trace (sum of main diagonal entries) of a non-empty square
 * matrix of exact rational numbers `{ num: bigint, den: bigint }` using an
 * iterative algorithm.
 *
 * All entries of the matrix (including off-diagonal entries) are validated.
 * Input rationals need not be in lowest terms and may have negative denominators;
 * the returned rational is always normalized to lowest terms with `den > 0n`
 * (and `{ num: 0n, den: 1n }` for zero).
 *
 * @param {Array<Array<{ num: bigint, den: bigint }>>} matrix Non-empty n x n matrix of rationals.
 * @returns {{ num: bigint, den: bigint }} Exact trace in lowest terms with `den > 0n`.
 * @throws {TypeError} If `matrix` or any row is not an array, or any entry is not a valid rational object.
 * @throws {RangeError} If `matrix` is empty, not square, or any entry has a zero denominator.
 */
export function traceRationalIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Matrix must be an array of row arrays')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('Matrix must be non-empty')
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Matrix row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`Matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			)
		}
		for (let j = 0; j < n; j++) {
			validateRational(row[j], i, j)
		}
	}

	let accNum = 0n
	let accDen = 1n

	for (let i = 0; i < n; i++) {
		const entry = normalizeRational(matrix[i][i].num, matrix[i][i].den)
		const g = gcdBigInt(accDen, entry.den)
		const nextNum = accNum * (entry.den / g) + entry.num * (accDen / g)
		const nextDen = (accDen / g) * entry.den
		const reduced = normalizeRational(nextNum, nextDen)
		accNum = reduced.num
		accDen = reduced.den
	}

	return { num: accNum, den: accDen }
}
