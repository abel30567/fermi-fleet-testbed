/**
 * Validates that a value is a non-null iterable of rows (excluding strings and TypedArrays/DataViews).
 *
 * @param {unknown} value - Candidate matrix iterable.
 * @param {string} name - Parameter name for error messages.
 * @returns {void}
 * @throws {TypeError} If `value` is not a valid iterable of rows.
 */
function assertRowIterable(value, name) {
	if (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		ArrayBuffer.isView(value) ||
		typeof value[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(`${name} must be an iterable of Float64Array rows`)
	}
}

/**
 * Validates a single matrix row.
 *
 * @param {unknown} row - Candidate row value.
 * @param {string} name - Matrix parameter name for error messages.
 * @param {number} rowIndex - Zero-based row index.
 * @param {number | null} expectedCols - Expected column count, or `null` for the first row.
 * @returns {number} The validated column count.
 * @throws {TypeError} If `row` is not a `Float64Array`.
 * @throws {RangeError} If `row` is empty or has a mismatched length.
 */
function validateRow(row, name, rowIndex, expectedCols) {
	if (!(row instanceof Float64Array)) {
		throw new TypeError(
			`${name}[${rowIndex}] must be a Float64Array`
		)
	}
	if (row.length === 0) {
		throw new RangeError(
			`${name}[${rowIndex}] must not be empty`
		)
	}
	if (expectedCols !== null && row.length !== expectedCols) {
		throw new RangeError(
			`${name}[${rowIndex}] has length ${row.length}, expected ${expectedCols}`
		)
	}
	return row.length
}

/**
 * Computes the matrix product `A * B` over `Float64Array` rows using a lazy streaming generator.
 *
 * Both `a` (shape `m x k`) and `b` (shape `k x n`) may be any iterable of `Float64Array` rows
 * (e.g., arrays, generators, or chained `matMulTypedLazy` streams). Consumption is deferred until
 * the returned generator is iterated: rows of `a` are pulled strictly one at a time on demand
 * (supporting arbitrarily large or even infinite row streams for `a`), and each yielded output
 * row is a newly allocated `Float64Array` of length `n`.
 *
 * @param {Iterable<Float64Array>} a - Left matrix iterable of `m` rows, each a `Float64Array` of length `k`.
 * @param {Iterable<Float64Array>} b - Right matrix iterable of `k` rows, each a `Float64Array` of length `n`.
 * @returns {Generator<Float64Array, void, undefined>} A generator yielding each row of `A * B` as a `Float64Array` of length `n`.
 * @throws {TypeError} If `a` or `b` is not an iterable of rows, or if any yielded row is not a `Float64Array`.
 * @throws {RangeError} If either matrix is empty, ragged, has zero-length rows, or has incompatible inner dimensions (`cols(a) !== rows(b)`).
 */
export function matMulTypedLazy(a, b) {
	assertRowIterable(a, 'a')
	assertRowIterable(b, 'b')

	return (function* streamMatMul() {
		const aIter = a[Symbol.iterator]()
		let aDone = false

		try {
			const firstStep = aIter.next()
			if (firstStep.done) {
				aDone = true
				throw new RangeError('Matrix a must contain at least one row')
			}

			const firstARow = firstStep.value
			const k = validateRow(firstARow, 'a', 0, null)

			// Lazily materialize B on first demand, failing fast if B has more than k rows.
			const bRows = []
			let n = null
			const bIter = b[Symbol.iterator]()
			let bDone = false

			try {
				while (true) {
					const bStep = bIter.next()
					if (bStep.done) {
						bDone = true
						break
					}
					if (bRows.length >= k) {
						throw new RangeError(
							`Incompatible matrix dimensions: a has ${k} columns, but b has more than ${k} rows`
						)
					}
					const bRow = bStep.value
					n = validateRow(bRow, 'b', bRows.length, n)
					bRows.push(bRow)
				}
			} finally {
				if (!bDone && typeof bIter.return === 'function') {
					bIter.return()
				}
			}

			if (bRows.length === 0) {
				throw new RangeError('Matrix b must contain at least one row')
			}
			if (bRows.length !== k) {
				throw new RangeError(
					`Incompatible matrix dimensions: a has ${k} columns, but b has ${bRows.length} rows`
				)
			}

			const computeRow = (aRow) => {
				const out = new Float64Array(n)
				for (let p = 0; p < k; p++) {
					const aVal = aRow[p]
					const bRow = bRows[p]
					for (let j = 0; j < n; j++) {
						out[j] += aVal * bRow[j]
					}
				}
				return out
			}

			yield computeRow(firstARow)

			let rowIndex = 1
			while (true) {
				const step = aIter.next()
				if (step.done) {
					aDone = true
					break
				}
				const aRow = step.value
				validateRow(aRow, 'a', rowIndex, k)
				yield computeRow(aRow)
				rowIndex++
			}
		} finally {
			if (!aDone && typeof aIter.return === 'function') {
				aIter.return()
			}
		}
	})()
}
