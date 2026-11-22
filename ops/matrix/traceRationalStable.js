/**
 * Exact rational matrix trace with numerically robust pairwise tree reduction.
 *
 * Computes the trace of an n x n matrix of exact rational numbers represented as
 * `{ num: BigInt, den: BigInt }`, returning the result in canonical lowest terms
 * with a strictly positive denominator (`den > 0n`, `gcd(|num|, den) === 1n`,
 * and `{ num: 0n, den: 1n }` for zero).
 *
 * To avoid O(n) intermediate BigInt denominator blowup from naive sequential
 * accumulation, diagonal terms are:
 * 1. Normalized to lowest terms with positive denominators.
 * 2. Grouped by identical denominator so cancelling same-denominator terms
 *    collapse before cross-multiplication.
 * 3. Sorted by denominator magnitude and reduced via a balanced binary tree
 *    using Knuth's GCD cross-cancellation addition (`g = gcd(q1, q2)` and
 *    `h = gcd(|t|, g)`), keeping intermediate products small and exact.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the non-negative greatest common divisor of two BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
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
 * Validates that a value is a well-formed Rational `{ num: bigint, den: bigint }`
 * with a non-zero denominator.
 *
 * @param {unknown} entry
 * @param {number} rowIndex
 * @param {number} colIndex
 * @returns {Rational}
 */
function assertValidRational(entry, rowIndex, colIndex) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(
			`matrix[${rowIndex}][${colIndex}] must be a rational object { num: BigInt, den: BigInt }`,
		)
	}
	const { num, den } = /** @type {Record<string, unknown>} */ (entry)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`matrix[${rowIndex}][${colIndex}] must have BigInt num and den properties`,
		)
	}
	if (den === 0n) {
		throw new RangeError(
			`matrix[${rowIndex}][${colIndex}] has zero denominator`,
		)
	}
	return { num, den }
}

/**
 * Normalizes a valid rational to canonical lowest terms with `den > 0n`.
 * Always returns a fresh `{ num, den }` object.
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
 * Adds two already-normalized rationals (`den > 0n`, `gcd(|num|, den) === 1n`)
 * using GCD cross-cancellation (Knuth TAOCP Vol. 2, §4.5.1) so intermediate
 * numerators and denominators remain minimal and the output is in lowest terms.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addNormalizedRationals(a, b) {
	if (a.num === 0n) {
		return { num: b.num, den: b.den }
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den }
	}

	const g = gcdBigInt(a.den, b.den)
	if (g === 1n) {
		const num = a.num * b.den + b.num * a.den
		if (num === 0n) {
			return { num: 0n, den: 1n }
		}
		// Since gcd(a.num, a.den) = 1, gcd(b.num, b.den) = 1, and gcd(a.den, b.den) = 1,
		// num is automatically coprime to a.den * b.den.
		return { num, den: a.den * b.den }
	}

	const aDenScaled = a.den / g
	const bDenScaled = b.den / g
	const t = a.num * bDenScaled + b.num * aDenScaled
	if (t === 0n) {
		return { num: 0n, den: 1n }
	}

	// Only factors dividing g can divide both t and lcm(a.den, b.den).
	const h = gcdBigInt(t, g)
	return {
		num: t / h,
		den: aDenScaled * (b.den / h),
	}
}

/**
 * Computes the exact trace of a non-empty square matrix over exact rationals.
 *
 * Validates that `matrix` is a non-empty square 2D array and that every entry
 * in the matrix is a valid rational `{ num: BigInt, den: BigInt }` with
 * `den !== 0n`.
 *
 * @param {Rational[][]} matrix - Non-empty n x n matrix of exact rationals.
 * @returns {Rational} Exact trace in canonical lowest terms (`den > 0n`).
 * @throws {TypeError} If `matrix`, any row, or any entry has an invalid type.
 * @throws {RangeError} If `matrix` is empty, non-square, or has a zero denominator.
 */
export function traceRationalStable(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of rationals')
	}
	const n = matrix.length
	if (n === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} length ${n}, got ${row.length}`,
			)
		}
		for (let j = 0; j < n; j++) {
			assertValidRational(row[j], i, j)
		}
	}

	// Normalize diagonal entries and group by identical reduced denominator so
	// matching-denominator cancellations occur before cross-multiplication.
	/** @type {Map<bigint, bigint>} */
	const buckets = new Map()
	for (let i = 0; i < n; i++) {
		const { num, den } = normalizeRational(matrix[i][i].num, matrix[i][i].den)
		if (num === 0n) {
			continue
		}
		buckets.set(den, (buckets.get(den) ?? 0n) + num)
	}

	/** @type {Rational[]} */
	let terms = []
	for (const [den, numSum] of buckets) {
		if (numSum !== 0n) {
			terms.push(normalizeRational(numSum, den))
		}
	}

	if (terms.length === 0) {
		return { num: 0n, den: 1n }
	}

	// Order smaller denominators together before balanced pairwise tree reduction
	// to minimize intermediate BigInt widths across tree levels.
	terms.sort((a, b) => (a.den < b.den ? -1 : a.den > b.den ? 1 : 0))

	while (terms.length > 1) {
		/** @type {Rational[]} */
		const next = []
		for (let i = 0; i < terms.length; i += 2) {
			if (i + 1 < terms.length) {
				const sum = addNormalizedRationals(terms[i], terms[i + 1])
				if (sum.num !== 0n) {
					next.push(sum)
				}
			} else {
				next.push(terms[i])
			}
		}
		terms = next
	}

	return terms.length === 1 ? terms[0] : { num: 0n, den: 1n }
}
