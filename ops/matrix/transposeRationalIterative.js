/**
 * Computes the greatest common divisor of two BigInt values using the
 * iterative Euclidean algorithm.
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
 * Validates and normalizes an exact rational `{ num: bigint, den: bigint }`
 * into lowest terms with a strictly positive denominator (`0n / 1n` for zero).
 *
 * @param {{ num: bigint, den: bigint }} value
 * @param {number} rowIndex
 * @param {number} colIndex
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(value, rowIndex, colIndex) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Matrix entry at [${rowIndex}][${colIndex}] must be a rational object { num: BigInt, den: BigInt }`
		)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`Matrix entry at [${rowIndex}][${colIndex}] must have BigInt num and den properties`
		)
	}
	if (den === 0n) {
		throw new RangeError(
			`Matrix entry at [${rowIndex}][${colIndex}] has a zero denominator`
		)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let normalizedNum = num
	let normalizedDen = den
	if (normalizedDen < 0n) {
		normalizedNum = -normalizedNum
		normalizedDen = -normalizedDen
	}
	const divisor = gcdBigInt(normalizedNum, normalizedDen)
	return {
		num: normalizedNum / divisor,
		den: normalizedDen / divisor,
	}
}

/**
 * Computes the transpose of a non-empty rectangular matrix of exact rationals
 * using a straightforward iterative algorithm.
 *
 * Each rational entry has the shape `{ num: BigInt, den: BigInt }` and every
 * entry in the returned `n x m` matrix is a newly created rational normalized
 * to lowest terms with `den > 0n` (with zero represented as `{ num: 0n, den: 1n }`).
 * The input matrix and its entry objects are never mutated.
 *
 * @param {Array<Array<{ num: bigint, den: bigint }>>} matrix - Non-empty `m x n` matrix of exact rationals.
 * @returns {Array<Array<{ num: bigint, den: bigint }>>} Transposed `n x m` matrix of normalized exact rationals.
 * @throws {TypeError} If `matrix` is not an array of arrays, or any entry is not a valid `{ num: BigInt, den: BigInt }` object.
 * @throws {RangeError} If `matrix` is empty, has empty rows, is ragged (non-rectangular), or contains a zero denominator.
 */
export function transposeRationalIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Matrix must be a 2D array of rational objects')
	}
	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError('Matrix must be non-empty')
	}

	let cols = -1
	for (let i = 0; i < rows; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Matrix row ${i} must be an array`)
		}
		if (i === 0) {
			cols = row.length
			if (cols === 0) {
				throw new RangeError('Matrix rows must be non-empty')
			}
		} else if (row.length !== cols) {
			throw new RangeError(
				`Matrix must be rectangular: row ${i} has length ${row.length}, expected ${cols}`
			)
		}
	}

	const result = new Array(cols)
	for (let j = 0; j < cols; j++) {
		result[j] = new Array(rows)
	}

	for (let i = 0; i < rows; i++) {
		const row = matrix[i]
		for (let j = 0; j < cols; j++) {
			result[j][i] = normalizeRational(row[j], i, j)
		}
	}

	return result
}
