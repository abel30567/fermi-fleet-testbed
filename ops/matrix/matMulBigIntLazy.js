/**
 * Checks whether a value is a non-string iterable object.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isIterableSequence(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value !== 'string' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Materializes and validates a single matrix row of exact BigInt values.
 *
 * @param {unknown} rawRow
 * @param {string} matrixName
 * @param {number} rowIndex
 * @returns {bigint[]}
 */
function readBigIntRow(rawRow, matrixName, rowIndex) {
	if (!isIterableSequence(rawRow)) {
		throw new TypeError(
			`Matrix ${matrixName} row ${rowIndex} must be a non-string iterable of bigint values`,
		)
	}

	const row = []
	let colIndex = 0
	for (const value of rawRow) {
		if (typeof value !== 'bigint') {
			throw new TypeError(
				`Matrix ${matrixName}[${rowIndex}][${colIndex}] must be a bigint, got ${typeof value}`,
			)
		}
		row.push(value)
		colIndex++
	}

	if (row.length === 0) {
		throw new RangeError(`Matrix ${matrixName} row ${rowIndex} must not be empty`)
	}

	return row
}

/**
 * Materializes and validates the right-hand matrix B.
 *
 * @param {Iterable<Iterable<bigint>>} b
 * @returns {{ rows: bigint[][], rowCount: number, colCount: number }}
 */
function materializeMatrixB(b) {
	const rows = []
	let colCount = -1
	let rowIndex = 0

	for (const rawRow of b) {
		const row = readBigIntRow(rawRow, 'B', rowIndex)
		if (colCount === -1) {
			colCount = row.length
		} else if (row.length !== colCount) {
			throw new RangeError(
				`Matrix B is ragged: row ${rowIndex} has length ${row.length}, expected ${colCount}`,
			)
		}
		rows.push(row)
		rowIndex++
	}

	if (rows.length === 0) {
		throw new RangeError('Matrix B must not be empty')
	}

	return { rows, rowCount: rows.length, colCount }
}

/**
 * Lazily multiplies two exact BigInt matrices `A * B`, yielding each output row
 * as a `bigint[]` while streaming rows of `A` one at a time.
 *
 * - Matrix `A` is consumed strictly lazily: row `i` of `A` is pulled only when
 *   row `i` of `A * B` is requested from the returned generator.
 * - Matrix `B` is validated and materialized upfront because computing even the
 *   first output row requires every entry of `B`.
 * - Both matrices and their rows may be any non-string iterables (arrays,
 *   generators, BigInt typed arrays, etc.).
 * - All arithmetic is performed over exact arbitrary-precision `bigint` values.
 *
 * @param {Iterable<Iterable<bigint>>} a Left-hand matrix `A` (m x k), streamed lazily row by row.
 * @param {Iterable<Iterable<bigint>>} b Right-hand matrix `B` (k x n).
 * @returns {Generator<bigint[], void, undefined>} Generator yielding each row (length n) of `A * B`.
 * @throws {TypeError} If `a`, `b`, or any row is not a non-string iterable, or if any entry is not a `bigint`.
 * @throws {RangeError} If either matrix is empty, contains empty or ragged rows, or has incompatible dimensions.
 *
 * @example
 * const rows = [...matMulBigIntLazy([[1n, 2n], [3n, 4n]], [[5n, 6n], [7n, 8n]])]
 * // => [[19n, 22n], [43n, 50n]]
 */
export function matMulBigIntLazy(a, b) {
	if (!isIterableSequence(a)) {
		throw new TypeError('Matrix A must be a non-string iterable of rows')
	}
	if (!isIterableSequence(b)) {
		throw new TypeError('Matrix B must be a non-string iterable of rows')
	}
	if (Array.isArray(a) && a.length === 0) {
		throw new RangeError('Matrix A must not be empty')
	}

	const { rows: bRows, rowCount: kLen, colCount: n } = materializeMatrixB(b)

	return (function* generateProductRows() {
		let rowIndex = 0

		for (const rawRowA of a) {
			const rowA = readBigIntRow(rawRowA, 'A', rowIndex)

			if (rowIndex === 0) {
				if (rowA.length !== kLen) {
					throw new RangeError(
						`Incompatible matrix dimensions: A has ${rowA.length} columns, but B has ${kLen} rows`,
					)
				}
			} else if (rowA.length !== kLen) {
				throw new RangeError(
					`Matrix A is ragged: row ${rowIndex} has length ${rowA.length}, expected ${kLen}`,
				)
			}

			const outRow = new Array(n).fill(0n)
			for (let k = 0; k < kLen; k++) {
				const aik = rowA[k]
				if (aik === 0n) continue
				const bRow = bRows[k]
				for (let j = 0; j < n; j++) {
					outRow[j] += aik * bRow[j]
				}
			}

			rowIndex++
			yield outRow
		}

		if (rowIndex === 0) {
			throw new RangeError('Matrix A must not be empty')
		}
	})()
}
