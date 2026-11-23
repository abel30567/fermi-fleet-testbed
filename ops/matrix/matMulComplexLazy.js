/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Checks whether a value is a non-string iterable object.
 *
 * @param {unknown} value
 * @returns {value is Iterable<unknown>}
 */
function isNonStringIterable(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function validateComplex(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object with numeric { re, im } fields`)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label} must have numeric { re, im } fields`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label} must have finite { re, im } fields`)
	}
	return { re, im }
}

/**
 * Normalizes IEEE 754 negative zero to positive zero.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Materializes matrix B once on demand into column-major typed arrays,
 * validating row uniformity, complex entries, and inner dimension match.
 *
 * @param {Iterable<Iterable<Complex>>} b
 * @param {number} expectedRows
 * @returns {{ cols: number, re: Float64Array, im: Float64Array }}
 */
function materializeB(b, expectedRows) {
	let rowIdx = 0
	let cols = 0
	/** @type {Float64Array | null} */
	let bRe = null
	/** @type {Float64Array | null} */
	let bIm = null

	for (const rawRow of b) {
		if (rowIdx >= expectedRows) {
			throw new RangeError(
				`Matrix dimension mismatch: A has ${expectedRows} column(s), but B has more than ${expectedRows} row(s)`
			)
		}
		if (!isNonStringIterable(rawRow)) {
			throw new TypeError(`B row ${rowIdx} must be an iterable`)
		}

		if (rowIdx === 0) {
			const firstRe = []
			const firstIm = []
			let colIdx = 0
			for (const entry of rawRow) {
				const c = validateComplex(entry, `B[${rowIdx}][${colIdx}]`)
				firstRe.push(c.re)
				firstIm.push(c.im)
				colIdx++
			}
			cols = firstRe.length
			bRe = new Float64Array(expectedRows * cols)
			bIm = new Float64Array(expectedRows * cols)
			for (let j = 0; j < cols; j++) {
				bRe[j * expectedRows] = firstRe[j]
				bIm[j * expectedRows] = firstIm[j]
			}
		} else {
			let colIdx = 0
			for (const entry of rawRow) {
				if (colIdx >= cols) {
					throw new RangeError(
						`Ragged matrix B: row ${rowIdx} has more than ${cols} column(s)`
					)
				}
				const c = validateComplex(entry, `B[${rowIdx}][${colIdx}]`)
				bRe[colIdx * expectedRows + rowIdx] = c.re
				bIm[colIdx * expectedRows + rowIdx] = c.im
				colIdx++
			}
			if (colIdx !== cols) {
				throw new RangeError(
					`Ragged matrix B: expected ${cols} column(s) at row ${rowIdx}, got ${colIdx}`
				)
			}
		}
		rowIdx++
	}

	if (rowIdx !== expectedRows) {
		throw new RangeError(
			`Matrix dimension mismatch: A has ${expectedRows} column(s), but B has ${rowIdx} row(s)`
		)
	}

	return {
		cols,
		re: bRe ?? new Float64Array(0),
		im: bIm ?? new Float64Array(0),
	}
}

/**
 * Internal generator performing lazy row-by-row complex matrix multiplication.
 *
 * @param {Iterable<Iterable<Complex>>} a
 * @param {Iterable<Iterable<Complex>>} b
 * @returns {Generator<Complex[], void, undefined>}
 */
function* matMulComplexGenerator(a, b) {
	let rowIdx = 0
	let innerDim = 0
	let colsB = 0
	/** @type {Float64Array | null} */
	let rowARe = null
	/** @type {Float64Array | null} */
	let rowAIm = null
	/** @type {Float64Array | null} */
	let bRe = null
	/** @type {Float64Array | null} */
	let bIm = null

	for (const rawRowA of a) {
		if (!isNonStringIterable(rawRowA)) {
			throw new TypeError(`A row ${rowIdx} must be an iterable`)
		}

		if (rowIdx === 0) {
			const firstRe = []
			const firstIm = []
			let colIdx = 0
			for (const entry of rawRowA) {
				const c = validateComplex(entry, `A[${rowIdx}][${colIdx}]`)
				firstRe.push(c.re)
				firstIm.push(c.im)
				colIdx++
			}
			innerDim = firstRe.length
			rowARe = Float64Array.from(firstRe)
			rowAIm = Float64Array.from(firstIm)

			const matB = materializeB(b, innerDim)
			colsB = matB.cols
			bRe = matB.re
			bIm = matB.im
		} else {
			let colIdx = 0
			for (const entry of rawRowA) {
				if (colIdx >= innerDim) {
					throw new RangeError(
						`Ragged matrix A: row ${rowIdx} has more than ${innerDim} column(s)`
					)
				}
				const c = validateComplex(entry, `A[${rowIdx}][${colIdx}]`)
				rowARe[colIdx] = c.re
				rowAIm[colIdx] = c.im
				colIdx++
			}
			if (colIdx !== innerDim) {
				throw new RangeError(
					`Ragged matrix A: expected ${innerDim} column(s) at row ${rowIdx}, got ${colIdx}`
				)
			}
		}

		const outRow = new Array(colsB)
		for (let j = 0; j < colsB; j++) {
			const colOffset = j * innerDim
			let sumRe = 0
			let sumIm = 0
			for (let p = 0; p < innerDim; p++) {
				const ar = rowARe[p]
				const ai = rowAIm[p]
				const br = bRe[colOffset + p]
				const bi = bIm[colOffset + p]
				sumRe += ar * br - ai * bi
				sumIm += ar * bi + ai * br
			}
			outRow[j] = {
				re: normalizeZero(sumRe),
				im: normalizeZero(sumIm),
			}
		}

		rowIdx++
		yield outRow
	}
}

/**
 * Multiplies two complex matrices `A` (m × k) and `B` (k × n) lazily,
 * yielding one output row of `{ re, im }` complex numbers at a time.
 *
 * Both `a` and `b` may be any non-string iterables of non-string iterables
 * (such as arrays, generators, or custom iterables). Rows of `a` are pulled
 * strictly on demand; `b` is not touched until the first output row is
 * requested, and is consumed at most once so single-pass iterables work.
 *
 * @param {Iterable<Iterable<Complex>>} a - Left matrix iterable of rows (m × k).
 * @param {Iterable<Iterable<Complex>>} b - Right matrix iterable of rows (k × n).
 * @returns {Generator<Complex[], void, undefined>} Generator yielding each m-th row of `A * B`.
 * @throws {TypeError} If `a`, `b`, any row, or any complex entry has an invalid type.
 * @throws {RangeError} If any entry is non-finite, any matrix is ragged, or inner dimensions do not match.
 */
export function matMulComplexLazy(a, b) {
	if (!isNonStringIterable(a)) {
		throw new TypeError('First argument (matrix A) must be a non-string iterable')
	}
	if (!isNonStringIterable(b)) {
		throw new TypeError('Second argument (matrix B) must be a non-string iterable')
	}
	return matMulComplexGenerator(a, b)
}
