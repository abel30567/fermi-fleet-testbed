import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { matMulRationalLazy } from './matMulRationalLazy.js'

/** Helper to construct a rational { num, den }. */
const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

/** Helper to construct an n x n identity matrix of rationals. */
function identity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? r(1, 1) : r(0, 1)))
	)
}

/** Helper to transpose a 2D array matrix. */
function transpose(m) {
	if (m.length === 0) return []
	return Array.from({ length: m[0].length }, (_, j) => m.map((row) => row[j]))
}

describe('matMulRationalLazy', () => {
	test('multiplies 2x2 rational matrices with exact reduction to lowest terms', () => {
		const A = [
			[r(1, 2), r(1, 3)],
			[r(2, 5), r(-3, 4)],
		]
		const B = [
			[r(3, 5), r(2, 3)],
			[r(6, 7), r(-1, 2)],
		]
		// C[0][0] = 3/10 + 2/7 = 41/70
		// C[0][1] = 1/3 - 1/6 = 1/6
		// C[1][0] = 6/25 - 9/14 = (84 - 225)/350 = -141/350
		// C[1][1] = 4/15 + 3/8 = (32 + 45)/120 = 77/120
		const expected = [
			[r(41, 70), r(1, 6)],
			[r(-141, 350), r(77, 120)],
		]
		const result = [...matMulRationalLazy(A, B)]
		assert.deepEqual(result, expected)
	})

	test('multiplies non-square matrices (2x3 * 3x4 -> 2x4, row*col -> 1x1, col*row -> 3x2)', () => {
		const A = [
			[r(1, 2), r(0, 1), r(-2, 3)],
			[r(3, 4), r(5, 6), r(1, 1)],
		]
		const B = [
			[r(2, 1), r(1, 3), r(0, 1), r(-1, 2)],
			[r(6, 5), r(-3, 2), r(4, 1), r(0, 1)],
			[r(3, 2), r(1, 4), r(-6, 5), r(9, 4)],
		]
		// Row 0:
		//   j=0: (1/2)*2 + 0 + (-2/3)*(3/2) = 1 - 1 = 0/1
		//   j=1: (1/2)*(1/3) + 0 + (-2/3)*(1/4) = 1/6 - 1/6 = 0/1
		//   j=2: 0 + 0 + (-2/3)*(-6/5) = 4/5
		//   j=3: (1/2)*(-1/2) + 0 + (-2/3)*(9/4) = -1/4 - 3/2 = -7/4
		// Row 1:
		//   j=0: (3/4)*2 + (5/6)*(6/5) + 1*(3/2) = 3/2 + 1 + 3/2 = 4/1
		//   j=1: (3/4)*(1/3) + (5/6)*(-3/2) + 1*(1/4) = 1/4 - 5/4 + 1/4 = -3/4
		//   j=2: 0 + (5/6)*4 + 1*(-6/5) = 10/3 - 6/5 = 32/15
		//   j=3: (3/4)*(-1/2) + 0 + 1*(9/4) = -3/8 + 18/8 = 15/8
		const expected = [
			[r(0, 1), r(0, 1), r(4, 5), r(-7, 4)],
			[r(4, 1), r(-3, 4), r(32, 15), r(15, 8)],
		]
		assert.deepEqual([...matMulRationalLazy(A, B)], expected)

		// 1x3 * 3x1 -> 1x1
		const rowVec = [[r(1, 2), r(2, 3), r(3, 4)]]
		const colVec = [[r(2, 1)], [r(3, 2)], [r(4, 3)]]
		assert.deepEqual([...matMulRationalLazy(rowVec, colVec)], [[r(3, 1)]])

		// 3x1 * 1x2 -> 3x2 outer product
		const outer = [...matMulRationalLazy([[r(1, 2)], [r(-2, 3)], [r(0, 5)]], [[r(3, 4), r(-6, 5)]])]
		assert.deepEqual(outer, [
			[r(3, 8), r(-3, 5)],
			[r(-1, 2), r(4, 5)],
			[r(0, 1), r(0, 1)],
		])
	})

	test('normalizes unreduced inputs, negative denominators, and zero entries', () => {
		const A = [
			[r(6, -9), r(0, -5)],
			[r(-4, -8), r(10, 15)],
		]
		const B = identity(2)
		const expected = [
			[r(-2, 3), r(0, 1)],
			[r(1, 2), r(2, 3)],
		]
		assert.deepEqual([...matMulRationalLazy(A, B)], expected)
		assert.deepEqual([...matMulRationalLazy(B, A)], expected)

		// Verify output objects are fresh (not aliased to inputs)
		const out = [...matMulRationalLazy(A, B)]
		out[0][0].num = 999n
		assert.equal(A[0][0].num, 6n)
	})

	test('identity matrix leaves arbitrary rational matrix unchanged (left and right)', () => {
		const A = [
			[r(7, 13), r(-11, 17), r(0, 1)],
			[r(23, 29), r(31, 37), r(-41, 43)],
		]
		assert.deepEqual([...matMulRationalLazy(identity(2), A)], A)
		assert.deepEqual([...matMulRationalLazy(A, identity(3))], A)
	})

	test('handles empty matrices cleanly', () => {
		assert.deepEqual([...matMulRationalLazy([], [])], [])
		assert.deepEqual([...matMulRationalLazy([], [[r(1, 2), r(3, 4)]])], [])
		// 2x0 * 0x0 -> 2x0
		assert.deepEqual([...matMulRationalLazy([[], []], [])], [[], []])
		// 1x1 * 1x0 -> 1x0
		assert.deepEqual([...matMulRationalLazy([[r(5, 3)]], [[]])], [[]])
	})

	test('consumes matrix A lazily row-by-row and supports single-pass generator inputs', () => {
		let aRowsPulled = 0
		let aClosed = false
		function* genA() {
			try {
				for (let i = 1n; ; i++) {
					aRowsPulled++
					// Yield each row itself as a lazy generator
					yield (function* () {
						yield { num: i, den: 2n }
						yield { num: i * 2n, den: 3n }
					})()
				}
			} finally {
				aClosed = true
			}
		}

		let bRowsPulled = 0
		function* genB() {
			bRowsPulled++
			yield (function* () {
				yield r(2, 1)
				yield r(0, 1)
			})()
			bRowsPulled++
			yield (function* () {
				yield r(0, 1)
				yield r(3, 1)
			})()
		}

		const gen = matMulRationalLazy(genA(), genB())
		// Neither A nor B should be consumed before first .next()
		assert.equal(aRowsPulled, 0)
		assert.equal(bRowsPulled, 0)

		const first = gen.next()
		assert.equal(first.done, false)
		assert.deepEqual(first.value, [r(1, 1), r(2, 1)])
		assert.equal(aRowsPulled, 1)
		assert.equal(bRowsPulled, 2)

		const second = gen.next()
		assert.equal(second.done, false)
		assert.deepEqual(second.value, [r(2, 1), r(4, 1)])
		assert.equal(aRowsPulled, 2)

		const third = gen.next()
		assert.equal(third.done, false)
		assert.deepEqual(third.value, [r(3, 1), r(6, 1)])
		assert.equal(aRowsPulled, 3)

		// Early termination closes infinite generator A cleanly
		gen.return()
		assert.equal(aClosed, true)
		assert.equal(aRowsPulled, 3)
	})

	test('handles very large BigInt rationals without precision loss', () => {
		const big = 10n ** 40n
		const A = [[{ num: big + 1n, den: big }, { num: -1n, den: big }]]
		const B = [[{ num: big, den: 1n }], [{ num: big, den: 1n }]]
		// ((big + 1)/big)*big + (-1/big)*big = big + 1 - 1 = big
		assert.deepEqual([...matMulRationalLazy(A, B)], [[{ num: big, den: 1n }]])
	})

	test('validates inputs strictly: types, zero denominators, ragged rows, dimension mismatch', () => {
		// Non-iterable / primitive top-level args throw synchronously
		assert.throws(() => matMulRationalLazy(null, []), TypeError)
		assert.throws(() => matMulRationalLazy([], undefined), TypeError)
		assert.throws(() => matMulRationalLazy('abc', []), TypeError)
		assert.throws(() => matMulRationalLazy([], 42), TypeError)
		assert.throws(() => matMulRationalLazy({}, []), TypeError)

		// Non-iterable rows
		assert.throws(() => [...matMulRationalLazy([123], [[r(1)]])], TypeError)
		assert.throws(() => [...matMulRationalLazy([[r(1)]], ['bad'])], TypeError)

		// Invalid rational objects
		assert.throws(() => [...matMulRationalLazy([[null]], [[r(1)]])], TypeError)
		assert.throws(() => [...matMulRationalLazy([[{ num: 1, den: 2 }]], [[r(1)]])], TypeError)
		assert.throws(() => [...matMulRationalLazy([[r(1)]], [[{ num: 1n, den: '2' }]])], TypeError)
		assert.throws(() => [...matMulRationalLazy([[{ num: 1n }]], [[r(1)]])], TypeError)

		// Zero denominator
		assert.throws(() => [...matMulRationalLazy([[r(1, 0)]], [[r(1)]])], RangeError)
		assert.throws(() => [...matMulRationalLazy([[r(1)]], [[r(0, 0)]])], RangeError)
		// Zero denominator in B caught even when A is empty
		assert.throws(() => [...matMulRationalLazy([], [[r(1, 0)]])], RangeError)

		// Dimension mismatch
		assert.throws(
			() => [...matMulRationalLazy([[r(1), r(2)]], [[r(1)]])],
			RangeError
		)
		assert.throws(
			() => [...matMulRationalLazy([[r(1), r(2)]], [])],
			RangeError
		)

		// Ragged matrix B
		assert.throws(
			() => [...matMulRationalLazy([[r(1), r(2)]], [[r(1), r(2)], [r(3)]])],
			RangeError
		)

		// Ragged matrix A (detected lazily when ragged row is reached)
		const gen = matMulRationalLazy(
			[
				[r(1), r(2)],
				[r(3)],
			],
			[[r(1)], [r(2)]]
		)
		assert.deepEqual(gen.next().value, [r(5)])
		assert.throws(() => gen.next(), RangeError)
	})

	test('independent cross-checks: associativity, transpose law, and Hilbert matrix inverse', () => {
		const A = [
			[r(1, 2), r(-2, 3), r(5, 7)],
			[r(3, 5), r(7, 11), r(-1, 4)],
		]
		const B = [
			[r(-3, 4), r(1, 6), r(2, 5), r(0, 1)],
			[r(4, 9), r(-5, 3), r(1, 2), r(7, 8)],
			[r(2, 3), r(3, 7), r(-4, 5), r(1, 3)],
		]
		const C = [
			[r(5, 6), r(-1, 2)],
			[r(2, 7), r(3, 4)],
			[r(-4, 3), r(1, 5)],
			[r(7, 9), r(-2, 11)],
		]

		// 1. Associativity: (A * B) * C === A * (B * C)
		const leftAssoc = [...matMulRationalLazy(matMulRationalLazy(A, B), C)]
		const rightAssoc = [...matMulRationalLazy(A, matMulRationalLazy(B, C))]
		assert.deepEqual(leftAssoc, rightAssoc)

		// 2. Transpose law: (A * B)^T === B^T * A^T
		const abT = transpose([...matMulRationalLazy(A, B)])
		const btAt = [...matMulRationalLazy(transpose(B), transpose(A))]
		assert.deepEqual(abT, btAt)

		// 3. Exact 3x3 Hilbert matrix * its exact inverse === I_3
		const H = [
			[r(1, 1), r(1, 2), r(1, 3)],
			[r(1, 2), r(1, 3), r(1, 4)],
			[r(1, 3), r(1, 4), r(1, 5)],
		]
		const Hinv = [
			[r(9), r(-36), r(30)],
			[r(-36), r(192), r(-180)],
			[r(30), r(-180), r(180)],
		]
		assert.deepEqual([...matMulRationalLazy(H, Hinv)], identity(3))
		assert.deepEqual([...matMulRationalLazy(Hinv, H)], identity(3))
	})
})
