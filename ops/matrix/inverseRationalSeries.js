/**
 * Compute the greatest common divisor of two BigInt values (always non-negative).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	while (b !== 0n) {
		const t = a % b
		a = b
		b = t
	}
	return a
}

/**
 * Normalize a rational number num / den to lowest terms with den > 0n.
 * Zero is canonically represented as { num: 0n, den: 1n }.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalize(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Validate and normalize a rational entry { num: bigint, den: bigint }.
 *
 * @param {unknown} entry
 * @param {number} row
 * @param {number} col
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(entry, row, col) {
	if (entry === null || typeof entry !== 'object') {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must be a rational object { num: BigInt, den: BigInt }`
		)
	}
	if (typeof entry.num !== 'bigint' || typeof entry.den !== 'bigint') {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must have BigInt num and den properties`
		)
	}
	if (entry.den === 0n) {
		throw new RangeError(
			`Matrix entry at [${row}][${col}] has zero denominator`
		)
	}
	return normalize(entry.num, entry.den)
}

/**
 * Multiply two normalized rationals, returning a normalized rational.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratMul(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcd(a.num, b.den)
	const g2 = gcd(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Divide normalized rational a by non-zero normalized rational b.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratDiv(a, b) {
	const invB =
		b.num < 0n
			? { num: -b.den, den: -b.num }
			: { num: b.den, den: b.num }
	return ratMul(a, invB)
}

/**
 * Subtract normalized rational b from normalized rational a.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratSub(a, b) {
	if (b.num === 0n) {
		return { num: a.num, den: a.den }
	}
	if (a.num === 0n) {
		return { num: -b.num, den: b.den }
	}
	const g = gcd(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	const num = a.num * bDenReduced - b.num * aDenReduced
	const den = aDenReduced * b.den
	return normalize(num, den)
}

/**
 * Compute the exact inverse of an invertible n x n matrix over exact rationals.
 *
 * Uses exact rational Gauss-Jordan elimination on the augmented matrix [M | I]:
 * for each column, selects a non-zero pivot row (throwing if none exists, which
 * certifies singularity), swaps it into pivot position, scales the pivot row so
 * the pivot becomes 1, and eliminates all other entries in that column. Because
 * all arithmetic is performed over exact BigInt rationals reduced to lowest
 * terms, no rounding error occurs even for ill-conditioned matrices such as
 * Hilbert matrices.
 *
 * Does not mutate the input matrix.
 *
 * @param {Array<Array<{ num: bigint, den: bigint }>>} M
 *   Non-empty square n x n matrix of exact rational objects `{ num: BigInt, den: BigInt }`
 *   with `den !== 0n`.
 * @returns {Array<Array<{ num: bigint, den: bigint }>>}
 *   The exact inverse n x n matrix with every entry reduced to lowest terms
 *   (`den > 0n`, `gcd(|num|, den) === 1n`, and zero as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `M` is not an array of arrays of `{ num: BigInt, den: BigInt }` objects.
 * @throws {RangeError} If `M` is empty, not square, contains a zero denominator, or is singular.
 */
export function inverseRationalSeries(M) {
	if (!Array.isArray(M)) {
		throw new TypeError('Input matrix M must be an array of rows')
	}
	const n = M.length
	if (n === 0) {
		throw new RangeError('Input matrix M must be non-empty')
	}

	// Validate that all rows are arrays before checking matrix dimensions
	for (let i = 0; i < n; i++) {
		if (!Array.isArray(M[i])) {
			throw new TypeError(`Row ${i} of matrix M must be an array`)
		}
	}

	// Build augmented matrix [M | I] while validating shape and rational entries
	const aug = new Array(n)
	for (let i = 0; i < n; i++) {
		const row = M[i]
		if (row.length !== n) {
			throw new RangeError(
				`Input matrix M must be square (expected ${n} columns, got ${row.length} in row ${i})`
			)
		}
		const augRow = new Array(2 * n)
		for (let j = 0; j < n; j++) {
			augRow[j] = validateRational(row[j], i, j)
		}
		for (let j = 0; j < n; j++) {
			augRow[n + j] = i === j ? { num: 1n, den: 1n } : { num: 0n, den: 1n }
		}
		aug[i] = augRow
	}

	// Exact rational Gauss-Jordan elimination
	for (let col = 0; col < n; col++) {
		// Find a non-zero pivot in column `col` at or below row `col`
		let pivotRow = -1
		for (let r = col; r < n; r++) {
			if (aug[r][col].num !== 0n) {
				pivotRow = r
				break
			}
		}
		if (pivotRow === -1) {
			throw new RangeError('Matrix is singular and cannot be inverted')
		}

		// Swap pivot row into position
		if (pivotRow !== col) {
			const tmp = aug[col]
			aug[col] = aug[pivotRow]
			aug[pivotRow] = tmp
		}

		// Normalize pivot row so aug[col][col] = 1
		const pivot = aug[col][col]
		aug[col][col] = { num: 1n, den: 1n }
		for (let j = col + 1; j < 2 * n; j++) {
			if (aug[col][j].num !== 0n) {
				aug[col][j] = ratDiv(aug[col][j], pivot)
			}
		}

		// Eliminate column `col` in all other rows
		for (let r = 0; r < n; r++) {
			if (r === col) continue
			const factor = aug[r][col]
			if (factor.num === 0n) continue
			aug[r][col] = { num: 0n, den: 1n }
			for (let j = col + 1; j < 2 * n; j++) {
				if (aug[col][j].num !== 0n) {
					aug[r][j] = ratSub(aug[r][j], ratMul(factor, aug[col][j]))
				}
			}
		}
	}

	// Extract the right half [I | M^-1]
	const result = new Array(n)
	for (let i = 0; i < n; i++) {
		result[i] = aug[i].slice(n)
	}
	return result
}
