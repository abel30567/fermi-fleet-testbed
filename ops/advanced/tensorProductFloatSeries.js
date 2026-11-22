/**
 * Computes the tensor / Kronecker product `A ⊗ B` over IEEE-754 float64 numbers.
 *
 * Mathematical definition & identities used:
 * - **Scalars (rank 0)**: `α ⊗ β = α · β`, and scalar-tensor scaling
 *   `(α ⊗ B)_{j} = α · B_{j}`, `(A ⊗ β)_{i} = A_{i} · β`.
 * - **1D vectors (`A ∈ ℝ^m`, `B ∈ ℝ^n`)**: Outer product matrix `A ⊗ B ∈ ℝ^{m × n}`
 *   via the bilinear identity `(A ⊗ B)_{i,j} = A_i · B_j`.
 * - **2D matrices (`A ∈ ℝ^{m × n}`, `B ∈ ℝ^{p × q}`)**: Kronecker product block matrix
 *   `A ⊗ B ∈ ℝ^{(mp) × (nq)}` via the closed-form block index identity
 *   `(A ⊗ B)_{i·p + k, j·q + l} = A_{i,j} · B_{k,l}` (equivalently
 *   `A_{⌊r/p⌋, ⌊c/q⌋} · B_{r mod p, c mod q}`), satisfying the mixed-product property
 *   `(A ⊗ B)(C ⊗ D) = (AC) ⊗ (BD)` and trace multiplicativity `tr(A ⊗ B) = tr(A) · tr(B)`.
 * - **Arbitrary nested finite float64 tensors** (mixed ranks or rank ≥ 3):
 *   Recursive multilinearity identity `(A ⊗ B)_{i_1,…,i_r, j_1,…,j_s} = A_{i_1,…,i_r} · B_{j_1,…,j_s}`,
 *   producing shape `[...shape(A), ...shape(B)]`.
 *
 * Negative zero (`-0`) products are normalized to `+0` for algebraic consistency.
 * Inputs are never mutated and the returned tensor does not alias input arrays.
 *
 * @param {number | number[] | number[][] | Array} a - Left operand: finite IEEE-754 float64 number
 *   or rectangular nested array of finite float64 numbers.
 * @param {number | number[] | number[][] | Array} b - Right operand: finite IEEE-754 float64 number
 *   or rectangular nested array of finite float64 numbers.
 * @returns {number | number[] | number[][] | Array} The tensor / Kronecker product `a ⊗ b`.
 * @throws {TypeError} If `a` or `b` (or any nested entry) is not a number or Array, or contains sparse holes.
 * @throws {RangeError} If any entry is non-finite (`NaN`, `±Infinity`), if an array is ragged
 *   (inconsistent shape/depth), or if an array contains circular references.
 */
export function tensorProductFloatSeries(a, b) {
	const shapeA = validateAndGetShape(a, 'a', new Set())
	const shapeB = validateAndGetShape(b, 'b', new Set())

	const rankA = shapeA.length
	const rankB = shapeB.length

	// 2D × 2D: canonical Kronecker product block matrix of shape [m * p, n * q].
	if (rankA === 2 && rankB === 2) {
		return kronecker2D(a, b, shapeA[0], shapeA[1], shapeB[0], shapeB[1])
	}

	// All other rank combinations (0D, 1D×1D outer product, mixed ranks, higher-rank tensors):
	// recursive multilinearity identity (A ⊗ B)_{i,...} = A_i ⊗ B.
	return outerRecursive(a, b)
}

/**
 * Normalizes IEEE-754 `-0` to `+0` while preserving all other float64 values bit-for-bit.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates that `value` is either a finite IEEE-754 float64 number or a rectangular
 * (non-ragged, non-sparse, acyclic) nested array of finite float64 numbers, and returns its shape.
 *
 * @param {unknown} value
 * @param {string} name
 * @param {Set<Array>} visiting
 * @returns {number[]} Tensor shape (`[]` for scalar, `[n]` for 1D vector, `[m, n]` for 2D matrix, etc.)
 */
function validateAndGetShape(value, name, visiting) {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new RangeError(`${name} must contain only finite IEEE-754 float64 numbers`)
		}
		return []
	}

	if (!Array.isArray(value)) {
		throw new TypeError(`${name} must be a finite float64 number or nested array of finite float64 numbers`)
	}

	if (visiting.has(value)) {
		throw new RangeError(`${name} must not contain circular array references`)
	}

	visiting.add(value)
	try {
		const len = value.length
		if (len === 0) {
			return [0]
		}

		if (!(0 in value)) {
			throw new TypeError(`${name} must not contain sparse array holes`)
		}

		const firstSubShape = validateAndGetShape(value[0], name, visiting)

		for (let i = 1; i < len; i++) {
			if (!(i in value)) {
				throw new TypeError(`${name} must not contain sparse array holes`)
			}

			const subShape = validateAndGetShape(value[i], name, visiting)
			if (subShape.length !== firstSubShape.length) {
				throw new RangeError(`${name} must be a rectangular (non-ragged) tensor`)
			}
			for (let d = 0; d < firstSubShape.length; d++) {
				if (subShape[d] !== firstSubShape[d]) {
					throw new RangeError(`${name} must be a rectangular (non-ragged) tensor`)
				}
			}
		}

		return [len, ...firstSubShape]
	} finally {
		visiting.delete(value)
	}
}

/**
 * Computes the 2D Kronecker product block matrix `A ⊗ B` using the closed-form
 * block index mapping `(A ⊗ B)[i * p + k][j * q + l] = A[i][j] * B[k][l]`.
 *
 * @param {number[][]} a
 * @param {number[][]} b
 * @param {number} m - Row count of `a`.
 * @param {number} n - Column count of `a`.
 * @param {number} p - Row count of `b`.
 * @param {number} q - Column count of `b`.
 * @returns {number[][]}
 */
function kronecker2D(a, b, m, n, p, q) {
	const outRows = m * p
	const outCols = n * q
	const result = new Array(outRows)

	for (let i = 0; i < m; i++) {
		const rowA = a[i]
		const rowOffset = i * p
		for (let k = 0; k < p; k++) {
			const rowB = b[k]
			const outRow = new Array(outCols)
			for (let j = 0; j < n; j++) {
				const aij = rowA[j]
				const colOffset = j * q
				for (let l = 0; l < q; l++) {
					outRow[colOffset + l] = normalizeZero(aij * rowB[l])
				}
			}
			result[rowOffset + k] = outRow
		}
	}

	return result
}

/**
 * Recursively computes the outer tensor product `(A ⊗ B)_{i,...} = A_i ⊗ B`.
 *
 * @param {number | Array} a
 * @param {number | Array} b
 * @returns {number | Array}
 */
function outerRecursive(a, b) {
	if (typeof a === 'number') {
		return scaleTensor(a, b)
	}

	const len = a.length
	const out = new Array(len)
	for (let i = 0; i < len; i++) {
		out[i] = outerRecursive(a[i], b)
	}
	return out
}

/**
 * Scales a scalar or nested float64 tensor `t` by a scalar `scalar`, returning a fresh structure.
 *
 * @param {number} scalar
 * @param {number | Array} t
 * @returns {number | Array}
 */
function scaleTensor(scalar, t) {
	if (typeof t === 'number') {
		return normalizeZero(scalar * t)
	}

	const len = t.length
	const out = new Array(len)
	for (let i = 0; i < len; i++) {
		out[i] = scaleTensor(scalar, t[i])
	}
	return out
}
