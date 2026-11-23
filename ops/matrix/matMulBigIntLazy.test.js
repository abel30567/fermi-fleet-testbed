import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { matMulBigIntLazy } from './matMulBigIntLazy.js'

/**
 * Helper to transpose a rectangular 2D BigInt matrix.
 *
 * @param {bigint[][]} m
 * @returns {bigint[][]}
 */
function transpose(m) {
	const rows = m.length
	const cols = m[0].length
	const out = Array.from({ length: cols }, () => new Array(rows))
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			out[j][i] = m[i][j]
		}
	}
	return out
}

/**
 * Helper to create an n x n BigInt identity matrix.
 *
 * @param {number} n
 * @returns {bigint[][]}
 */
function identity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n)),
	)
}

/**
 * Helper to add two BigInt matrices of identical shape.
 *
 * @param {bigint[][]} a
 * @param {bigint[][]} b
 * @returns {bigint[][]}
 */
function matAdd(a, b) {
	return a.map((row, i) => row.map((v, j) => v + b[i][j]))
}

describe('matMulBigIntLazy', () => {
	describe('normal cases', () => {
		test('multiplies 2x2 square matrices', () => {
			const a = [
				[1n, 2n],
				[3n, 4n],
			]
			const b = [
				[5n, 6n],
				[7n, 8n],
			]
			assert.deepEqual([...matMulBigIntLazy(a, b)], [
				[19n, 22n],
				[43n, 50n],
			])
		})

		test('multiplies 3x3 square matrices with negative and zero entries', () => {
			const a = [
				[2n, -1n, 0n],
				[0n, 3n, -4n],
				[-5n, 0n, 6n],
			]
			const b = [
				[1n, 2n, -3n],
				[-4n, 0n, 5n],
				[6n, -7n, 8n],
			]
			assert.deepEqual([...matMulBigIntLazy(a, b)], [
				[6n, 4n, -11n],
				[-36n, 28n, -17n],
				[31n, -52n, 63n],
			])
		})

		test('multiplies rectangular matrices (2x3 * 3x4 -> 2x4)', () => {
			const a = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
			]
			const b = [
				[7n, 8n, 9n, 10n],
				[11n, 12n, 13n, 14n],
				[15n, 16n, 17n, 18n],
			]
			assert.deepEqual([...matMulBigIntLazy(a, b)], [
				[74n, 80n, 86n, 92n],
				[173n, 188n, 203n, 218n],
			])
		})

		test('handles 1x1, dot product (1xN * Nx1), and outer product (Mx1 * 1xN)', () => {
			assert.deepEqual([...matMulBigIntLazy([[7n]], [[-6n]])], [[-42n]])

			const dot = [...matMulBigIntLazy([[2n, -3n, 5n]], [[4n], [6n], [-2n]])]
			assert.deepEqual(dot, [[-20n]])

			const outer = [...matMulBigIntLazy([[2n], [-3n], [5n]], [[4n, -1n]])]
			assert.deepEqual(outer, [
				[8n, -2n],
				[-12n, 3n],
				[20n, -5n],
			])
		})

		test('preserves matrix under left and right identity multiplication', () => {
			const a = [
				[9n, -2n, 4n],
				[0n, 7n, -11n],
			]
			assert.deepEqual([...matMulBigIntLazy(identity(2), a)], a)
			assert.deepEqual([...matMulBigIntLazy(a, identity(3))], a)
		})

		test('handles zero rows and zero matrices', () => {
			const zeroA = [
				[0n, 0n],
				[0n, 0n],
			]
			const b = [
				[9n, -8n, 7n],
				[-6n, 5n, -4n],
			]
			assert.deepEqual([...matMulBigIntLazy(zeroA, b)], [
				[0n, 0n, 0n],
				[0n, 0n, 0n],
			])
		})
	})

	describe('huge BigInts and streaming/lazy behavior', () => {
		test('preserves exact arithmetic for huge BigInts beyond Number.MAX_SAFE_INTEGER', () => {
			const big1 = 10n ** 40n + 12345678901234567890123456789n
			const big2 = -(2n ** 128n) - 7n
			const big3 = 10n ** 50n + 99999999999999999999n
			const big4 = 2n ** 200n + 1n

			const a = [
				[big1, big2],
				[big3, big4],
			]
			const b = [
				[big4, -big1],
				[big2, big3],
			]

			const expected = [
				[big1 * big4 + big2 * big2, big1 * -big1 + big2 * big3],
				[big3 * big4 + big4 * big2, big3 * -big1 + big4 * big3],
			]
			assert.deepEqual([...matMulBigIntLazy(a, b)], expected)
		})

		test('consumes rows of A lazily one row at a time and supports infinite row streams', () => {
			let pulled = 0
			function* infiniteRowsA() {
				let i = 1n
				while (true) {
					pulled++
					yield [i, i + 1n]
					i++
				}
			}

			const b = [
				[10n, 20n],
				[30n, 40n],
			]

			const gen = matMulBigIntLazy(infiniteRowsA(), b)
			assert.equal(pulled, 0, 'no row of A should be pulled before first next()')

			const r0 = gen.next()
			assert.equal(pulled, 1, 'only first row of A should be pulled after first next()')
			assert.deepEqual(r0, { value: [70n, 100n], done: false })

			const r1 = gen.next()
			assert.equal(pulled, 2, 'only second row of A should be pulled after second next()')
			assert.deepEqual(r1, { value: [110n, 160n], done: false })

			const r2 = gen.next()
			assert.equal(pulled, 3, 'only third row of A should be pulled after third next()')
			assert.deepEqual(r2, { value: [150n, 220n], done: false })

			gen.return()
			assert.equal(pulled, 3, 'no additional rows should be pulled after early termination')
		})

		test('accepts generator inputs for both matrices, generator rows, and BigInt64Array rows', () => {
			function* genRow(arr) {
				for (const v of arr) yield v
			}
			function* genA() {
				yield genRow([1n, 2n, 3n])
				yield new BigInt64Array([4n, -5n, 6n])
			}
			function* genB() {
				yield genRow([7n, 8n])
				yield new BigInt64Array([9n, 10n])
				yield genRow([-11n, 12n])
			}

			assert.deepEqual([...matMulBigIntLazy(genA(), genB())], [
				[-8n, 64n],
				[-83n, 54n],
			])
		})
	})

	describe('validation and error edge cases', () => {
		test('throws RangeError on dimension mismatch', () => {
			const a = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
			]
			const b = [
				[1n, 2n],
				[3n, 4n],
			]
			assert.throws(() => [...matMulBigIntLazy(a, b)], RangeError)
		})

		test('throws RangeError on ragged rows in A', () => {
			const raggedA = [
				[1n, 2n],
				[3n],
			]
			const b = [
				[1n, 0n],
				[0n, 1n],
			]
			assert.throws(() => [...matMulBigIntLazy(raggedA, b)], RangeError)
		})

		test('throws RangeError on ragged rows in B', () => {
			const a = [
				[1n, 2n],
				[3n, 4n],
			]
			const raggedB = [
				[1n, 2n],
				[3n, 4n, 5n],
			]
			assert.throws(() => [...matMulBigIntLazy(a, raggedB)], RangeError)
		})

		test('throws RangeError on empty matrices and empty rows', () => {
			const valid = [[1n]]
			function* emptyGen() {}

			assert.throws(() => [...matMulBigIntLazy([], valid)], RangeError)
			assert.throws(() => [...matMulBigIntLazy(emptyGen(), valid)], RangeError)
			assert.throws(() => [...matMulBigIntLazy(valid, [])], RangeError)
			assert.throws(() => [...matMulBigIntLazy(valid, emptyGen())], RangeError)
			assert.throws(() => [...matMulBigIntLazy([[]], valid)], RangeError)
			assert.throws(() => [...matMulBigIntLazy(valid, [[]])], RangeError)
		})

		test('throws TypeError on non-iterable matrices, string inputs, or non-bigint entries', () => {
			const valid = [[1n]]
			assert.throws(() => [...matMulBigIntLazy(null, valid)], TypeError)
			assert.throws(() => [...matMulBigIntLazy(valid, undefined)], TypeError)
			assert.throws(() => [...matMulBigIntLazy('123', valid)], TypeError)
			assert.throws(() => [...matMulBigIntLazy(valid, '123')], TypeError)
			assert.throws(() => [...matMulBigIntLazy([123n], valid)], TypeError)
			assert.throws(() => [...matMulBigIntLazy(['12'], valid)], TypeError)
			assert.throws(() => [...matMulBigIntLazy([[1]], valid)], TypeError)
			assert.throws(() => [...matMulBigIntLazy(valid, [[1]])], TypeError)
			assert.throws(() => [...matMulBigIntLazy([[1n, '2']], [[1n], [2n]])], TypeError)
		})
	})

	describe('independent algebraic cross-checks', () => {
		test('satisfies associativity (AB)C === A(BC) including chained lazy generators', () => {
			const a = [
				[3n, -7n, 11n],
				[13n, 0n, -5n],
				[-2n, 19n, 4n],
				[8n, -1n, 6n],
			]
			const b = [
				[5n, -3n],
				[2n, 17n],
				[-9n, 4n],
			]
			const c = [
				[10n ** 25n + 3n, -4n, 7n],
				[11n, -(10n ** 25n) + 1n, -13n],
			]

			const left = [...matMulBigIntLazy(matMulBigIntLazy(a, b), c)]
			const right = [...matMulBigIntLazy(a, matMulBigIntLazy(b, c))]
			assert.deepEqual(left, right)
		})

		test('satisfies transpose identity (AB)^T === B^T A^T', () => {
			const a = [
				[12n, -5n, 8n, 0n],
				[-3n, 14n, -7n, 9n],
				[2n, 6n, -11n, 4n],
			]
			const b = [
				[5n, -2n],
				[1n, 13n],
				[-8n, 7n],
				[15n, -4n],
			]

			const abT = transpose([...matMulBigIntLazy(a, b)])
			const btAt = [...matMulBigIntLazy(transpose(b), transpose(a))]
			assert.deepEqual(abT, btAt)
		})

		test('satisfies distributivity A(B + C) === AB + AC', () => {
			const a = [
				[4n, -9n, 2n],
				[7n, 3n, -6n],
			]
			const b = [
				[1n, -2n],
				[5n, 8n],
				[-3n, 4n],
			]
			const c = [
				[-6n, 9n],
				[2n, -1n],
				[7n, 3n],
			]

			const left = [...matMulBigIntLazy(a, matAdd(b, c))]
			const right = matAdd([...matMulBigIntLazy(a, b)], [...matMulBigIntLazy(a, c)])
			assert.deepEqual(left, right)
		})
	})
})
