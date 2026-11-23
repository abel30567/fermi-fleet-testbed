/**
 * Exact rational number in lowest terms.
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Compute the greatest common divisor of two BigInt values (always non-negative).
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Validate and normalize a rational value to lowest terms with `den > 0n`
 * (and zero as `{ num: 0n, den: 1n }`).
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function parseRational(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`)
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have bigint num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be zero`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Check whether a value is a non-null iterable object (rejecting primitives such as strings).
 * @param {unknown} value
 * @returns {value is Iterable<unknown>}
 */
function isIterableObject(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof /** @type {any} */ (value)[Symbol.iterator] === 'function'
	)
}

/**
 * Validate and materialize a single matrix row from an iterable of rationals.
 * @param {unknown} rawRow
 * @param {string} matrixName
 * @param {number} rowIndex
 * @returns {Rational[]}
 */
function parseRow(rawRow, matrixName, rowIndex) {
	if (!isIterableObject(rawRow)) {
		throw new TypeError(`Matrix ${matrixName} row ${rowIndex} must be an iterable`)
	}
	const row = []
	let colIndex = 0
	for (const entry of rawRow) {
		row.push(parseRational(entry, `Matrix ${matrixName}[${rowIndex}][${colIndex}]`))
		colIndex++
	}
	return row
}

/**
 * Multiply two already-normalized rationals and return a normalized rational.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Lazily multiply two matrices of exact rational numbers `{ num: bigint, den: bigint }`.
 *
 * Matrix `a` is consumed row-by-row as a lazy stream via a generator, and each output row
 * is computed and yielded lazily as an array of normalized rationals in lowest terms
 * (`den > 0n`, with zero represented as `{ num: 0n, den: 1n }`). Matrix `b` is consumed
 * once on first iteration and stored column-wise to support single-pass iterables/generators.
 *
 * @param {Iterable<Iterable<Rational>>} a Left matrix (m x k) as an iterable of row iterables.
 * @param {Iterable<Iterable<Rational>>} b Right matrix (k x n) as an iterable of row iterables.
 * @returns {Generator<Rational[], void, unknown>} Generator yielding each output row (length n).
 * @throws {TypeError} If `a`, `b`, any row, or any rational entry has an invalid type.
 * @throws {RangeError} If any rational has a zero denominator, a matrix is ragged, or dimensions mismatch.
 */
export function matMulRationalLazy(a, b) {
	if (!isIterableObject(a)) {
		throw new TypeError('Matrix A must be an iterable of row iterables')
	}
	if (!isIterableObject(b)) {
		throw new TypeError('Matrix B must be an iterable of row iterables')
	}

	return (function* matMulGenerator() {
		// Materialize and validate B once into columns: bCols[j][k] = B[k][j]
		let bRowCount = 0
		let bColCount = -1
		/** @type {Rational[][]} */
		const bCols = []

		for (const rawRowB of b) {
			const rowB = parseRow(rawRowB, 'B', bRowCount)
			if (bColCount === -1) {
				bColCount = rowB.length
				for (let j = 0; j < bColCount; j++) {
					bCols.push([])
				}
			} else if (rowB.length !== bColCount) {
				throw new RangeError(
					`Matrix B is ragged: row ${bRowCount} has length ${rowB.length}, expected ${bColCount}`
				)
			}
			for (let j = 0; j < bColCount; j++) {
				bCols[j].push(rowB[j])
			}
			bRowCount++
		}

		if (bColCount === -1) {
			bColCount = 0
		}

		// Lazily stream rows of A and yield one output row per input row of A
		let aRowIndex = 0
		let aColCount = -1

		for (const rawRowA of a) {
			const rowA = parseRow(rawRowA, 'A', aRowIndex)
			if (aColCount === -1) {
				aColCount = rowA.length
				if (aColCount !== bRowCount) {
					throw new RangeError(
						`Matrix dimension mismatch: A has ${aColCount} columns, but B has ${bRowCount} rows`
					)
				}
			} else if (rowA.length !== aColCount) {
				throw new RangeError(
					`Matrix A is ragged: row ${aRowIndex} has length ${rowA.length}, expected ${aColCount}`
				)
			}

			/** @type {Rational[]} */
			const outRow = new Array(bColCount)
			for (let j = 0; j < bColCount; j++) {
				const bCol = bCols[j]
				let accNum = 0n
				let accDen = 1n

				for (let k = 0; k < bRowCount; k++) {
					const ak = rowA[k]
					const bkj = bCol[k]
					if (ak.num === 0n || bkj.num === 0n) {
						continue
					}
					const prod = mulRational(ak, bkj)
					if (accNum === 0n) {
						accNum = prod.num
						accDen = prod.den
					} else {
						const g = gcdBigInt(accDen, prod.den)
						const num = accNum * (prod.den / g) + prod.num * (accDen / g)
						const den = (accDen / g) * prod.den
						if (num === 0n) {
							accNum = 0n
							accDen = 1n
						} else {
							const g2 = gcdBigInt(num, den)
							accNum = num / g2
							accDen = den / g2
						}
					}
				}

				outRow[j] = { num: accNum, den: accDen }
			}

			aRowIndex++
			yield outRow
		}
	})()
}
