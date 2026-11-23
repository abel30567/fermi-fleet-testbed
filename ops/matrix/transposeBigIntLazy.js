/**
 * Lazily transposes a matrix of exact BigInt values.
 *
 * Accepts an iterable of row iterables (each yielding `bigint` entries) and
 * returns a generator that yields each transposed row (i.e., each column of
 * the input matrix) as a `bigint[]` one at a time.
 *
 * Because row iterators are advanced in lockstep—pulling only one element per
 * row for each yielded transposed row—memory usage is O(m) where `m` is the
 * number of input rows, and matrices with very wide or even infinite column
 * streams can be consumed lazily.
 *
 * All entries are preserved as exact `bigint` values (including any caller-side
 * 10^18-scaled fixed-point BigInt representations). Matrix transposition is an
 * exact permutation `(A^T)[j][i] === A[i][j]` and never introduces rounding.
 *
 * @param {Iterable<Iterable<bigint>>} matrix - Iterable of equal-length row iterables of `bigint` values.
 * @returns {Generator<bigint[], void, undefined>} Generator yielding transposed rows lazily.
 * @throws {TypeError} If `matrix` is not a non-string iterable, any row is not a non-string iterable,
 *   a row iterator is malformed, or any matrix entry is not a `bigint`.
 * @throws {RangeError} If input rows have unequal lengths (ragged matrix).
 */
export function transposeBigIntLazy(matrix) {
	if (!isNonStringIterable(matrix)) {
		throw new TypeError('matrix must be a non-string iterable of row iterables')
	}

	return transposeBigIntGenerator(matrix)
}

/**
 * Checks whether a value is an iterable object (excluding strings).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonStringIterable(value) {
	return (
		value != null &&
		typeof value !== 'string' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Safely closes any still-open iterators via their `.return()` method.
 *
 * @param {Array<Iterator<bigint>>} iterators
 * @param {Array<boolean>} activeFlags
 */
function closeActiveIterators(iterators, activeFlags) {
	for (let i = 0; i < iterators.length; i++) {
		if (!activeFlags[i]) continue
		activeFlags[i] = false
		const iterator = iterators[i]
		if (typeof iterator.return === 'function') {
			try {
				iterator.return()
			} catch {
				// Ignore cleanup errors to preserve the primary exception or normal early exit.
			}
		}
	}
}

/**
 * Internal generator performing lockstep column-by-column transposition.
 *
 * @param {Iterable<Iterable<bigint>>} matrix
 * @returns {Generator<bigint[], void, undefined>}
 */
function* transposeBigIntGenerator(matrix) {
	/** @type {Array<Iterator<bigint>>} */
	const rowIterators = []
	/** @type {Array<boolean>} */
	const activeFlags = []

	try {
		let rowIndex = 0
		for (const row of matrix) {
			if (!isNonStringIterable(row)) {
				throw new TypeError(`Row ${rowIndex} must be a non-string iterable of bigint values`)
			}
			const iterator = row[Symbol.iterator]()
			if (iterator == null || typeof iterator.next !== 'function') {
				throw new TypeError(`Row ${rowIndex} iterator must expose a next() method`)
			}
			rowIterators.push(iterator)
			activeFlags.push(true)
			rowIndex++
		}

		const rowCount = rowIterators.length
		if (rowCount === 0) {
			return
		}

		for (let colIndex = 0; ; colIndex++) {
			const firstStep = rowIterators[0].next()

			if (firstStep.done) {
				activeFlags[0] = false
				for (let r = 1; r < rowCount; r++) {
					const step = rowIterators[r].next()
					if (step.done) {
						activeFlags[r] = false
					} else {
						throw new RangeError(
							`Ragged matrix: row ${r} has more columns than row 0 (expected ${colIndex})`
						)
					}
				}
				return
			}

			if (typeof firstStep.value !== 'bigint') {
				throw new TypeError(
					`Matrix entry at (0, ${colIndex}) must be a bigint, got ${describeType(firstStep.value)}`
				)
			}

			/** @type {bigint[]} */
			const transposedRow = new Array(rowCount)
			transposedRow[0] = firstStep.value

			for (let r = 1; r < rowCount; r++) {
				const step = rowIterators[r].next()
				if (step.done) {
					activeFlags[r] = false
					throw new RangeError(
						`Ragged matrix: row ${r} ended at column ${colIndex}, shorter than row 0`
					)
				}
				if (typeof step.value !== 'bigint') {
					throw new TypeError(
						`Matrix entry at (${r}, ${colIndex}) must be a bigint, got ${describeType(step.value)}`
					)
				}
				transposedRow[r] = step.value
			}

			yield transposedRow
		}
	} finally {
		closeActiveIterators(rowIterators, activeFlags)
	}
}

/**
 * Formats a concise type description for error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
	if (value === null) return 'null'
	return typeof value
}
