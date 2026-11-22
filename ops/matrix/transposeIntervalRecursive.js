/**
 * @fileoverview Cache-oblivious recursive divide-and-conquer matrix transposition
 * over closed real intervals `[lo, hi]` with outward-rounded enclosure guarantees.
 *
 * Zero dependencies. Designed for Node 22+ ESM.
 */

const _f64Buffer = new ArrayBuffer(8)
const _f64View = new Float64Array(_f64Buffer)
const _u64View = new BigUint64Array(_f64Buffer)

/**
 * Returns the smallest IEEE-754 binary64 number strictly greater than `x`.
 *
 * @param {number} x - A finite IEEE-754 number.
 * @returns {number} The next representable binary64 value toward +Infinity.
 */
function nextUp(x) {
	if (x === 0) {
		return Number.MIN_VALUE
	}
	_f64View[0] = x
	if (x > 0) {
		_u64View[0] += 1n
	} else {
		_u64View[0] -= 1n
	}
	return _f64View[0]
}

/**
 * Returns the largest IEEE-754 binary64 number strictly less than `x`.
 *
 * @param {number} x - A finite IEEE-754 number.
 * @returns {number} The next representable binary64 value toward -Infinity.
 */
function nextDown(x) {
	return -nextUp(-x)
}

/**
 * Clones an interval `[lo, hi]` and optionally widens it outward by `ulps`
 * IEEE-754 binary64 ULPs to preserve a guaranteed enclosure `[outLo, outHi]`
 * satisfying `outLo <= lo <= hi <= outHi`.
 *
 * @param {readonly [number, number]} interval - Valid finite interval `[lo, hi]`.
 * @param {number} ulps - Non-negative integer number of outward ULPs.
 * @returns {[number, number]} Newly allocated interval enclosing `interval`.
 * @throws {RangeError} If outward rounding overflows finite IEEE-754 bounds.
 */
function cloneIntervalOutward(interval, ulps) {
	let lo = interval[0]
	let hi = interval[1]

	for (let step = 0; step < ulps; step++) {
		lo = nextDown(lo)
		hi = nextUp(hi)
		if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
			throw new RangeError(
				`Outward rounding overflowed finite IEEE-754 bounds for interval [${interval[0]}, ${interval[1]}]`,
			)
		}
	}

	return [lo, hi]
}

/**
 * Validates that `matrix` is a non-empty rectangular 2D array of finite
 * intervals `[lo, hi]` with `lo <= hi`.
 *
 * @param {unknown} matrix - Candidate interval matrix.
 * @returns {{ rows: number, cols: number }} Validated matrix dimensions.
 * @throws {TypeError} If the matrix, a row, an interval, or an endpoint has an invalid type.
 * @throws {RangeError} If the matrix is empty, ragged, or contains non-finite/inverted intervals.
 */
function validateIntervalMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of [lo, hi] intervals')
	}
	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	let cols = -1
	for (let r = 0; r < rows; r++) {
		const row = matrix[r]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${r} must be an array`)
		}
		if (r === 0) {
			cols = row.length
			if (cols === 0) {
				throw new RangeError('matrix rows must be non-empty')
			}
		} else if (row.length !== cols) {
			throw new RangeError(
				`matrix must be rectangular: row ${r} has length ${row.length}, expected ${cols}`,
			)
		}

		for (let c = 0; c < cols; c++) {
			const cell = row[c]
			if (!Array.isArray(cell) || cell.length !== 2) {
				throw new TypeError(
					`matrix[${r}][${c}] must be a [lo, hi] interval pair`,
				)
			}
			const [lo, hi] = cell
			if (typeof lo !== 'number' || typeof hi !== 'number') {
				throw new TypeError(
					`matrix[${r}][${c}] endpoints must be numbers`,
				)
			}
			if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
				throw new RangeError(
					`matrix[${r}][${c}] endpoints must be finite numbers`,
				)
			}
			if (lo > hi) {
				throw new RangeError(
					`matrix[${r}][${c}] must satisfy lo <= hi (got [${lo}, ${hi}])`,
				)
			}
		}
	}

	return { rows, cols }
}

/**
 * Validates and resolves optional transposition options.
 *
 * @param {object} [options] - Optional configuration.
 * @param {boolean} [options.outwardRound=false] - If true and `outwardUlps` is omitted, widens each interval outward by 1 ULP.
 * @param {number} [options.outwardUlps] - Non-negative integer ULPs to widen each interval outward.
 * @returns {number} Resolved outward ULP count.
 */
function resolveOutwardUlps(options) {
	if (options === undefined) {
		return 0
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object when provided')
	}

	const { outwardRound, outwardUlps } = options

	if (outwardRound !== undefined && typeof outwardRound !== 'boolean') {
		throw new TypeError('options.outwardRound must be a boolean')
	}

	if (outwardUlps !== undefined) {
		if (typeof outwardUlps !== 'number' || !Number.isFinite(outwardUlps)) {
			throw new TypeError('options.outwardUlps must be a finite number')
		}
		if (!Number.isInteger(outwardUlps) || outwardUlps < 0) {
			throw new RangeError(
				'options.outwardUlps must be a non-negative integer',
			)
		}
		return outwardUlps
	}

	return outwardRound ? 1 : 0
}

/**
 * Cache-oblivious recursive divide-and-conquer block transpose.
 * Repeatedly bisects the larger active dimension until reaching the 1x1 base case.
 *
 * @param {readonly (readonly [number, number][])[]} source - Input `rows x cols` interval matrix.
 * @param {[number, number][][]} target - Preallocated `cols x rows` output interval matrix.
 * @param {number} rowStart - Inclusive starting row index in `source`.
 * @param {number} rowEnd - Exclusive ending row index in `source`.
 * @param {number} colStart - Inclusive starting column index in `source`.
 * @param {number} colEnd - Exclusive ending column index in `source`.
 * @param {number} outwardUlps - Non-negative outward rounding ULP count.
 */
function transposeBlock(
	source,
	target,
	rowStart,
	rowEnd,
	colStart,
	colEnd,
	outwardUlps,
) {
	const rowCount = rowEnd - rowStart
	const colCount = colEnd - colStart

	if (rowCount === 1 && colCount === 1) {
		target[colStart][rowStart] = cloneIntervalOutward(
			source[rowStart][colStart],
			outwardUlps,
		)
		return
	}

	if (rowCount >= colCount) {
		const rowMid = rowStart + Math.floor(rowCount / 2)
		transposeBlock(source, target, rowStart, rowMid, colStart, colEnd, outwardUlps)
		transposeBlock(source, target, rowMid, rowEnd, colStart, colEnd, outwardUlps)
	} else {
		const colMid = colStart + Math.floor(colCount / 2)
		transposeBlock(source, target, rowStart, rowEnd, colStart, colMid, outwardUlps)
		transposeBlock(source, target, rowStart, rowEnd, colMid, colEnd, outwardUlps)
	}
}

/**
 * Transposes an interval matrix using a cache-oblivious recursive
 * divide-and-conquer block algorithm without mutating the input.
 *
 * Each interval `[lo, hi]` at `(i, j)` is cloned to `(j, i)` with an outward
 * enclosure guarantee (`outLo <= lo <= hi <= outHi`). Because transposition
 * introduces no arithmetic rounding error, the default `outwardUlps = 0` yields
 * the tightest exact enclosure `[lo, hi]` and preserves the involution property
 * `(A^T)^T = A`. Passing `{ outwardRound: true }` or `{ outwardUlps: k }`
 * widens every interval outward by `1` or `k` IEEE-754 binary64 ULPs.
 *
 * @param {readonly (readonly [number, number][])[]} matrix - Non-empty rectangular
 *   2D array of finite `[lo, hi]` intervals with `lo <= hi`.
 * @param {object} [options] - Optional outward-rounding settings.
 * @param {boolean} [options.outwardRound=false] - Widen each interval outward by 1 ULP if `outwardUlps` is not set.
 * @param {number} [options.outwardUlps] - Non-negative integer number of outward IEEE-754 ULPs (default `0`).
 * @returns {[number, number][][]} Newly allocated transposed interval matrix of shape `cols x rows`.
 * @throws {TypeError} If `matrix`, a row, an interval, an endpoint, or `options` has an invalid type.
 * @throws {RangeError} If `matrix` is empty, ragged, contains non-finite/inverted intervals, or outward rounding overflows.
 */
export function transposeIntervalRecursive(matrix, options) {
	const { rows, cols } = validateIntervalMatrix(matrix)
	const outwardUlps = resolveOutwardUlps(options)

	const result = Array.from({ length: cols }, () => new Array(rows))
	transposeBlock(matrix, result, 0, rows, 0, cols, outwardUlps)
	return result
}
