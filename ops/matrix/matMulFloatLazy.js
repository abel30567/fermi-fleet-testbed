/**
 * Checks whether a value is a non-string iterable sequence.
 *
 * @param {unknown} value - Candidate iterable sequence.
 * @returns {boolean} True when `value` implements `[Symbol.iterator]` and is not a string.
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
 * Checks whether a value is a valid top-level matrix iterable (iterable of rows, not a string or TypedArray).
 *
 * @param {unknown} value - Candidate matrix iterable.
 * @returns {boolean} True when `value` can represent a 2D row iterable.
 */
function isMatrixIterable(value) {
	return isIterableSequence(value) && !ArrayBuffer.isView(value)
}

/**
 * Consumes and validates a single numeric row iterable into an array of IEEE-754 float64 numbers.
 *
 * @param {unknown} rawRow - Candidate row iterable.
 * @param {string} matrixName - Parameter name for error reporting (`'a'` or `'b'`).
 * @param {number} rowIndex - Zero-based row index.
 * @param {number} [expectedLength=-1] - Expected column count, or `-1` when establishing the width.
 * @returns {number[]} Validated array of float64 numbers.
 */
function readRow(rawRow, matrixName, rowIndex, expectedLength = -1) {
	if (!isIterableSequence(rawRow)) {
		throw new TypeError(
			`${matrixName}[${rowIndex}] must be an iterable of float64 numbers`
		)
	}

	const row = []
	let colIndex = 0
	for (const value of rawRow) {
		if (expectedLength !== -1 && colIndex >= expectedLength) {
			throw new RangeError(
				`${matrixName} is ragged: row ${rowIndex} has more than ${expectedLength} columns`
			)
		}
		if (typeof value !== 'number') {
			const actualType = value === null ? 'null' : typeof value
			throw new TypeError(
				`${matrixName}[${rowIndex}][${colIndex}] must be a number, got ${actualType}`
			)
		}
		row.push(value)
		colIndex++
	}

	if (expectedLength !== -1 && colIndex !== expectedLength) {
		throw new RangeError(
			`${matrixName} is ragged: row ${rowIndex} has ${colIndex} columns, expected ${expectedLength}`
		)
	}

	return row
}

/**
 * Lazily materializes and validates the right-hand matrix `b` to match `expectedRows`.
 * Stops immediately if `b` has more than `expectedRows` rows and closes its iterator cleanly.
 *
 * @param {Iterable<Iterable<number>>} b - Right-hand matrix iterable.
 * @param {number} expectedRows - Required number of rows (equal to column count of `a`).
 * @returns {{ rowsB: number[][], colsB: number }} Materialized rows and column count of `b`.
 */
function readMatrixB(b, expectedRows) {
	const iterB = b[Symbol.iterator]()
	const rowsB = []
	let colsB = 0
	let done = false

	try {
		for (let r = 0; r < expectedRows; r++) {
			const step = iterB.next()
			if (step.done) {
				done = true
				throw new RangeError(
					`Incompatible matrix dimensions: left matrix has ${expectedRows} columns, right matrix has ${r} rows`
				)
			}
			const row = readRow(step.value, 'b', r, r === 0 ? -1 : colsB)
			if (r === 0) {
				colsB = row.length
			}
			rowsB.push(row)
		}

		const extra = iterB.next()
		if (!extra.done) {
			throw new RangeError(
				`Incompatible matrix dimensions: left matrix has ${expectedRows} columns, right matrix has more than ${expectedRows} rows`
			)
		}

		done = true
		return { rowsB, colsB }
	} finally {
		if (!done && typeof iterB.return === 'function') {
			iterB.return()
		}
	}
}

/**
 * Computes a single output row of `A * B` in IEEE-754 float64 arithmetic using `ikj` accumulation.
 * Preserves exact IEEE-754 float64 semantics including `NaN`, `±Infinity`, and accumulation order.
 *
 * @param {number[]} rowA - Single row of `A` with length `k`.
 * @param {number[][]} rowsB - Materialized matrix `B` with dimensions `k x colsB`.
 * @param {number} colsB - Number of columns in `B`.
 * @returns {number[]} Resulting row of length `colsB`.
 */
function multiplyRow(rowA, rowsB, colsB) {
	const out = new Array(colsB).fill(0)
	const k = rowA.length
	for (let p = 0; p < k; p++) {
		const aVal = rowA[p]
		const bRow = rowsB[p]
		for (let j = 0; j < colsB; j++) {
			out[j] += aVal * bRow[j]
		}
	}
	return out
}

/**
 * Multiplies two matrices `a` (`m x k`) and `b` (`k x n`) over IEEE-754 float64 numbers,
 * returning a lazy generator that yields each resulting row (`number[]`) on demand.
 *
 * Both `a` and `b` may be any non-string iterables of row iterables (e.g., arrays, generators,
 * typed arrays for rows, sets, or custom iterables). Neither input is iterated until the
 * returned generator is consumed:
 * - `a` is streamed strictly one row per output row, supporting arbitrarily large or infinite
 *   row streams when the consumer terminates early.
 * - `b` is materialized lazily on the first pulled row of `a`, validated against `a`'s column
 *   count (failing fast if `b` has too many rows), and reused for subsequent rows of `a`.
 * - If `a` yields zero rows, the generator completes immediately without consuming `b`.
 *
 * @param {Iterable<Iterable<number>>} a - Left matrix (`m x k`) as an iterable of row iterables.
 * @param {Iterable<Iterable<number>>} b - Right matrix (`k x n`) as an iterable of row iterables.
 * @returns {Generator<number[], void, undefined>} Lazy generator yielding each `1 x n` output row.
 * @throws {TypeError} If `a` or `b` is not a valid matrix iterable, or any row/element has an invalid type.
 * @throws {RangeError} If either matrix is ragged or inner dimensions do not match (`cols(a) !== rows(b)`).
 */
export function matMulFloatLazy(a, b) {
	if (!isMatrixIterable(a)) {
		throw new TypeError('a must be an iterable of numeric row iterables')
	}
	if (!isMatrixIterable(b)) {
		throw new TypeError('b must be an iterable of numeric row iterables')
	}

	return (function* generateRows() {
		let rowIndex = 0
		let innerDim = -1
		let bData = null

		for (const rawRowA of a) {
			const rowA = readRow(rawRowA, 'a', rowIndex, innerDim)
			if (bData === null) {
				innerDim = rowA.length
				bData = readMatrixB(b, innerDim)
			}
			yield multiplyRow(rowA, bData.rowsB, bData.colsB)
			rowIndex++
		}
	})()
}
