/**
 * Exact rational number represented in lowest terms with positive denominator.
 * Zero is uniquely represented as `{ num: 0n, den: 1n }`.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the greatest common divisor of two BigInt values using the
 * Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Normalizes a rational pair `(num, den)` to lowest terms with `den > 0n`
 * and canonical zero `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
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
 * Adds two normalized rationals exactly and returns the sum in lowest terms.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	if (a.num === 0n) return b
	if (b.num === 0n) return a
	const g = gcdBigInt(a.den, b.den)
	const leftDen = a.den / g
	const rightDen = b.den / g
	const num = a.num * rightDen + b.num * leftDen
	const den = leftDen * b.den
	return normalizeRational(num, den)
}

/**
 * Validates that a value is a well-formed rational object `{ num: BigInt, den: BigInt }`
 * with non-zero denominator.
 *
 * @param {unknown} value
 * @param {number} row
 * @param {number} col
 * @throws {TypeError} If the entry is not an object with BigInt `num` and `den`.
 * @throws {RangeError} If `den === 0n`.
 */
function validateRational(value, row, col) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`Matrix entry at [${row}][${col}] must be a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`Matrix entry at [${row}][${col}] must have BigInt num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`Matrix entry at [${row}][${col}] has zero denominator`)
	}
}

/**
 * Computes the exact trace of a non-empty square matrix over exact rationals.
 *
 * Algorithm:
 * Evaluates the closed-form finite diagonal series
 *
 *   tr(M) = sum_{i=0}^{n-1} M[i][i]
 *
 * using exact BigInt rational arithmetic. Each entry of the n x n matrix is
 * validated first; each diagonal entry is normalized (handling unreduced
 * fractions and negative denominators) and accumulated via GCD-reduced
 * addition so the result is always returned in canonical lowest terms
 * (`den > 0n`, `gcd(|num|, den) === 1n`, and zero as `{ num: 0n, den: 1n }`).
 *
 * @param {Rational[][]} M Non-empty n x n matrix of rational objects `{ num: BigInt, den: BigInt }`.
 * @returns {Rational} Exact trace of `M` in lowest terms.
 * @throws {TypeError} If `M` is not an array, any row is not an array, or any entry is not a valid `{ num: BigInt, den: BigInt }` object.
 * @throws {RangeError} If `M` is empty, not square, or contains any entry with `den === 0n`.
 */
export function traceRationalSeries(M) {
	if (!Array.isArray(M)) {
		throw new TypeError('Matrix M must be a 2D array of rationals')
	}
	const n = M.length
	if (n === 0) {
		throw new RangeError('Matrix M must be non-empty')
	}

	for (let i = 0; i < n; i++) {
		const row = M[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Matrix row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(`Matrix M must be square: expected row ${i} to have length ${n}, got ${row.length}`)
		}
		for (let j = 0; j < n; j++) {
			validateRational(row[j], i, j)
		}
	}

	let sum = { num: 0n, den: 1n }
	for (let i = 0; i < n; i++) {
		const diag = normalizeRational(M[i][i].num, M[i][i].den)
		sum = addRational(sum, diag)
	}

	return sum
}
