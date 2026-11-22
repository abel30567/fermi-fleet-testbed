/**
 * Compute the absolute value of a BigInt.
 *
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Compute the greatest common divisor of two BigInts iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Normalize a rational number to lowest terms with a positive denominator.
 * Zero is represented canonically as `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
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
	const divisor = gcdBigInt(n, d)
	return { num: n / divisor, den: d / divisor }
}

/**
 * Validate and normalize a rational entry object `{ num: bigint, den: bigint }`.
 *
 * @param {unknown} value
 * @param {number} row
 * @param {number} col
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(value, row, col) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must be a rational object { num: bigint, den: bigint }`
		)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must have BigInt num and den fields`
		)
	}
	if (den === 0n) {
		throw new RangeError(
			`Matrix entry at [${row}][${col}] has zero denominator`
		)
	}
	return normalizeRational(num, den)
}

/**
 * Subtract two normalized rationals: `a - b`.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function subRational(a, b) {
	if (b.num === 0n) {
		return a
	}
	if (a.num === 0n) {
		return { num: -b.num, den: b.den }
	}
	return normalizeRational(a.num * b.den - b.num * a.den, a.den * b.den)
}

/**
 * Multiply two normalized rationals: `a * b`.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	const num = (a.num / g1) * (b.num / g2)
	const den = (a.den / g2) * (b.den / g1)
	return { num, den }
}

/**
 * Divide two normalized rationals: `a / b`.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function divRational(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero rational')
	}
	if (a.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const reciprocal =
		b.num < 0n ? { num: -b.den, den: -b.num } : { num: b.den, den: b.num }
	return mulRational(a, reciprocal)
}

/**
 * Return true if `|a| > |b|` for normalized rationals with positive denominators.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {boolean}
 */
function hasLargerMagnitude(a, b) {
	return absBigInt(a.num) * b.den > absBigInt(b.num) * a.den
}

/**
 * Compute the exact determinant of a non-empty square matrix of rational numbers
 * `{ num: bigint, den: bigint }` using iterative Gaussian elimination with
 * partial pivoting.
 *
 * The input matrix is not mutated. The returned rational is reduced to lowest
 * terms with a strictly positive denominator (`{ num: 0n, den: 1n }` for zero).
 *
 * @param {Array<Array<{ num: bigint, den: bigint }>>} matrix Non-empty n x n matrix of rationals.
 * @returns {{ num: bigint, den: bigint }} Exact determinant in lowest terms with `den > 0n`.
 * @throws {TypeError} If `matrix` is not an array of arrays of `{ num: bigint, den: bigint }` objects.
 * @throws {RangeError} If `matrix` is empty, not square, or contains a rational with `den === 0n`.
 */
export function determinantRationalIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Matrix must be an array of rows')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('Matrix must be non-empty')
	}

	const work = new Array(n)
	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Matrix row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`Matrix must be square: expected ${n} columns in row ${i}, got ${row.length}`
			)
		}
		const workRow = new Array(n)
		for (let j = 0; j < n; j++) {
			workRow[j] = validateRational(row[j], i, j)
		}
		work[i] = workRow
	}

	let det = { num: 1n, den: 1n }
	let sign = 1n

	for (let col = 0; col < n; col++) {
		let pivotRow = col
		let pivotValue = work[col][col]

		for (let row = col + 1; row < n; row++) {
			const candidate = work[row][col]
			if (hasLargerMagnitude(candidate, pivotValue)) {
				pivotRow = row
				pivotValue = candidate
			}
		}

		if (pivotValue.num === 0n) {
			return { num: 0n, den: 1n }
		}

		if (pivotRow !== col) {
			const temp = work[col]
			work[col] = work[pivotRow]
			work[pivotRow] = temp
			sign = -sign
		}

		const pivot = work[col][col]
		det = mulRational(det, pivot)

		for (let row = col + 1; row < n; row++) {
			const leading = work[row][col]
			if (leading.num === 0n) {
				continue
			}
			const factor = divRational(leading, pivot)
			work[row][col] = { num: 0n, den: 1n }
			for (let k = col + 1; k < n; k++) {
				const pivotRowEntry = work[col][k]
				if (pivotRowEntry.num !== 0n) {
					work[row][k] = subRational(
						work[row][k],
						mulRational(factor, pivotRowEntry)
					)
				}
			}
		}
	}

	if (sign < 0n) {
		return { num: -det.num, den: det.den }
	}
	return det
}
