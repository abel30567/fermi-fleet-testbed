/**
 * Validates that an operand is either a non-empty 1D BigInt vector or a
 * non-empty rectangular 2D BigInt matrix.
 *
 * @param {unknown} value - Candidate operand.
 * @param {string} name - Parameter name for error diagnostics.
 * @returns {{ rank: 1 | 2, rows: number, cols: number }} Shape metadata.
 */
function validateOperand(value, name) {
	if (!Array.isArray(value)) {
		throw new TypeError(`${name} must be a 1D or 2D array of BigInt values`)
	}
	if (value.length === 0) {
		throw new RangeError(`${name} must not be empty`)
	}

	const first = value[0]
	if (typeof first === 'bigint') {
		for (let i = 1; i < value.length; i++) {
			if (typeof value[i] !== 'bigint') {
				throw new TypeError(`${name}[${i}] must be a BigInt`)
			}
		}
		return { rank: 1, rows: value.length, cols: 0 }
	}

	if (Array.isArray(first)) {
		const cols = first.length
		if (cols === 0) {
			throw new RangeError(`${name} rows must not be empty`)
		}
		for (let i = 0; i < value.length; i++) {
			const row = value[i]
			if (!Array.isArray(row)) {
				throw new TypeError(`${name}[${i}] must be an array of BigInt values`)
			}
			if (row.length !== cols) {
				throw new RangeError(
					`${name} must be a rectangular matrix (row ${i} has length ${row.length}, expected ${cols})`,
				)
			}
			for (let j = 0; j < cols; j++) {
				if (typeof row[j] !== 'bigint') {
					throw new TypeError(`${name}[${i}][${j}] must be a BigInt`)
				}
			}
		}
		return { rank: 2, rows: value.length, cols }
	}

	throw new TypeError(`${name}[0] must be a BigInt or an array of BigInt values`)
}

/**
 * Computes the exact BigInt Kronecker (tensor) product `a ⊗ b`.
 *
 * Uses the closed-form coordinate / basis-unit expansion identity:
 * - For 2D matrices `A` (m × n) and `B` (p × q):
 *     `A ⊗ B = Σ_{i=0}^{m-1} Σ_{j=0}^{n-1} A[i][j] · (E_{i,j} ⊗ B)`
 *   producing an `(m · p) × (n · q)` matrix with exact entries
 *     `(A ⊗ B)[i · p + r][j · q + s] = A[i][j] · B[r][s]`.
 * - For 1D vectors `u` (length m) and `v` (length n):
 *     `u ⊗ v = Σ_{i=0}^{m-1} u[i] · (e_i ⊗ v)`
 *   producing a vector of length `m · n` with exact entries
 *     `(u ⊗ v)[i · n + r] = u[i] · v[r]`.
 *
 * Because the integers are closed under multiplication, all outputs are exact
 * `bigint` values with arbitrary precision (no floating-point or fixed-point
 * rounding error).
 *
 * @param {readonly bigint[] | readonly (readonly bigint[])[]} a
 *   First operand: a non-empty 1D vector or non-empty rectangular 2D matrix of `bigint`s.
 * @param {readonly bigint[] | readonly (readonly bigint[])[]} b
 *   Second operand: must match the rank of `a` (both 1D vectors or both 2D matrices of `bigint`s).
 * @returns {bigint[] | bigint[][]}
 *   The exact `bigint` Kronecker/tensor product `a ⊗ b`.
 * @throws {TypeError} If either operand is not an array, contains non-`bigint` elements,
 *   has rank > 2, or the two operands have mismatched ranks.
 * @throws {RangeError} If either operand is empty or is a ragged 2D matrix.
 */
export function tensorProductBigIntSeries(a, b) {
	const infoA = validateOperand(a, 'a')
	const infoB = validateOperand(b, 'b')

	if (infoA.rank !== infoB.rank) {
		throw new TypeError(
			`Operands must have matching rank (got ${infoA.rank}D and ${infoB.rank}D)`,
		)
	}

	if (infoA.rank === 1) {
		const m = infoA.rows
		const n = infoB.rows
		const result = new Array(m * n)
		for (let i = 0; i < m; i++) {
			const ai = a[i]
			const base = i * n
			for (let r = 0; r < n; r++) {
				result[base + r] = ai * b[r]
			}
		}
		return result
	}

	const m = infoA.rows
	const n = infoA.cols
	const p = infoB.rows
	const q = infoB.cols
	const result = new Array(m * p)

	for (let i = 0; i < m; i++) {
		const aRow = a[i]
		const rowBase = i * p
		for (let r = 0; r < p; r++) {
			const bRow = b[r]
			const outRow = new Array(n * q)
			for (let j = 0; j < n; j++) {
				const aij = aRow[j]
				const colBase = j * q
				for (let s = 0; s < q; s++) {
					outRow[colBase + s] = aij * bRow[s]
				}
			}
			result[rowBase + r] = outRow
		}
	}

	return result
}
