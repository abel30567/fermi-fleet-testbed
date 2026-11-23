/**
 * @fileoverview Interval arithmetic matrix transpose over IEEE-754 binary64
 * closed intervals `[lo, hi]` with outward-rounding enclosure guarantees.
 *
 * Uses the exact closed-form transpose identity `(A^T)[j][i] = A[i][j]`
 * (equivalent to the canonical basis expansion
 * `A^T = sum_{i=0}^{m-1} sum_{j=0}^{n-1} e_j * A[i][j] * e_i^T`).
 *
 * Because permuting already-represented IEEE-754 binary64 endpoints introduces
 * zero arithmetic rounding error, directed outward rounding on each endpoint
 * is exact (`roundDown(lo) = lo`, `roundUp(hi) = hi`), guaranteeing:
 * - Enclosure: for every point matrix `P` in `A`, `P^T` is in `A^T`.
 * - Tightness: zero spurious interval inflation.
 * - Involution: `(A^T)^T = A`.
 *
 * Optional explicit ULP outward padding (`options.ulpPadding`) is also
 * supported via exact IEEE-754 binary64 `nextDown` / `nextUp` bit stepping.
 */

const _buf = new ArrayBuffer(8)
const _f64 = new Float64Array(_buf)
const _u64 = new BigUint64Array(_buf)

/**
 * Returns the least IEEE-754 binary64 number strictly greater than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x
	if (x === -Infinity) return -Number.MAX_VALUE
	if (x === 0) return Number.MIN_VALUE

	_f64[0] = x
	if (x > 0) {
		_u64[0] += 1n
	} else {
		_u64[0] -= 1n
		if (_f64[0] === 0) return 0
	}
	return _f64[0]
}

/**
 * Returns the greatest IEEE-754 binary64 number strictly less than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	const result = -nextUp(-x)
	return result === 0 ? 0 : result
}

/**
 * Outward-rounds a validated closed interval `[lo, hi]` by `ulpPadding` ULPs.
 * When `ulpPadding === 0`, the exact endpoints are preserved (0-ULP tight
 * outward enclosure).
 *
 * @param {number} lo
 * @param {number} hi
 * @param {number} ulpPadding
 * @returns {[number, number]}
 */
function outwardRoundInterval(lo, hi, ulpPadding) {
	let outLo = lo
	let outHi = hi
	for (let k = 0; k < ulpPadding; k++) {
		outLo = nextDown(outLo)
		outHi = nextUp(outHi)
	}
	return [outLo, outHi]
}

/**
 * Validates `options` and returns the normalized `ulpPadding` count.
 *
 * @param {unknown} options
 * @returns {number}
 */
function parseOptions(options) {
	if (options === undefined) return 0
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object when provided')
	}
	const { ulpPadding = 0 } = options
	if (typeof ulpPadding !== 'number') {
		throw new TypeError('options.ulpPadding must be a non-negative safe integer')
	}
	if (!Number.isSafeInteger(ulpPadding) || ulpPadding < 0) {
		throw new RangeError('options.ulpPadding must be a non-negative safe integer')
	}
	return ulpPadding
}

/**
 * Validates an interval matrix `A` of shape `m x n` where every entry is a
 * finite closed interval `[lo, hi]` with `lo <= hi`.
 *
 * @param {unknown} matrix
 * @returns {{ rows: number, cols: number }}
 */
function validateIntervalMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of [lo, hi] interval pairs')
	}
	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError('matrix must have at least one row')
	}

	let cols = -1
	for (let i = 0; i < rows; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array of [lo, hi] interval pairs`)
		}
		if (i === 0) {
			cols = row.length
			if (cols === 0) {
				throw new RangeError('matrix rows must have at least one column')
			}
		} else if (row.length !== cols) {
			throw new RangeError(
				`matrix must be rectangular: row ${i} has length ${row.length}, expected ${cols}`,
			)
		}

		for (let j = 0; j < cols; j++) {
			const cell = row[j]
			if (!Array.isArray(cell)) {
				throw new TypeError(`matrix[${i}][${j}] must be a [lo, hi] array`)
			}
			if (cell.length !== 2) {
				throw new RangeError(
					`matrix[${i}][${j}] must have length 2, got ${cell.length}`,
				)
			}
			const [lo, hi] = cell
			if (typeof lo !== 'number' || typeof hi !== 'number') {
				throw new TypeError(
					`matrix[${i}][${j}] endpoints must be numbers`,
				)
			}
			if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
				throw new RangeError(
					`matrix[${i}][${j}] endpoints must be finite numbers`,
				)
			}
			if (lo > hi) {
				throw new RangeError(
					`matrix[${i}][${j}] is an invalid interval: lo (${lo}) > hi (${hi})`,
				)
			}
		}
	}

	return { rows, cols }
}

/**
 * Computes the matrix transpose of an interval matrix over `[lo, hi]` with
 * outward rounding guaranteeing enclosure.
 *
 * For an `m x n` interval matrix `A`, returns an `n x m` interval matrix `A^T`
 * whose `(j, i)` entry encloses `A[i][j]` using the closed-form transpose
 * identity `(A^T)[j][i] = A[i][j]`. Returned interval tuples are freshly
 * allocated so callers cannot alias or mutate the input matrix.
 *
 * @param {Array<Array<[number, number]>>} matrix
 *   Non-empty rectangular `m x n` matrix of finite `[lo, hi]` intervals with `lo <= hi`.
 * @param {{ ulpPadding?: number }} [options]
 *   Optional settings.
 * @param {number} [options.ulpPadding=0]
 *   Non-negative integer number of outward IEEE-754 ULPs to widen each
 *   endpoint (`nextDown` on `lo`, `nextUp` on `hi`). Defaults to `0` for
 *   exact (0-ULP) outward enclosure.
 * @returns {Array<Array<[number, number]>>}
 *   Transposed `n x m` interval matrix enclosing the exact transpose.
 * @throws {TypeError} If `matrix`, any row, any interval, any endpoint, or `options` has an invalid type.
 * @throws {RangeError} If `matrix` is empty, jagged, has non-finite endpoints, inverted intervals (`lo > hi`), or invalid `ulpPadding`.
 */
export function transposeIntervalSeries(matrix, options = undefined) {
	const ulpPadding = parseOptions(options)
	const { rows, cols } = validateIntervalMatrix(matrix)

	const result = new Array(cols)
	for (let j = 0; j < cols; j++) {
		const outRow = new Array(rows)
		for (let i = 0; i < rows; i++) {
			const [lo, hi] = matrix[i][j]
			outRow[i] = outwardRoundInterval(lo, hi, ulpPadding)
		}
		result[j] = outRow
	}

	return result
}
