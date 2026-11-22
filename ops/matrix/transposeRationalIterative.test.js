import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { transposeRationalIterative } from './transposeRationalIterative.js'

const r = (num, den = 1n) => ({ num, den })

// Independent reference helpers for algebraic cross-checks
function refGcd(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	return b === 0n ? a : refGcd(b, a % b)
}

function refNormalize({ num, den }) {
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = refGcd(num, den)
	return { num: num / g, den: den / g }
}

function refAdd(a, b) {
	return refNormalize({
		num: a.num * b.den + b.num * a.den,
		den: a.den * b.den,
	})
}

function refMul(a, b) {
	return refNormalize({
		num: a.num * b.num,
		den: a.den * b.den,
	})
}

function refMatMul(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const out = Array.from({ length: m }, () => Array.from({ length: n }, () => r(0n, 1n)))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = r(0n, 1n)
			for (let p = 0; p < k; p++) {
				sum = refAdd(sum, refMul(A[i][p], B[p][j]))
			}
			out[i][j] = sum
		}
	}
	return out
}

function refMatAdd(A, B) {
	return A.map((row, i) => row.map((val, j) => refAdd(val, B[i][j])))
}

describe('transposeRationalIterative', () => {
	it('transposes a square matrix', () => {
		const A = [
			[r(1n, 2n), r(3n, 4n), r(-5n, 6n)],
			[r(7n, 8n), r(0n, 1n), r(11n, 12n)],
			[r(-13n, 14n), r(15n, 16n), r(17n, 18n)],
		]
		const expected = [
			[r(1n, 2n), r(7n, 8n), r(-13n, 14n)],
			[r(3n, 4n), r(0n, 1n), r(15n, 16n)],
			[r(-5n, 6n), r(11n, 12n), r(17n, 18n)],
		]
		assert.deepEqual(transposeRationalIterative(A), expected)
	})

	it('transposes rectangular matrices (2x3 and 3x2)', () => {
		const rect2x3 = [
			[r(1n, 3n), r(2n, 5n), r(3n, 7n)],
			[r(-4n, 9n), r(5n, 11n), r(-6n, 13n)],
		]
		const rect3x2 = [
			[r(1n, 3n), r(-4n, 9n)],
			[r(2n, 5n), r(5n, 11n)],
			[r(3n, 7n), r(-6n, 13n)],
		]
		assert.deepEqual(transposeRationalIterative(rect2x3), rect3x2)
		assert.deepEqual(transposeRationalIterative(rect3x2), rect2x3)
	})

	it('transposes a 1x1 matrix', () => {
		const single = [[r(-14n, -21n)]]
		assert.deepEqual(transposeRationalIterative(single), [[r(2n, 3n)]])
	})

	it('transposes row and column vectors', () => {
		const rowVec = [[r(1n, 2n), r(-3n, 4n), r(5n, 6n), r(0n, -9n)]]
		const colVec = [[r(1n, 2n)], [r(-3n, 4n)], [r(5n, 6n)], [r(0n, 1n)]]
		assert.deepEqual(transposeRationalIterative(rowVec), colVec)
		assert.deepEqual(transposeRationalIterative(colVec), [
			[r(1n, 2n), r(-3n, 4n), r(5n, 6n), r(0n, 1n)],
		])
	})

	it('normalizes unreduced, negative-denominator, zero, and huge BigInt entries', () => {
		const bigA = 10n ** 40n
		const bigB = 3n * bigA
		const M = [
			[r(6n, 9n), r(4n, -8n), r(-15n, -25n)],
			[r(0n, 7n), r(0n, -100n), r(bigB, -bigA)],
		]
		const expected = [
			[r(2n, 3n), r(0n, 1n)],
			[r(-1n, 2n), r(0n, 1n)],
			[r(3n, 5n), r(-3n, 1n)],
		]
		assert.deepEqual(transposeRationalIterative(M), expected)
	})

	it('does not mutate input matrix or share entry references', () => {
		const entry00 = { num: 6n, den: -9n }
		const entry01 = { num: 0n, den: -5n }
		const entry10 = { num: 2n, den: 3n }
		const entry11 = { num: -4n, den: -6n }
		const input = [
			[entry00, entry01],
			[entry10, entry11],
		]

		const result = transposeRationalIterative(input)

		// Original entries remain completely untouched
		assert.deepEqual(input, [
			[{ num: 6n, den: -9n }, { num: 0n, den: -5n }],
			[{ num: 2n, den: 3n }, { num: -4n, den: -6n }],
		])

		// Returned entry objects are distinct references
		assert.notEqual(result[0][0], entry00)
		assert.notEqual(result[0][1], entry10)
		assert.notEqual(result[1][0], entry01)
		assert.notEqual(result[1][1], entry11)

		// Mutating output does not affect input
		result[0][1].num = 999n
		assert.equal(entry10.num, 2n)
	})

	it('rejects invalid matrix shapes and invalid rational entries', () => {
		// Non-array matrix
		assert.throws(() => transposeRationalIterative(null), TypeError)
		assert.throws(() => transposeRationalIterative(undefined), TypeError)
		assert.throws(() => transposeRationalIterative(42), TypeError)
		assert.throws(() => transposeRationalIterative('matrix'), TypeError)
		assert.throws(() => transposeRationalIterative({}), TypeError)

		// Empty matrix or empty rows
		assert.throws(() => transposeRationalIterative([]), RangeError)
		assert.throws(() => transposeRationalIterative([[]]), RangeError)
		assert.throws(() => transposeRationalIterative([[], []]), RangeError)

		// Non-array row
		assert.throws(() => transposeRationalIterative([null]), TypeError)
		assert.throws(() => transposeRationalIterative([[r(1n, 1n)], 'bad']), TypeError)

		// Ragged matrix
		assert.throws(
			() =>
				transposeRationalIterative([
					[r(1n, 1n), r(2n, 1n)],
					[r(3n, 1n)],
				]),
			RangeError
		)

		// Invalid entry objects / types
		assert.throws(() => transposeRationalIterative([[null]]), TypeError)
		assert.throws(() => transposeRationalIterative([[undefined]]), TypeError)
		assert.throws(() => transposeRationalIterative([[1n]]), TypeError)
		assert.throws(() => transposeRationalIterative([[[1n, 2n]]]), TypeError)
		assert.throws(() => transposeRationalIterative([[{ num: 1, den: 2n }]]), TypeError)
		assert.throws(() => transposeRationalIterative([[{ num: 1n, den: 2 }]]), TypeError)
		assert.throws(() => transposeRationalIterative([[{ num: '1', den: '2' }]]), TypeError)
		assert.throws(() => transposeRationalIterative([[{ num: 1n }]]), TypeError)

		// Sparse array row
		const sparseRow = new Array(2)
		sparseRow[0] = r(1n, 1n)
		assert.throws(() => transposeRationalIterative([sparseRow]), TypeError)

		// Zero denominators
		assert.throws(() => transposeRationalIterative([[r(1n, 0n)]]), RangeError)
		assert.throws(() => transposeRationalIterative([[r(0n, 0n)]]), RangeError)
		assert.throws(
			() =>
				transposeRationalIterative([
					[r(1n, 2n), r(3n, 4n)],
					[r(5n, 6n), r(-7n, 0n)],
				]),
			RangeError
		)
	})

	it('cross-check: satisfies involution transpose(transpose(A)) === normalized(A)', () => {
		const A = [
			[r(12n, -18n), r(0n, -42n), r(-21n, -14n), r(100n, 250n)],
			[r(7n, 1n), r(-33n, 99n), r(18n, 24n), r(0n, 9n)],
			[r(-5n, -15n), r(49n, -7n), r(13n, 17n), r(-8n, 16n)],
		]
		const normalizedA = A.map((row) => row.map((entry) => refNormalize(entry)))
		const doubleTransposed = transposeRationalIterative(transposeRationalIterative(A))
		assert.deepEqual(doubleTransposed, normalizedA)
	})

	it('cross-check: satisfies (A * B)^T === B^T * A^T and (A + C)^T === A^T + C^T', () => {
		const A = [
			[r(2n, 3n), r(-6n, 9n), r(5n, -10n)],
			[r(0n, -3n), r(7n, 4n), r(-8n, -12n)],
		]
		const B = [
			[r(3n, 5n), r(-1n, 2n), r(4n, -6n), r(0n, 7n)],
			[r(9n, -3n), r(2n, 7n), r(5n, 10n), r(-11n, 13n)],
			[r(1n, 4n), r(-6n, -8n), r(3n, 11n), r(2n, 3n)],
		]
		const C = [
			[r(-1n, 6n), r(4n, 3n), r(7n, 10n)],
			[r(5n, 2n), r(-3n, 8n), r(1n, -3n)],
		]

		// (A * B)^T === B^T * A^T
		const leftMul = transposeRationalIterative(refMatMul(A, B))
		const rightMul = refMatMul(transposeRationalIterative(B), transposeRationalIterative(A))
		assert.deepEqual(leftMul, rightMul)

		// (A + C)^T === A^T + C^T
		const leftAdd = transposeRationalIterative(refMatAdd(A, C))
		const rightAdd = refMatAdd(transposeRationalIterative(A), transposeRationalIterative(C))
		assert.deepEqual(leftAdd, rightAdd)
	})
})
