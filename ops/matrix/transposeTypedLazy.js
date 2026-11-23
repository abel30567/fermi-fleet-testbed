/**
 * Lazily transposes a 2D matrix represented as an iterable of {@link Float64Array} rows,
 * yielding each transposed row (column of the input matrix) as a new {@link Float64Array}.
 *
 * Input consumption is deferred until iteration begins on the returned generator.
 * Output rows are then allocated and yielded one column at a time on demand.
 *
 * @param {Iterable<Float64Array>} rows - An iterable sequence of equal-length `Float64Array` rows.
 * @returns {Generator<Float64Array, void, undefined>} A generator yielding transposed `Float64Array` rows.
 * @throws {TypeError} If `rows` is not a valid iterable of `Float64Array` rows (e.g., primitive, `null`,
 *   non-iterable object, or a bare `TypedArray`/`DataView`), or if any yielded row is not a `Float64Array`.
 * @throws {RangeError} If the input rows do not all have the same length (ragged matrix).
 */
export function transposeTypedLazy(rows) {
	if (
		rows === null ||
		rows === undefined ||
		typeof rows !== 'object' ||
		ArrayBuffer.isView(rows) ||
		typeof rows[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('Expected an iterable of Float64Array rows')
	}

	return transposeGenerator(rows)
}

/**
 * Internal generator performing deferred consumption, validation, and column-by-column streaming.
 *
 * @param {Iterable<Float64Array>} rows
 * @returns {Generator<Float64Array, void, undefined>}
 */
function* transposeGenerator(rows) {
	const materialized = []
	let expectedCols = -1
	let rowIndex = 0

	for (const row of rows) {
		if (!(row instanceof Float64Array)) {
			throw new TypeError(
				`Row at index ${rowIndex} must be a Float64Array`
			)
		}

		if (expectedCols === -1) {
			expectedCols = row.length
		} else if (row.length !== expectedCols) {
			throw new RangeError(
				`Ragged matrix: row at index ${rowIndex} has length ${row.length}, expected ${expectedCols}`
			)
		}

		materialized.push(row)
		rowIndex++
	}

	const rowCount = materialized.length
	if (rowCount === 0 || expectedCols === 0) {
		return
	}

	for (let col = 0; col < expectedCols; col++) {
		const transposedRow = new Float64Array(rowCount)
		for (let r = 0; r < rowCount; r++) {
			transposedRow[r] = materialized[r][col]
		}
		yield transposedRow
	}
}
