/**
 * Bit-length threshold below which Karatsuba multiplication falls back to
 * native BigInt multiplication.
 */
const KARATSUBA_THRESHOLD_BITS = 256

/**
 * Computes the bit length of a non-negative BigInt.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {number} Number of bits required to represent `n` (0 for `0n`).
 */
function bitLength(n) {
	if (n === 0n) return 0
	const hex = n.toString(16)
	const leadBits = 32 - Math.clz32(Number.parseInt(hex[0], 16))
	return (hex.length - 1) * 4 + leadBits
}

/**
 * Recursive Karatsuba divide-and-conquer multiplication for non-negative BigInts.
 *
 * @param {bigint} x - Non-negative BigInt.
 * @param {bigint} y - Non-negative BigInt.
 * @returns {bigint} Exact product `x * y`.
 */
function karatsubaAbs(x, y) {
	if (x === 0n || y === 0n) return 0n
	const maxBits = Math.max(bitLength(x), bitLength(y))
	if (maxBits <= KARATSUBA_THRESHOLD_BITS) {
		return x * y
	}

	const half = BigInt(maxBits >> 1)
	const mask = (1n << half) - 1n

	const x0 = x & mask
	const x1 = x >> half
	const y0 = y & mask
	const y1 = y >> half

	const z0 = karatsubaAbs(x0, y0)
	const z2 = karatsubaAbs(x1, y1)
	const z1 = karatsubaAbs(x0 + x1, y0 + y1) - z2 - z0

	return (z2 << (2n * half)) + (z1 << half) + z0
}

/**
 * Exact signed BigInt multiplication via recursive Karatsuba divide-and-conquer.
 *
 * @param {bigint} x - First factor.
 * @param {bigint} y - Second factor.
 * @returns {bigint} Exact product `x * y`.
 */
function mulDivideAndConquer(x, y) {
	if (x === 0n || y === 0n) return 0n
	const negative = (x < 0n) !== (y < 0n)
	const ax = x < 0n ? -x : x
	const ay = y < 0n ? -y : y
	const product = karatsubaAbs(ax, ay)
	return negative ? -product : product
}

/**
 * Recursively omits column `skipCol` from a row over index range `[start, end)`.
 *
 * @param {readonly bigint[]} row - Source row.
 * @param {number} skipCol - Column index to omit.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {bigint[]} Sub-row without column `skipCol`.
 */
function omitColInRow(row, skipCol, start, end) {
	if (start >= end) return []
	if (end - start === 1) {
		return start === skipCol ? [] : [row[start]]
	}
	const mid = (start + end) >> 1
	return [
		...omitColInRow(row, skipCol, start, mid),
		...omitColInRow(row, skipCol, mid, end),
	]
}

/**
 * Recursively constructs the minor matrix formed by omitting `skipRow` and
 * `skipCol` over row index range `[startRow, endRow)`.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Source matrix.
 * @param {number} skipRow - Row index to omit (or -1 to keep all rows).
 * @param {number} skipCol - Column index to omit.
 * @param {number} startRow - Inclusive start row index.
 * @param {number} endRow - Exclusive end row index.
 * @returns {bigint[][]} Minor matrix.
 */
function buildMinor(matrix, skipRow, skipCol, startRow, endRow) {
	if (startRow >= endRow) return []
	if (endRow - startRow === 1) {
		if (startRow === skipRow) return []
		const row = matrix[startRow]
		return [omitColInRow(row, skipCol, 0, row.length)]
	}
	const mid = (startRow + endRow) >> 1
	return [
		...buildMinor(matrix, skipRow, skipCol, startRow, mid),
		...buildMinor(matrix, skipRow, skipCol, mid, endRow),
	]
}

/**
 * Divide-and-conquer sum of Laplace cofactor terms along row 0 over column
 * range `[startCol, endCol)`.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Square BigInt matrix.
 * @param {number} startCol - Inclusive start column index.
 * @param {number} endCol - Exclusive end column index.
 * @returns {bigint} Partial cofactor sum.
 */
function expandCofactors(matrix, startCol, endCol) {
	if (endCol - startCol === 1) {
		const col = startCol
		const minor = buildMinor(matrix, 0, col, 1, matrix.length)
		const cofactor = mulDivideAndConquer(matrix[0][col], detRecursive(minor))
		return col % 2 === 0 ? cofactor : -cofactor
	}
	const mid = (startCol + endCol) >> 1
	return (
		expandCofactors(matrix, startCol, mid) +
		expandCofactors(matrix, mid, endCol)
	)
}

/**
 * Computes the exact determinant of a square BigInt matrix via recursive
 * Laplace cofactor expansion.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Square `m x m` BigInt matrix.
 * @returns {bigint} Exact determinant.
 */
function detRecursive(matrix) {
	const m = matrix.length
	if (m === 0) return 1n
	if (m === 1) return matrix[0][0]
	return expandCofactors(matrix, 0, m)
}

/**
 * Divide-and-conquer computation of the cross-product basis coordinates over
 * column index range `[startCol, endCol)` using the formal 3x3 determinant:
 *   `(a x b)_k = (-1)^k * det(M_k)`
 * where `M_k` is the 2x2 minor formed by deleting column `k` from `[a, b]`.
 *
 * @param {readonly [readonly bigint[], readonly bigint[]]} rows - `[a, b]`.
 * @param {number} startCol - Inclusive start coordinate index.
 * @param {number} endCol - Exclusive end coordinate index.
 * @returns {bigint[]} Slice of cross-product coordinates.
 */
function computeComponents(rows, startCol, endCol) {
	if (endCol - startCol === 1) {
		const col = startCol
		const minor = buildMinor(rows, -1, col, 0, rows.length)
		const det = detRecursive(minor)
		return [col % 2 === 0 ? det : -det]
	}
	const mid = (startCol + endCol) >> 1
	return [
		...computeComponents(rows, startCol, mid),
		...computeComponents(rows, mid, endCol),
	]
}

/**
 * Validates that an argument is a 3-dimensional vector of exact BigInts.
 *
 * @param {unknown} vec - Candidate vector.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `vec` is not an Array or contains non-BigInt elements.
 * @throws {RangeError} If `vec.length !== 3`.
 */
function validateVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an Array of 3 BigInts`)
	}
	if (vec.length !== 3) {
		throw new RangeError(
			`${name} must be a 3-dimensional vector (received length ${vec.length})`,
		)
	}
	for (let i = 0; i < 3; i++) {
		if (typeof vec[i] !== 'bigint') {
			throw new TypeError(`${name}[${i}] must be a BigInt`)
		}
	}
}

/**
 * Computes the exact 3D vector cross product `a × b` over BigInt integers using
 * a recursive / divide-and-conquer formulation.
 *
 * Scaling: Because the cross product of integer vectors always yields exact
 * integer components (`a_i * b_j - a_j * b_i`), the result is returned directly
 * as unscaled exact BigInt integers (no fixed-point scaling required).
 *
 * Algorithm:
 * 1. Divide-and-conquer over the 3 basis coordinate indices `[0, 3)` to evaluate
 *    the formal determinant `det([e_0, e_1, e_2; a; b])`, where coordinate `k`
 *    is `(-1)^k * det(M_k)`.
 * 2. Recursive divide-and-conquer minor construction and recursive Laplace
 *    cofactor expansion (`detRecursive`) down to `1×1` base cases.
 * 3. Exact BigInt products computed with recursive Karatsuba divide-and-conquer
 *    multiplication for operands exceeding 256 bits.
 *
 * @param {readonly [bigint, bigint, bigint]} a - First 3D BigInt vector.
 * @param {readonly [bigint, bigint, bigint]} b - Second 3D BigInt vector.
 * @returns {[bigint, bigint, bigint]} Exact cross product vector `a × b`.
 * @throws {TypeError} If `a` or `b` is not an Array or any coordinate is not a BigInt.
 * @throws {RangeError} If `a` or `b` does not have length 3.
 */
export function crossProductBigIntRecursive(a, b) {
	validateVector3(a, 'a')
	validateVector3(b, 'b')
	return computeComponents([a, b], 0, 3)
}
