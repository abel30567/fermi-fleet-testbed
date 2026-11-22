/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number represented in lowest terms with a strictly positive denominator (`den > 0n`).
 * Zero is uniquely represented as `{ num: 0n, den: 1n }`.
 */

/**
 * Computes the greatest common divisor of two BigInts using the iterative Euclidean algorithm.
 *
 * @param {bigint} a - First integer.
 * @param {bigint} b - Second integer.
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
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
 * Validates and reduces a rational entry `{ num: BigInt, den: BigInt }` to lowest terms
 * with a strictly positive denominator.
 *
 * @param {unknown} entry - Candidate rational object.
 * @param {string} label - Descriptive label for error messages.
 * @returns {Rational} Normalized exact rational.
 * @throws {TypeError} If `entry` is not an object with BigInt `num` and `den` properties.
 * @throws {RangeError} If `entry.den === 0n`.
 */
function normalizeRational(entry, label) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = entry
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt 'num' and 'den' properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must be non-zero`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const signAdjustedNum = den < 0n ? -num : num
	const positiveDen = den < 0n ? -den : den
	const divisor = gcdBigInt(signAdjustedNum, positiveDen)
	return {
		num: signAdjustedNum / divisor,
		den: positiveDen / divisor,
	}
}

/**
 * Multiplies two already-normalized exact rationals and returns the exact product in lowest terms.
 *
 * @param {Rational} a - First normalized rational (`a.den > 0n`, `gcd(|a.num|, a.den) === 1n`).
 * @param {Rational} b - Second normalized rational (`b.den > 0n`, `gcd(|b.num|, b.den) === 1n`).
 * @returns {Rational} Fresh normalized rational representing `a * b`.
 */
function multiplyNormalized(a, b) {
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
 * Validates and normalizes an operand as either a non-empty 1D vector or a non-empty rectangular 2D matrix
 * of exact rationals.
 *
 * @param {unknown} input - Candidate 1D vector or 2D matrix.
 * @param {string} name - Parameter name for error messages.
 * @returns {{ isVector: boolean, rows: number, cols: number, data: Rational[][] }} Normalized matrix representation.
 * @throws {TypeError} If `input` is not an array, mixes rows and scalars, or contains invalid rational entries.
 * @throws {RangeError} If `input` is empty, has empty rows, is ragged, or contains a zero denominator.
 */
function parseOperand(input, name) {
	if (!Array.isArray(input)) {
		throw new TypeError(`Parameter '${name}' must be a non-empty 1D array or 2D matrix of rationals`)
	}
	if (input.length === 0) {
		throw new RangeError(`Parameter '${name}' must not be empty`)
	}

	if (Array.isArray(input[0])) {
		const rows = input.length
		const cols = input[0].length
		if (cols === 0) {
			throw new RangeError(`Parameter '${name}' rows must not be empty`)
		}
		const data = new Array(rows)
		for (let i = 0; i < rows; i++) {
			const row = input[i]
			if (!Array.isArray(row)) {
				throw new TypeError(`Parameter '${name}' row ${i} must be an array`)
			}
			if (row.length !== cols) {
				throw new RangeError(
					`Parameter '${name}' must be a rectangular matrix (row ${i} has length ${row.length}, expected ${cols})`
				)
			}
			const normalizedRow = new Array(cols)
			for (let j = 0; j < cols; j++) {
				normalizedRow[j] = normalizeRational(row[j], `${name}[${i}][${j}]`)
			}
			data[i] = normalizedRow
		}
		return { isVector: false, rows, cols, data }
	}

	const cols = input.length
	const normalizedRow = new Array(cols)
	for (let j = 0; j < cols; j++) {
		normalizedRow[j] = normalizeRational(input[j], `${name}[${j}]`)
	}
	return { isVector: true, rows: 1, cols, data: [normalizedRow] }
}

/**
 * Computes the Kronecker (tensor) product `a ⊗ b` over exact rational numbers `{ num: BigInt, den: BigInt }`
 * using a straightforward iterative algorithm.
 *
 * Supported input shapes:
 * - Two 2D matrices `m × n` and `p × q` -> returns a 2D `(m * p) × (n * q)` matrix where
 *   `result[i * p + r][j * q + c] = a[i][j] * b[r][c]`.
 * - Two 1D vectors of lengths `n` and `q` -> returns a 1D vector of length `n * q` where
 *   `result[j * q + c] = a[j] * b[c]`.
 * - One 1D vector and one 2D matrix -> treats the 1D vector as a `1 × k` row matrix and returns
 *   the corresponding 2D Kronecker product matrix.
 *
 * Every entry in the returned tensor is a fresh exact rational `{ num: BigInt, den: BigInt }`
 * reduced to lowest terms with a strictly positive denominator (`den > 0n`), and zero is always
 * represented as `{ num: 0n, den: 1n }`. Input arrays and rational objects are never mutated.
 *
 * @param {Rational[] | Rational[][]} a - First non-empty 1D vector or rectangular 2D matrix of exact rationals.
 * @param {Rational[] | Rational[][]} b - Second non-empty 1D vector or rectangular 2D matrix of exact rationals.
 * @returns {Rational[] | Rational[][]} The exact Kronecker/tensor product `a ⊗ b` in lowest terms.
 * @throws {TypeError} If either operand is not an array, mixes rows and scalars, or contains invalid rational entries.
 * @throws {RangeError} If either operand is empty, contains empty rows, is non-rectangular, or has a zero denominator.
 */
export function tensorProductRationalIterative(a, b) {
	const left = parseOperand(a, 'a')
	const right = parseOperand(b, 'b')

	const outRows = left.rows * right.rows
	const outCols = left.cols * right.cols
	const result = new Array(outRows)

	for (let i = 0; i < left.rows; i++) {
		const leftRow = left.data[i]
		const rowOffset = i * right.rows
		for (let r = 0; r < right.rows; r++) {
			const rightRow = right.data[r]
			const outRow = new Array(outCols)
			for (let j = 0; j < left.cols; j++) {
				const leftVal = leftRow[j]
				const colOffset = j * right.cols
				for (let c = 0; c < right.cols; c++) {
					outRow[colOffset + c] = multiplyNormalized(leftVal, rightRow[c])
				}
			}
			result[rowOffset + r] = outRow
		}
	}

	return left.isVector && right.isVector ? result[0] : result
}
