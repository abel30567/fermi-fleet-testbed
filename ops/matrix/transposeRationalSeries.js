/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number in lowest terms: `den > 0n`, `gcd(|num|, den) === 1n`,
 * and zero represented canonically as `{ num: 0n, den: 1n }`.
 */

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x
}

/**
 * Computes the greatest common divisor of two non-negative BigInts
 * using the iterative Euclidean algorithm.
 *
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
 * Validates and normalizes a rational entry to lowest terms with a positive denominator.
 *
 * @param {unknown} entry - Candidate rational object `{ num: bigint, den: bigint }`.
 * @param {number} rowIndex - Row index for diagnostic error messages.
 * @param {number} colIndex - Column index for diagnostic error messages.
 * @returns {Rational} Normalized rational in lowest terms.
 * @throws {TypeError} If `entry` is not an object with `bigint` `num` and `den` properties.
 * @throws {RangeError} If `entry.den === 0n`.
 */
function normalizeRational(entry, rowIndex, colIndex) {
	if (entry === null || typeof entry !== 'object') {
		throw new TypeError(
			`Entry at [${rowIndex}][${colIndex}] must be a rational object { num: bigint, den: bigint }`
		)
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (entry)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`Entry at [${rowIndex}][${colIndex}] must have bigint num and den properties`
		)
	}
	if (den === 0n) {
		throw new RangeError(
			`Entry at [${rowIndex}][${colIndex}] has zero denominator`
		)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const signedNum = den < 0n ? -num : num
	const posDen = den < 0n ? -den : den
	const g = gcdBigInt(absBigInt(signedNum), posDen)
	return { num: signedNum / g, den: posDen / g }
}

/**
 * Computes the exact transpose M^T of a rectangular matrix M over exact rationals.
 *
 * Algorithm:
 * Uses the exact closed-form transpose identity in the standard matrix-unit basis:
 *   M = sum_{i=0}^{r-1} sum_{j=0}^{c-1} M_{i,j} E_{i,j}
 *   M^T = sum_{i=0}^{r-1} sum_{j=0}^{c-1} M_{i,j} E_{j,i}, i.e., (M^T)_{j,i} = M_{i,j}.
 * Every entry is validated and reduced to canonical lowest terms `{ num: bigint, den: bigint }`
 * with `den > 0n`, `gcd(|num|, den) === 1n`, and zero normalized to `{ num: 0n, den: 1n }`
 * via the Euclidean GCD algorithm. The input matrix is never mutated.
 *
 * @param {ReadonlyArray<ReadonlyArray<Rational>>} M - Non-empty rectangular r x c matrix of exact rationals.
 * @returns {Rational[][]} New c x r matrix representing M^T with every entry normalized to lowest terms.
 * @throws {TypeError} If `M` is not an array, any row is not an array, or any entry is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `M` is empty, any row is empty, rows have inconsistent lengths (ragged matrix), or any entry has `den === 0n`.
 */
export function transposeRationalSeries(M) {
	if (!Array.isArray(M)) {
		throw new TypeError('Matrix M must be a 2D array of rational objects')
	}
	const rows = M.length
	if (rows === 0) {
		throw new RangeError('Matrix M must be non-empty')
	}

	if (!(0 in M) || !Array.isArray(M[0])) {
		throw new TypeError('Row 0 of matrix M must be an array')
	}
	const cols = M[0].length
	if (cols === 0) {
		throw new RangeError('Rows of matrix M must be non-empty')
	}

	// Validate rectangular shape and all row types up front.
	for (let i = 1; i < rows; i++) {
		if (!(i in M) || !Array.isArray(M[i])) {
			throw new TypeError(`Row ${i} of matrix M must be an array`)
		}
		if (M[i].length !== cols) {
			throw new RangeError(
				`Matrix M must be rectangular: expected row ${i} to have length ${cols}, got ${M[i].length}`
			)
		}
	}

	// Allocate c x r result matrix and populate (M^T)[j][i] = normalize(M[i][j]).
	/** @type {Rational[][]} */
	const result = Array.from({ length: cols }, () => new Array(rows))

	for (let i = 0; i < rows; i++) {
		const row = M[i]
		for (let j = 0; j < cols; j++) {
			if (!(j in row)) {
				throw new TypeError(
					`Entry at [${i}][${j}] must be a rational object { num: bigint, den: bigint }`
				)
			}
			result[j][i] = normalizeRational(row[j], i, j)
		}
	}

	return result
}
