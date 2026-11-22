/**
 * Compute the greatest common divisor of two non-negative BigInts
 * using the iterative Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative BigInt.
 * @param {bigint} b - Non-negative BigInt.
 * @returns {bigint} Greatest common divisor of `a` and `b`.
 */
function gcdBigInt(a, b) {
	let x = a
	let y = b
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Validate and normalize a single exact rational `{ num: bigint, den: bigint }`
 * into lowest terms with `den > 0n`, `gcd(|num|, den) === 1n`, and zero as
 * `{ num: 0n, den: 1n }`.
 *
 * @param {unknown} entry - Candidate rational object.
 * @param {number} row - Row index for error reporting.
 * @param {number} col - Column index for error reporting.
 * @returns {{ num: bigint, den: bigint }} Normalized rational in lowest terms.
 * @throws {TypeError} If `entry` is not an object with `bigint` `num` and `den`.
 * @throws {RangeError} If `entry.den === 0n`.
 */
function normalizeRational(entry, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must be a rational object { num: bigint, den: bigint }`,
		)
	}

	const { num: rawNum, den: rawDen } = entry
	if (typeof rawNum !== 'bigint' || typeof rawDen !== 'bigint') {
		throw new TypeError(
			`Matrix entry at [${row}][${col}] must have bigint num and den properties`,
		)
	}

	if (rawDen === 0n) {
		throw new RangeError(`Matrix entry at [${row}][${col}] has zero denominator`)
	}

	if (rawNum === 0n) {
		return { num: 0n, den: 1n }
	}

	const num = rawDen < 0n ? -rawNum : rawNum
	const den = rawDen < 0n ? -rawDen : rawDen
	const absNum = num < 0n ? -num : num
	const divisor = gcdBigInt(absNum, den)

	return {
		num: num / divisor,
		den: den / divisor,
	}
}

/**
 * Recursively transpose a rectangular sub-block of `source` into `target`
 * using divide-and-conquer splitting along the larger dimension down to
 * 1x1 base cases (cache-oblivious block transpose).
 *
 * @param {Array<Array<{ num: bigint, den: bigint }>>} source - Input m x n matrix.
 * @param {Array<Array<{ num: bigint, den: bigint }>>} target - Preallocated n x m output matrix.
 * @param {number} rowStart - Starting row index in `source`.
 * @param {number} rowCount - Number of rows in the current sub-block.
 * @param {number} colStart - Starting column index in `source`.
 * @param {number} colCount - Number of columns in the current sub-block.
 */
function transposeBlockRecursive(
	source,
	target,
	rowStart,
	rowCount,
	colStart,
	colCount,
) {
	if (rowCount === 1 && colCount === 1) {
		target[colStart][rowStart] = normalizeRational(
			source[rowStart][colStart],
			rowStart,
			colStart,
		)
		return
	}

	if (rowCount >= colCount) {
		const mid = Math.floor(rowCount / 2)
		transposeBlockRecursive(source, target, rowStart, mid, colStart, colCount)
		transposeBlockRecursive(
			source,
			target,
			rowStart + mid,
			rowCount - mid,
			colStart,
			colCount,
		)
	} else {
		const mid = Math.floor(colCount / 2)
		transposeBlockRecursive(source, target, rowStart, rowCount, colStart, mid)
		transposeBlockRecursive(
			source,
			target,
			rowStart,
			rowCount,
			colStart + mid,
			colCount - mid,
		)
	}
}

/**
 * Compute the transpose of a rectangular matrix of exact rationals
 * `{ num: bigint, den: bigint }` using recursive divide-and-conquer
 * block splitting.
 *
 * Algorithm:
 * 1. Validates that `matrix` is an Array of equal-length Array rows.
 *    Empty matrices `[]` (0 x 0) and zero-column rectangular matrices such as
 *    `[[]]` or `[[], []]` (m x 0) return `[]` (0 x m).
 * 2. Allocates the `n x m` output matrix and invokes a cache-oblivious
 *    divide-and-conquer recursion that splits the current sub-block along its
 *    larger dimension until reaching `1 x 1` base cases.
 * 3. At each `1 x 1` base case, validates the rational entry, normalizes it to
 *    lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`),
 *    and writes the fresh rational object into `result[col][row]`.
 *
 * The input matrix and its rational objects are never mutated.
 *
 * @param {Array<Array<{ num: bigint, den: bigint }>>} matrix - Rectangular m x n matrix of exact rationals.
 * @returns {Array<Array<{ num: bigint, den: bigint }>>} Transposed n x m matrix with every rational in lowest terms.
 * @throws {TypeError} If `matrix` is not an Array, any row is not an Array, or any entry is not `{ num: bigint, den: bigint }`.
 * @throws {RangeError} If `matrix` is ragged (rows of unequal length) or any entry has `den === 0n`.
 */
export function transposeRationalRecursive(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Matrix must be an Array of row Arrays')
	}

	const rowCount = matrix.length
	if (rowCount === 0) {
		return []
	}

	if (!Array.isArray(matrix[0])) {
		throw new TypeError('Matrix row 0 must be an Array')
	}

	const colCount = matrix[0].length
	for (let r = 1; r < rowCount; r++) {
		if (!Array.isArray(matrix[r])) {
			throw new TypeError(`Matrix row ${r} must be an Array`)
		}
		if (matrix[r].length !== colCount) {
			throw new RangeError(
				`Matrix must be rectangular: row 0 has length ${colCount}, but row ${r} has length ${matrix[r].length}`,
			)
		}
	}

	if (colCount === 0) {
		return []
	}

	const result = Array.from({ length: colCount }, () => new Array(rowCount))
	transposeBlockRecursive(matrix, result, 0, rowCount, 0, colCount)
	return result
}
