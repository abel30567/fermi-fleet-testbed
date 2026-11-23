import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matMulTypedLazy } from './matMulTypedLazy.js'

/**
 * Helper to create an array of Float64Array rows from nested plain arrays.
 * @param {number[][]} rows
 * @returns {Float64Array[]}
 */
function mat(rows) {
	return rows.map((r) => new Float64Array(r))
}

/**
 * Helper to assert two matrices (arrays of Float64Array) are element-wise close.
 * @param {Float64Array[]} actual
 * @param {Float64Array[]} expected
 * @param {number} [eps=1e-12]
 */
function assertMatClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length, 'row count mismatch')
	for (let i = 0; i < expected.length; i++) {
		assert.ok(actual[i] instanceof Float64Array, `row ${i} should be Float64Array`)
		assert.equal(actual[i].length, expected[i].length, `col count mismatch at row ${i}`)
		for (let j = 0; j < expected[i].length; j++) {
			assert.ok(
				Math.abs(actual[i][j] - expected[i][j]) <= eps,
				`mismatch at (${i}, ${j}): got ${actual[i][j]}, expected ${expected[i][j]}`
			)
		}
	}
}

/**
 * Helper to transpose a matrix of Float64Array rows.
 * @param {Float64Array[]} m
 * @returns {Float64Array[]}
 */
function transpose(m) {
	const rows = m.length
	const cols = m[0].length
	const result = []
	for (let j = 0; j < cols; j++) {
		const row = new Float64Array(rows)
		for (let i = 0; i < rows; i++) {
			row[i] = m[i][j]
		}
		result.push(row)
	}
	return result
}

describe('matMulTypedLazy', () => {
	it('multiplies two 2x2 square matrices', () => {
		const a = mat([
			[1, 2],
			[3, 4]
		])
		const b = mat([
			[5, 6],
			[7, 8]
		])
		const result = [...matMulTypedLazy(a, b)]
		assertMatClose(result, mat([
			[19, 22],
			[43, 50]
		]))
	})

	it('multiplies rectangular matrices (2x3 by 3x2 and 3x1 by 1x4)', () => {
		const a = mat([
			[1, 2, 3],
			[4, 5, 6]
		])
		const b = mat([
			[7, 8],
			[9, 10],
			[11, 12]
		])
		assertMatClose([...matMulTypedLazy(a, b)], mat([
			[58, 64],
			[139, 154]
		]))

		// Outer product: (3x1) * (1x4) => (3x4)
		const col = mat([[2], [-3], [0.5]])
		const row = mat([[4, -1, 0, 2]])
		assertMatClose([...matMulTypedLazy(col, row)], mat([
			[8, -2, 0, 4],
			[-12, 3, 0, -6],
			[2, -0.5, 0, 1]
		]))
	})

	it('multiplies a 1xN row vector by an Nx1 column vector into a 1x1 matrix', () => {
		const a = mat([[1.5, -2.5, 4]])
		const b = mat([[2], [4], [-0.5]])
		assertMatClose([...matMulTypedLazy(a, b)], mat([[-9]]))
	})

	it('preserves matrix when multiplied by the identity matrix (left and right)', () => {
		const a = mat([
			[2.5, -1, 3.25],
			[0, 4.5, -2]
		])
		const id2 = mat([
			[1, 0],
			[0, 1]
		])
		const id3 = mat([
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1]
		])
		assertMatClose([...matMulTypedLazy(id2, a)], a)
		assertMatClose([...matMulTypedLazy(a, id3)], a)
	})

	it('produces zero matrix when multiplied by a zero matrix', () => {
		const a = mat([
			[3, -7, 2],
			[1, 5, -4]
		])
		const zero = mat([
			[0, 0],
			[0, 0],
			[0, 0]
		])
		assertMatClose([...matMulTypedLazy(a, zero)], mat([
			[0, 0],
			[0, 0]
		]))
	})

	it('consumes input iterables lazily and supports infinite row streams for a', () => {
		let aPulled = 0
		let aClosed = false
		let bPulled = 0

		function* infiniteA() {
			try {
				while (true) {
					aPulled++
					yield new Float64Array([aPulled, aPulled * 10])
				}
			} finally {
				aClosed = true
			}
		}

		function* lazyB() {
			bPulled++
			yield new Float64Array([1, 0])
			bPulled++
			yield new Float64Array([0, 2])
		}

		const stream = matMulTypedLazy(infiniteA(), lazyB())
		// Nothing pulled before iteration starts
		assert.equal(aPulled, 0)
		assert.equal(bPulled, 0)

		const first = stream.next()
		assert.equal(first.done, false)
		assert.equal(aPulled, 1)
		assert.equal(bPulled, 2)
		assert.deepEqual(first.value, new Float64Array([1, 20]))

		const second = stream.next()
		assert.equal(second.done, false)
		assert.equal(aPulled, 2)
		assert.deepEqual(second.value, new Float64Array([2, 40]))

		// Early termination closes upstream generator cleanly
		stream.return()
		assert.equal(aClosed, true)
		assert.equal(aPulled, 2)
	})

	it('validates non-iterable or invalid top-level inputs synchronously', () => {
		const valid = mat([[1]])
		const badInputs = [
			null,
			undefined,
			42,
			'not a matrix',
			{},
			new Float64Array([1, 2])
		]
		for (const bad of badInputs) {
			assert.throws(() => matMulTypedLazy(bad, valid), TypeError)
			assert.throws(() => matMulTypedLazy(valid, bad), TypeError)
		}
	})

	it('throws TypeError when rows are not Float64Array instances', () => {
		const valid = mat([[1, 2], [3, 4]])
		assert.throws(() => [...matMulTypedLazy([[1, 2]], valid)], TypeError)
		assert.throws(() => [...matMulTypedLazy([new Float32Array([1, 2])], valid)], TypeError)
		assert.throws(() => [...matMulTypedLazy(valid, [[1, 2], [3, 4]])], TypeError)
		assert.throws(() => [...matMulTypedLazy(valid, [new Float64Array([1, 2]), new Int32Array([3, 4])])], TypeError)
	})

	it('throws RangeError for empty matrices, zero-length rows, ragged rows, and incompatible dimensions', () => {
		const valid = mat([[1, 2], [3, 4]])
		// Empty matrices
		assert.throws(() => [...matMulTypedLazy([], valid)], RangeError)
		assert.throws(() => [...matMulTypedLazy(valid, [])], RangeError)

		// Zero-length rows
		assert.throws(() => [...matMulTypedLazy([new Float64Array(0)], valid)], RangeError)
		assert.throws(() => [...matMulTypedLazy(mat([[1]]), [new Float64Array(0)])], RangeError)

		// Ragged rows in a and b
		assert.throws(
			() => [...matMulTypedLazy(mat([[1, 2], [3]]), valid)],
			RangeError
		)
		assert.throws(
			() => [...matMulTypedLazy(valid, mat([[1, 2], [3, 4, 5]]))],
			RangeError
		)

		// Incompatible inner dimensions (fewer and more rows in b than cols in a)
		assert.throws(
			() => [...matMulTypedLazy(mat([[1, 2, 3]]), mat([[1], [2]]))],
			RangeError
		)
		assert.throws(
			() => [...matMulTypedLazy(mat([[1, 2]]), mat([[1], [2], [3]]))],
			RangeError
		)

		// Infinite b fails fast instead of hanging
		let bPulled = 0
		function* infiniteB() {
			while (true) {
				bPulled++
				yield new Float64Array([1, 2])
			}
		}
		assert.throws(() => [...matMulTypedLazy(mat([[1, 2]]), infiniteB())], RangeError)
		assert.equal(bPulled, 3)
	})

	it('satisfies associativity (A * B) * C === A * (B * C) with chained lazy streams', () => {
		const a = mat([
			[1.5, -2, 0.5],
			[3, 0, -1.25],
			[-0.5, 4, 2]
		])
		const b = mat([
			[2, -1],
			[0.5, 3.5],
			[-2, 1.5]
		])
		const c = mat([
			[4, -0.5, 1, 2],
			[-1.5, 2, 0, -3]
		])

		const leftAssoc = [...matMulTypedLazy(matMulTypedLazy(a, b), c)]
		const rightAssoc = [...matMulTypedLazy(a, matMulTypedLazy(b, c))]
		assertMatClose(leftAssoc, rightAssoc, 1e-11)
	})

	it('satisfies the transpose identity (A * B)^T === B^T * A^T', () => {
		const a = mat([
			[1.2, -3.4, 5.6],
			[-7.8, 9.0, -0.5]
		])
		const b = mat([
			[2.1, 0.4, -1.3, 4.5],
			[-0.7, 3.2, 2.8, -1.1],
			[5.0, -2.5, 0.9, 3.3]
		])

		const abT = transpose([...matMulTypedLazy(a, b)])
		const btAt = [...matMulTypedLazy(transpose(b), transpose(a))]
		assertMatClose(abT, btAt, 1e-11)
	})
})
