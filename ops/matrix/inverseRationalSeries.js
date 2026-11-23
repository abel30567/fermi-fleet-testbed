/**
 * Computes the greatest common divisor of two non-negative BigInt values.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
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
 * Normalizes a rational number to lowest terms with a strictly positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero')
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
 * Validates and normalizes an input rational entry.
 *
 * @param {unknown} entry
 * @param {number} row
 * @param {number} col
 * @returns {{ num: bigint, den: bigint }}
 */
function parseRational(entry, row, col) {
	if (entry === null || typeof entry !== 'object') {
		throw new TypeError(`Matrix entry at [${row}][${col}] must be a { num: BigInt, den: BigInt } object`)
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (entry)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`Matrix entry at [${row}][${col}] must have BigInt num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`Matrix entry at [${row}][${col}] has a zero denominator`)
	}
	return normalizeRational(num, den)
}

/**
 * Subtracts two normalized rationals: a - b.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratSub(a, b) {
	if (b.num === 0n) {
		return a
	}
	if (a.num === 0n) {
		return { num: -b.num, den: b.den }
	}
	const g = gcdBigInt(a.den, b.den)
	const left = a.num * (b.den / g)
	const right = b.num * (a.den / g)
	return normalizeRational(left - right, (a.den / g) * b.den)
}

/**
 * Multiplies two normalized rationals: a * b.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratMul(a, b) {
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
 * Returns the multiplicative inverse of a nonzero normalized rational: 1 / a.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @returns {{ num: bigint, den: bigint }}
 */
function ratInv(a) {
	if (a.num === 0n) {
		throw new Error('Division by zero')
	}
	return a.num < 0n ? { num: -a.den, den: -a.num } : { num: a.den, den: a.num }
}

/**
 * Returns the negation of a normalized rational: -a.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @returns {{ num: bigint, den: bigint }}
 */
function ratNeg(a) {
	return a.num === 0n ? { num: 0n, den: 1n } : { num: -a.num, den: a.den }
}

/**
 * Returns a simple size metric for pivot selection to limit intermediate BigInt growth.
 *
 * @param {{ num: bigint, den: bigint }} r
 * @returns {bigint}
 */
function rationalHeight(r) {
	const absNum = r.num < 0n ? -r.num : r.num
	return absNum + r.den
}

/**
 * Computes the exact inverse of a square nonsingular matrix over the rationals Q.
 *
 * Each entry is represented as `{ num: BigInt, den: BigInt }`. Inputs may be unreduced
 * or have negative denominators, and are validated and normalized without mutating the
 * caller's matrix. Every entry in the returned inverse matrix is normalized in lowest
 * terms with `den > 0n` and `gcd(|num|, den) === 1n` (with zero represented as
 * `{ num: 0n, den: 1n }`).
 *
 * Uses exact closed-form formulas for 1x1 and 2x2 matrices and exact Gauss-Jordan
 * elimination over Q (reducing `[A | I]` to `[I | A^-1]`) for larger dimensions.
 *
 * @param {Array<Array<{ num: bigint, den: bigint }>>} matrix - Square nonsingular 2D array of rationals.
 * @returns {Array<Array<{ num: bigint, den: bigint }>>} The exact inverse matrix over Q.
 * @throws {TypeError} If the input is not a 2D array of `{ num: BigInt, den: BigInt }` objects.
 * @throws {RangeError} If the matrix is empty, non-square, or contains a zero denominator.
 * @throws {Error} If the matrix is singular (non-invertible).
 */
export function inverseRationalSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Matrix must be a 2D array')
	}
	const n = matrix.length
	if (n === 0) {
		throw new RangeError('Matrix must be non-empty')
	}

	/** @type {Array<Array<{ num: bigint, den: bigint }>>} */
	const normalized = new Array(n)
	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Matrix row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(`Matrix must be square: expected ${n} columns in row ${i}, got ${row.length}`)
		}
		const copyRow = new Array(n)
		for (let j = 0; j < n; j++) {
			copyRow[j] = parseRational(row[j], i, j)
		}
		normalized[i] = copyRow
	}

	if (n === 1) {
		const a00 = normalized[0][0]
		if (a00.num === 0n) {
			throw new Error('Matrix is singular and cannot be inverted')
		}
		return [[ratInv(a00)]]
	}

	if (n === 2) {
		const [[a, b], [c, d]] = normalized
		const det = ratSub(ratMul(a, d), ratMul(b, c))
		if (det.num === 0n) {
			throw new Error('Matrix is singular and cannot be inverted')
		}
		const invDet = ratInv(det)
		return [
			[ratMul(d, invDet), ratMul(ratNeg(b), invDet)],
			[ratMul(ratNeg(c), invDet), ratMul(a, invDet)],
		]
	}

	const ZERO = { num: 0n, den: 1n }
	const ONE = { num: 1n, den: 1n }

	// Build augmented matrix [A | I]
	/** @type {Array<Array<{ num: bigint, den: bigint }>>} */
	const aug = new Array(n)
	for (let i = 0; i < n; i++) {
		const row = new Array(2 * n)
		for (let j = 0; j < n; j++) {
			row[j] = normalized[i][j]
			row[n + j] = i === j ? ONE : ZERO
		}
		aug[i] = row
	}

	// Exact Gauss-Jordan elimination over Q
	for (let col = 0; col < n; col++) {
		let pivotRow = -1
		let bestHeight = 0n
		for (let r = col; r < n; r++) {
			const candidate = aug[r][col]
			if (candidate.num !== 0n) {
				const h = rationalHeight(candidate)
				if (pivotRow === -1 || h < bestHeight) {
					pivotRow = r
					bestHeight = h
				}
			}
		}

		if (pivotRow === -1) {
			throw new Error('Matrix is singular and cannot be inverted')
		}

		if (pivotRow !== col) {
			const tmp = aug[col]
			aug[col] = aug[pivotRow]
			aug[pivotRow] = tmp
		}

		const pivotInv = ratInv(aug[col][col])
		const pRow = aug[col]
		pRow[col] = ONE
		for (let j = col + 1; j < 2 * n; j++) {
			if (pRow[j].num !== 0n) {
				pRow[j] = ratMul(pRow[j], pivotInv)
			}
		}

		for (let r = 0; r < n; r++) {
			if (r === col) {
				continue
			}
			const row = aug[r]
			const factor = row[col]
			if (factor.num === 0n) {
				continue
			}
			row[col] = ZERO
			for (let j = col + 1; j < 2 * n; j++) {
				const pivotVal = pRow[j]
				if (pivotVal.num !== 0n) {
					row[j] = ratSub(row[j], ratMul(factor, pivotVal))
				}
			}
		}
	}

	const inverse = new Array(n)
	for (let i = 0; i < n; i++) {
		const outRow = new Array(n)
		for (let j = 0; j < n; j++) {
			const entry = aug[i][n + j]
			outRow[j] = { num: entry.num, den: entry.den }
		}
		inverse[i] = outRow
	}
	return inverse
}
