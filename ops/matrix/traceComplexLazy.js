/**
 * @typedef {object} Complex
 * @property {number} re Real part (finite number).
 * @property {number} im Imaginary part (finite number).
 */

/**
 * Checks whether a value is a non-string iterable object.
 *
 * @param {unknown} value
 * @returns {value is Iterable<unknown>}
 */
function isIterableObject(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Validates that a matrix entry is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value
 * @param {number} rowIndex
 * @param {number} colIndex
 * @returns {asserts value is Complex}
 */
function validateComplex(value, rowIndex, colIndex) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Expected complex object { re, im } at [${rowIndex}][${colIndex}]`
		)
	}

	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`Expected numeric re and im properties at [${rowIndex}][${colIndex}]`
		)
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`Expected finite re and im values at [${rowIndex}][${colIndex}]`
		)
	}
}

/**
 * Lazily streams and validates a square complex matrix, yielding its diagonal
 * entries `{ re, im }` one by one with O(1) memory overhead.
 *
 * Consumes row and column iterables in a single pass and fails fast on shape
 * mismatches, ragged rows, or invalid complex entries without materializing
 * the matrix or pulling unnecessary elements.
 *
 * @param {Iterable<Iterable<Complex>>} matrix
 * @yields {Complex}
 */
function* streamComplexDiagonal(matrix) {
	if (!isIterableObject(matrix)) {
		throw new TypeError('Expected matrix to be an iterable of row iterables')
	}

	let expectedWidth = null
	let rowIndex = 0

	for (const row of matrix) {
		if (!isIterableObject(row)) {
			throw new TypeError(
				`Expected row ${rowIndex} to be an iterable of complex numbers`
			)
		}

		if (expectedWidth !== null && rowIndex >= expectedWidth) {
			throw new RangeError(
				`Matrix must be square: received more than ${expectedWidth} rows for width ${expectedWidth}`
			)
		}

		let colIndex = 0
		let diagRe = 0
		let diagIm = 0
		let hasDiag = false

		for (const cell of row) {
			if (expectedWidth !== null && colIndex >= expectedWidth) {
				throw new RangeError(
					`Matrix must be square and non-ragged: row ${rowIndex} exceeds expected width ${expectedWidth}`
				)
			}

			validateComplex(cell, rowIndex, colIndex)

			if (colIndex === rowIndex) {
				diagRe = cell.re
				diagIm = cell.im
				hasDiag = true
			}

			colIndex += 1
		}

		if (expectedWidth === null) {
			expectedWidth = colIndex
			if (expectedWidth === 0) {
				throw new RangeError(
					'Matrix must be square: received a non-empty matrix with 0 columns'
				)
			}
		} else if (colIndex !== expectedWidth) {
			throw new RangeError(
				`Matrix must be square and non-ragged: row ${rowIndex} has length ${colIndex}, expected ${expectedWidth}`
			)
		}

		if (hasDiag) {
			yield { re: diagRe, im: diagIm }
		}

		rowIndex += 1
	}

	if (expectedWidth !== null && rowIndex !== expectedWidth) {
		throw new RangeError(
			`Matrix must be square: received ${rowIndex} rows for width ${expectedWidth}`
		)
	}
}

/**
 * Normalizes signed zero (-0) to positive zero (0).
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Computes the trace of a square matrix of complex numbers `{ re, im }` using
 * a streaming, generator-based implementation that consumes iterable inputs
 * lazily in a single pass with O(1) auxiliary memory.
 *
 * Uses Neumaier compensated summation for improved floating-point precision
 * across large streams. An empty iterable (0x0 matrix) has trace `{ re: 0, im: 0 }`.
 *
 * @param {Iterable<Iterable<Complex>>} matrix Square matrix represented as an iterable of row iterables of `{ re, im }` complex numbers.
 * @returns {Complex} The complex trace `{ re, im }` equal to the sum of the main diagonal entries.
 * @throws {TypeError} If `matrix` or any row is not a non-string iterable, or if any entry is not a `{ re, im }` object with numeric parts.
 * @throws {RangeError} If the matrix is non-square or ragged, or if any complex entry contains a non-finite (`NaN` or `Infinity`) component.
 */
export function traceComplexLazy(matrix) {
	let reSum = 0
	let reComp = 0
	let imSum = 0
	let imComp = 0

	for (const { re, im } of streamComplexDiagonal(matrix)) {
		const nextRe = reSum + re
		if (Math.abs(reSum) >= Math.abs(re)) {
			reComp += reSum - nextRe + re
		} else {
			reComp += re - nextRe + reSum
		}
		reSum = nextRe

		const nextIm = imSum + im
		if (Math.abs(imSum) >= Math.abs(im)) {
			imComp += imSum - nextIm + im
		} else {
			imComp += im - nextIm + imSum
		}
		imSum = nextIm
	}

	const re = normalizeZero(reSum + reComp)
	const im = normalizeZero(imSum + imComp)

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Trace computation overflowed to a non-finite value')
	}

	return { re, im }
}
