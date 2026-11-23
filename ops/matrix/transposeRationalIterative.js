/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the greatest common divisor of two BigInts using the iterative
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
 * Validates and normalizes a rational entry to lowest terms with a strictly
 * positive denominator. Zero is normalized to `{ num: 0n, den: 1n }`.
 *
 * @param {unknown} entry
 * @param {number} row
 * @param {number} col
 * @returns {Rational}
 */
function normalizeRational(entry, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must be a rational object { num: bigint, den: bigint }`,
		)
	}

	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (entry)

	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must have bigint num and den properties`,
		)
	}

	if (den === 0n) {
		throw new RangeError(
			`Matrix entry at [${row}][${col}] has a zero denominator`,
		)
	}

	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	let normNum = num
	let normDen = den
	if (normDen < 0n) {
		normNum = -normNum
		normDen = -normDen
	}

	const divisor = gcdBigInt(normNum, normDen)
	return {
		num: normNum / divisor,
		den: normDen / divisor,
	}
}

/**
 * Transposes a matrix of exact rational numbers `{ num: bigint, den: bigint }`
 * using a straightforward iterative implementation.
 *
 * Every entry in the resulting transposed matrix is normalized to lowest terms
 * with a strictly positive denominator (with zero represented as `{ num: 0n, den: 1n }`).
 * The input matrix and its entries are never mutated.
 *
 * @param {ReadonlyArray<ReadonlyArray<Rational>>} matrix - Rectangular 2D array of rationals.
 * @returns {Rational[][]} The transposed matrix with normalized exact rational entries.
 * @throws {TypeError} If `matrix` is not an array of arrays, or any entry is not a valid `{ num: bigint, den: bigint }`.
 * @throws {RangeError} If `matrix` is ragged (rows have different lengths) or any entry has a zero denominator.
 */
export function transposeRationalIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Input matrix must be an array of row arrays')
	}

	const rows = matrix.length
	if (rows === 0) {
		return []
	}

	for (let r = 0; r < rows; r++) {
		if (!Array.isArray(matrix[r])) {
			throw new TypeError(`Matrix row ${r} must be an array`)
		}
	}

	const cols = matrix[0].length
	for (let r = 1; r < rows; r++) {
		if (matrix[r].length !== cols) {
			throw new RangeError(
				`Matrix must be rectangular: row 0 has length ${cols}, but row ${r} has length ${matrix[r].length}`,
			)
		}
	}

	if (cols === 0) {
		return []
	}

	/** @type {Rational[][]} */
	const result = new Array(cols)
	for (let c = 0; c < cols; c++) {
		result[c] = new Array(rows)
	}

	for (let r = 0; r < rows; r++) {
		const row = matrix[r]
		for (let c = 0; c < cols; c++) {
			result[c][r] = normalizeRational(row[c], r, c)
		}
	}

	return result
}
