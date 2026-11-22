/**
 * Computes the greatest common divisor of two BigInt values iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD of a and b.
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const rem = x % y
		x = y
		y = rem
	}
	return x
}

/**
 * Constructs a normalized exact rational `{ num, den }` in lowest terms
 * with `den > 0n` and `{ num: 0n, den: 1n }` for zero.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function makeRational(num, den) {
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
 * Validates a rational object and returns a freshly normalized copy.
 *
 * @param {unknown} value
 * @param {number} row
 * @param {number} col
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(value, row, col) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must be a rational object { num: BigInt, den: BigInt }`
		)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must have BigInt num and den fields`
		)
	}
	if (value.den === 0n) {
		throw new RangeError(
			`Matrix entry at [${row}][${col}] has zero denominator`
		)
	}
	return makeRational(value.num, value.den)
}

/**
 * Subtracts two normalized exact rationals: a - b.
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
	const g = gcdBigInt(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	return makeRational(
		a.num * bDenReduced - b.num * aDenReduced,
		aDenReduced * b.den
	)
}

/**
 * Multiplies two normalized exact rationals: a * b.
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
	const num = (a.num / g1) * (b.num / g2)
	const den = (a.den / g2) * (b.den / g1)
	return { num, den }
}

/**
 * Divides two normalized exact rationals: a / b.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratDiv(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero in rational arithmetic')
	}
	if (a.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const invB = b.num < 0n ? { num: -b.den, den: -b.num } : { num: b.den, den: b.num }
	return ratMul(a, invB)
}

/**
 * Computes the exact inverse of an invertible n x n square matrix of exact
 * rationals `{ num: BigInt, den: BigInt }` iteratively using Gauss-Jordan
 * elimination with partial pivoting on the augmented matrix `[A | I]`.
 *
 * Does not mutate the input matrix. Every entry of the returned matrix is a
 * normalized rational in lowest terms with `den > 0n` (`{ num: 0n, den: 1n }`
 * for zero).
 *
 * @param {Array<Array<{ num: bigint, den: bigint }>>} matrix - Non-empty n x n matrix of exact rationals.
 * @returns {Array<Array<{ num: bigint, den: bigint }>>} Exact inverse n x n matrix.
 * @throws {TypeError} If `matrix` is not an array of arrays of `{ num: BigInt, den: BigInt }` objects.
 * @throws {RangeError} If `matrix` is empty, non-square, contains a zero denominator, or is singular.
 */
export function inverseRationalIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Matrix must be an array of rows')
	}
	const n = matrix.length
	if (n === 0) {
		throw new RangeError('Matrix must be non-empty')
	}

	const width = 2 * n
	const aug = new Array(n)

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

		const augRow = new Array(width)
		for (let j = 0; j < n; j++) {
			augRow[j] = validateRational(row[j], i, j)
		}
		for (let j = 0; j < n; j++) {
			augRow[n + j] = i === j ? { num: 1n, den: 1n } : { num: 0n, den: 1n }
		}
		aug[i] = augRow
	}

	for (let col = 0; col < n; col++) {
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

		if (pivotRow !== col) {
			const tmp = aug[col]
			aug[col] = aug[pivotRow]
			aug[pivotRow] = tmp
		}

		const pivotRowArr = aug[col]
		const pivot = pivotRowArr[col]
		pivotRowArr[col] = { num: 1n, den: 1n }
		for (let j = col + 1; j < width; j++) {
			if (pivotRowArr[j].num !== 0n) {
				pivotRowArr[j] = ratDiv(pivotRowArr[j], pivot)
			}
		}

		for (let r = 0; r < n; r++) {
			if (r === col) {
				continue
			}
			const targetRow = aug[r]
			const factor = targetRow[col]
			if (factor.num === 0n) {
				continue
			}
			targetRow[col] = { num: 0n, den: 1n }
			for (let j = col + 1; j < width; j++) {
				if (pivotRowArr[j].num !== 0n) {
					targetRow[j] = ratSub(targetRow[j], ratMul(factor, pivotRowArr[j]))
				}
			}
		}
	}

	const inverse = new Array(n)
	for (let i = 0; i < n; i++) {
		const invRow = new Array(n)
		for (let j = 0; j < n; j++) {
			const entry = aug[i][n + j]
			invRow[j] = { num: entry.num, den: entry.den }
		}
		inverse[i] = invRow
	}

	return inverse
}
