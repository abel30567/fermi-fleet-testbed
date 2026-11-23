/**
 * Matrix trace over dual numbers `{ v, d }` carrying a forward-mode derivative
 * alongside the primal value, implemented with precomputed diagonal index
 * tables and a bounded LRU memoization cache.
 *
 * A dual number `{ v, d }` represents `v + d * ε` where `ε² = 0`.
 * For an `n × n` matrix `A` of dual numbers, the trace is:
 * `tr(A) = { v: Σ A[i][i].v, d: Σ A[i][i].d }` for `i = 0 .. n - 1`.
 */

const PRECOMPUTED_MAX_DIM = 32
const MAX_CACHE_SIZE = 1024

/**
 * Precomputed diagonal index tables for matrix dimensions `0..32`.
 * Each entry `PRECOMPUTED_DIAGONALS[n]` holds `[0, 1, ..., n - 1]`.
 * @type {readonly Int32Array[]}
 */
const PRECOMPUTED_DIAGONALS = Object.freeze(
	Array.from({ length: PRECOMPUTED_MAX_DIM + 1 }, (_, n) => {
		const indices = new Int32Array(n)
		for (let i = 0; i < n; i++) {
			indices[i] = i
		}
		return indices
	}),
)

/**
 * Memoized diagonal index tables for dimensions larger than `PRECOMPUTED_MAX_DIM`.
 * @type {Map<number, Int32Array>}
 */
const DYNAMIC_DIAGONAL_CACHE = new Map()

/**
 * Bounded LRU memoization cache mapping canonical diagonal signatures to
 * frozen dual-number trace results `{ v, d }`.
 * @type {Map<string, Readonly<{ v: number, d: number }>>}
 */
const TRACE_MEMO_CACHE = new Map()

/**
 * Table-driven dual arithmetic primitives.
 */
const DUAL_OPS = Object.freeze({
	zero: Object.freeze({ v: 0, d: 0 }),
	/**
	 * @param {{ v: number, d: number }} a
	 * @param {{ v: number, d: number }} b
	 * @returns {{ v: number, d: number }}
	 */
	add(a, b) {
		return {
			v: a.v + b.v,
			d: a.d + b.d,
		}
	},
})

/**
 * Retrieves a precomputed or memoized diagonal index table for dimension `n`.
 *
 * @param {number} n - Matrix dimension (`n >= 0`).
 * @returns {Int32Array}
 */
function getDiagonalIndices(n) {
	if (n <= PRECOMPUTED_MAX_DIM) {
		return PRECOMPUTED_DIAGONALS[n]
	}
	let indices = DYNAMIC_DIAGONAL_CACHE.get(n)
	if (!indices) {
		indices = new Int32Array(n)
		for (let i = 0; i < n; i++) {
			indices[i] = i
		}
		DYNAMIC_DIAGONAL_CACHE.set(n, indices)
	}
	return indices
}

/**
 * Validates that a value is a dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} entry
 * @param {number} row
 * @param {number} col
 */
function assertValidDual(entry, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(
			`matrix[${row}][${col}] must be a dual number object { v, d }`,
		)
	}
	const { v, d } = /** @type {{ v?: unknown, d?: unknown }} */ (entry)
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(
			`matrix[${row}][${col}] must have numeric v and d properties`,
		)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(
			`matrix[${row}][${col}] must have finite v and d values`,
		)
	}
}

/**
 * Validates that `matrix` is a square `n × n` array of valid dual numbers.
 *
 * @param {unknown} matrix
 */
function validateSquareDualMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of dual numbers { v, d }')
	}
	const n = matrix.length
	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`,
			)
		}
		for (let j = 0; j < n; j++) {
			assertValidDual(row[j], i, j)
		}
	}
}

/**
 * Builds a canonical cache key for the diagonal dual entries of a validated
 * `n × n` matrix using its precomputed diagonal index table.
 *
 * @param {Array<Array<{ v: number, d: number }>>} matrix
 * @param {Int32Array} diagIndices
 * @returns {string}
 */
function buildDiagonalKey(matrix, diagIndices) {
	const n = diagIndices.length
	const parts = new Array(n * 2 + 1)
	parts[0] = String(n)
	for (let k = 0; k < n; k++) {
		const idx = diagIndices[k]
		const cell = matrix[idx][idx]
		parts[k * 2 + 1] = cell.v === 0 ? '0' : String(cell.v)
		parts[k * 2 + 2] = cell.d === 0 ? '0' : String(cell.d)
	}
	return parts.join('|')
}

/**
 * Computes the trace of a square matrix of dual numbers `{ v, d }`, carrying
 * forward-mode derivatives alongside primal values, using precomputed diagonal
 * index tables and bounded LRU memoization.
 *
 * @param {Array<Array<{ v: number, d: number }>>} matrix - Square `n × n` matrix
 *   where each element is a dual number `{ v, d }` with finite numeric fields.
 * @returns {{ v: number, d: number }} The dual-number trace `{ v, d }`.
 * @throws {TypeError} If `matrix` is not a 2D array or any entry is not a valid `{ v, d }` object.
 * @throws {RangeError} If `matrix` is non-square or any dual component is non-finite.
 */
export function traceDualMemo(matrix) {
	validateSquareDualMatrix(matrix)

	const n = matrix.length
	if (n === 0) {
		return { v: DUAL_OPS.zero.v, d: DUAL_OPS.zero.d }
	}

	const diagIndices = getDiagonalIndices(n)
	const cacheKey = buildDiagonalKey(matrix, diagIndices)

	const cached = TRACE_MEMO_CACHE.get(cacheKey)
	if (cached !== undefined) {
		// Refresh LRU recency
		TRACE_MEMO_CACHE.delete(cacheKey)
		TRACE_MEMO_CACHE.set(cacheKey, cached)
		return { v: cached.v, d: cached.d }
	}

	let acc = DUAL_OPS.zero
	for (let k = 0; k < n; k++) {
		const idx = diagIndices[k]
		acc = DUAL_OPS.add(acc, matrix[idx][idx])
	}

	const result = Object.freeze({
		v: acc.v === 0 ? 0 : acc.v,
		d: acc.d === 0 ? 0 : acc.d,
	})

	if (TRACE_MEMO_CACHE.size >= MAX_CACHE_SIZE) {
		const oldestKey = TRACE_MEMO_CACHE.keys().next().value
		TRACE_MEMO_CACHE.delete(oldestKey)
	}
	TRACE_MEMO_CACHE.set(cacheKey, result)

	return { v: result.v, d: result.d }
}
