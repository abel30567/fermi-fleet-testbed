/**
 * Precomputed alternating sign table indexed by parity (0 -> +1n, 1 -> -1n).
 * @type {readonly [bigint, bigint]}
 */
const SIGN_TABLE = Object.freeze([1n, -1n])

/**
 * Precomputed 2x2 Levi-Civita permutation table: [col0, col1, sign].
 * @type {readonly (readonly [number, number, bigint])[]}
 */
const PERMS_2 = Object.freeze([
	Object.freeze([0, 1, 1n]),
	Object.freeze([1, 0, -1n]),
])

/**
 * Precomputed 3x3 Levi-Civita permutation table: [col0, col1, col2, sign].
 * @type {readonly (readonly [number, number, number, bigint])[]}
 */
const PERMS_3 = Object.freeze([
	Object.freeze([0, 1, 2, 1n]),
	Object.freeze([0, 2, 1, -1n]),
	Object.freeze([1, 0, 2, -1n]),
	Object.freeze([1, 2, 0, 1n]),
	Object.freeze([2, 0, 1, 1n]),
	Object.freeze([2, 1, 0, -1n]),
])

/**
 * Precomputed 32-entry De Bruijn lookup table for O(1) trailing-zero bit index
 * of an isolated least-significant set bit.
 */
const DE_BRUIJN_MULT = 0x077cb531
const DE_BRUIJN_CTZ = new Uint8Array(32)
for (let i = 0; i < 32; i++) {
	DE_BRUIJN_CTZ[Math.imul(1 << i, DE_BRUIJN_MULT) >>> 27] = i
}

/** Maximum dimension using bitmask-memoized cofactor expansion before switching to exact Bareiss. */
const BITMASK_DP_MAX_N = 12

/** Maximum dimension eligible for cross-call memoization caching. */
const CACHE_MAX_N = 16

/** Maximum number of entries retained in the cross-call LRU memoization cache. */
const MAX_CACHE_ENTRIES = 1024

/** @type {Map<string, bigint>} */
const resultCache = new Map()

/**
 * Validates that the input is a square 2D array of BigInt entries.
 *
 * @param {unknown} matrix
 * @returns {bigint[][]}
 */
function validateMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of BigInt values')
	}
	const n = matrix.length
	for (let i = 0; i < n; i++) {
		if (!Array.isArray(matrix[i])) {
			throw new TypeError(`matrix row ${i} must be an array`)
		}
	}
	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			)
		}
		for (let j = 0; j < n; j++) {
			if (typeof row[j] !== 'bigint') {
				throw new TypeError(
					`matrix[${i}][${j}] must be a BigInt, got ${typeof row[j]}`
				)
			}
		}
	}
	return /** @type {bigint[][]} */ (matrix)
}

/**
 * Serializes a square BigInt matrix into an unambiguous canonical cache key.
 *
 * @param {bigint[][]} matrix
 * @returns {string}
 */
function buildCacheKey(matrix) {
	const n = matrix.length
	const rowStrings = new Array(n)
	for (let i = 0; i < n; i++) {
		rowStrings[i] = matrix[i].join(',')
	}
	return `${n}:${rowStrings.join(';')}`
}

/**
 * Looks up a cached determinant and refreshes its LRU position on hit.
 *
 * @param {string} key
 * @returns {bigint | undefined}
 */
function cacheGet(key) {
	if (!resultCache.has(key)) {
		return undefined
	}
	const value = resultCache.get(key)
	resultCache.delete(key)
	resultCache.set(key, /** @type {bigint} */ (value))
	return value
}

/**
 * Stores a determinant in the bounded LRU cache.
 *
 * @param {string} key
 * @param {bigint} value
 */
function cacheSet(key, value) {
	if (resultCache.has(key)) {
		resultCache.delete(key)
	} else if (resultCache.size >= MAX_CACHE_ENTRIES) {
		const oldestKey = resultCache.keys().next().value
		if (oldestKey !== undefined) {
			resultCache.delete(oldestKey)
		}
	}
	resultCache.set(key, value)
}

/**
 * Computes the determinant of an n x n matrix (4 <= n <= BITMASK_DP_MAX_N)
 * via Laplace cofactor expansion with per-minor bitmask memoization and
 * De Bruijn bit-index lookup.
 *
 * @param {bigint[][]} matrix
 * @returns {bigint}
 */
function determinantBitmaskMemo(matrix) {
	const n = matrix.length
	const lastTwoRow = n - 2
	/** @type {Map<number, bigint>} */
	const minorMemo = new Map()

	/**
	 * @param {number} row
	 * @param {number} colMask
	 * @returns {bigint}
	 */
	function solve(row, colMask) {
		if (row === lastTwoRow) {
			const lsb0 = colMask & -colMask
			const c0 = DE_BRUIJN_CTZ[Math.imul(lsb0, DE_BRUIJN_MULT) >>> 27]
			const lsb1 = colMask ^ lsb0
			const c1 = DE_BRUIJN_CTZ[Math.imul(lsb1, DE_BRUIJN_MULT) >>> 27]
			return (
				matrix[row][c0] * matrix[row + 1][c1] -
				matrix[row][c1] * matrix[row + 1][c0]
			)
		}

		const cached = minorMemo.get(colMask)
		if (cached !== undefined) {
			return cached
		}

		let det = 0n
		let bits = colMask
		let pos = 0
		const currentRow = matrix[row]

		while (bits !== 0) {
			const lsb = bits & -bits
			const col = DE_BRUIJN_CTZ[Math.imul(lsb, DE_BRUIJN_MULT) >>> 27]
			const entry = currentRow[col]
			if (entry !== 0n) {
				const subDet = solve(row + 1, colMask ^ lsb)
				if (subDet !== 0n) {
					det += SIGN_TABLE[pos & 1] * entry * subDet
				}
			}
			bits ^= lsb
			pos++
		}

		minorMemo.set(colMask, det)
		return det
	}

	return solve(0, (1 << n) - 1)
}

/**
 * Computes the exact BigInt determinant of an n x n matrix using the
 * fraction-free Bareiss elimination algorithm (O(n^3), guaranteed exact
 * divisions with zero remainder).
 *
 * @param {bigint[][]} matrix
 * @returns {bigint}
 */
function determinantBareiss(matrix) {
	const n = matrix.length
	const work = new Array(n)
	for (let i = 0; i < n; i++) {
		work[i] = matrix[i].slice()
	}

	let signParity = 0
	let prevPivot = 1n

	for (let k = 0; k < n - 1; k++) {
		let pivotRow = -1
		for (let i = k; i < n; i++) {
			if (work[i][k] !== 0n) {
				pivotRow = i
				break
			}
		}
		if (pivotRow === -1) {
			return 0n
		}
		if (pivotRow !== k) {
			const tmp = work[k]
			work[k] = work[pivotRow]
			work[pivotRow] = tmp
			signParity ^= 1
		}

		const pivot = work[k][k]
		const pivotRowArr = work[k]

		for (let i = k + 1; i < n; i++) {
			const rowArr = work[i]
			const factor = rowArr[k]
			for (let j = k + 1; j < n; j++) {
				rowArr[j] = (pivot * rowArr[j] - factor * pivotRowArr[j]) / prevPivot
			}
		}

		prevPivot = pivot
	}

	return SIGN_TABLE[signParity] * work[n - 1][n - 1]
}

/**
 * Computes the exact determinant of a square BigInt matrix using a
 * table-driven and memoized implementation:
 * - 0x0 and 1x1 handled directly (det([]) = 1n).
 * - 2x2 and 3x3 evaluated via precomputed Levi-Civita permutation tables.
 * - 4x4 through 12x12 evaluated via column-bitmask memoized cofactor expansion
 *   with a precomputed De Bruijn bit-index table and alternating sign table.
 * - 13x13 and larger evaluated via exact fraction-free Bareiss elimination.
 * - Matrices up to 16x16 are additionally memoized across calls in a bounded LRU cache.
 *
 * Does not mutate the input matrix.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Square 2D array of exact BigInt integers.
 * @returns {bigint} Exact BigInt determinant of the matrix.
 * @throws {TypeError} If `matrix` is not a 2D array of BigInt values.
 * @throws {RangeError} If `matrix` is not square.
 */
export function determinantBigIntMemo(matrix) {
	const validated = validateMatrix(matrix)
	const n = validated.length

	if (n === 0) {
		return 1n
	}
	if (n === 1) {
		return validated[0][0]
	}

	const useCache = n <= CACHE_MAX_N
	const cacheKey = useCache ? buildCacheKey(validated) : ''
	if (useCache) {
		const cached = cacheGet(cacheKey)
		if (cached !== undefined) {
			return cached
		}
	}

	let result
	if (n === 2) {
		result = 0n
		for (let i = 0; i < PERMS_2.length; i++) {
			const [c0, c1, sign] = PERMS_2[i]
			result += sign * validated[0][c0] * validated[1][c1]
		}
	} else if (n === 3) {
		result = 0n
		for (let i = 0; i < PERMS_3.length; i++) {
			const [c0, c1, c2, sign] = PERMS_3[i]
			result += sign * validated[0][c0] * validated[1][c1] * validated[2][c2]
		}
	} else if (n <= BITMASK_DP_MAX_N) {
		result = determinantBitmaskMemo(validated)
	} else {
		result = determinantBareiss(validated)
	}

	if (useCache) {
		cacheSet(cacheKey, result)
	}

	return result
}
