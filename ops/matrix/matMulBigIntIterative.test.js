import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matMulBigIntIterative } from './matMulBigIntIterative.js'

function transpose(m) {
	const rows = m.length
	const cols = m[0].length
	const out = Array.from({ length: cols }, () => new Array(rows))
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			out[c][r] = m[r][c]
		}
	}
	return out
}

function matAdd(a, b) {
	return a.map((row, r) => row.map((v, c) => v + b[r][c]))
}

function det3x3(m) {
	return (
		m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
		m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
		m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
	)
}

function referenceDotProductMul(a, b) {
	const bt = transpose(b)
	return a.map((rowA) =>
		bt.map((colB) => rowA.reduce((acc, v, k) => acc + v * colB[k], 0n)),
	)
}

describe('matMulBigIntIterative', () => {
	describe('normal cases', () => {
		it('multiplies 2x2 square matrices', () => {
			const a = [
				[1n, 2n],
				[3n, 4n],
			]
			const b = [
				[5n, 6n],
				[7n, 8n],
			]
			assert.deepEqual(matMulBigIntIterative(a, b), [
				[19n, 22n],
				[43n, 50n],
			])
		})

		it('multiplies rectangular matrices (2x3 * 3x2 and 3x2 * 2x4)', () => {
			const a = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
			]
			const b = [
				[7n, 8n],
				[9n, 10n],
				[11n, 12n],
			]
			assert.deepEqual(matMulBigIntIterative(a, b), [
				[58n, 64n],
				[139n, 154n],
			])

			const c = [
				[1n, -2n],
				[0n, 3n],
				[4n, 5n],
			]
			const d = [
				[2n, 0n, -1n, 3n],
				[1n, 4n, 2n, -2n],
			]
			assert.deepEqual(matMulBigIntIterative(c, d), [
				[0n, -8n, -5n, 7n],
				[3n, 12n, 6n, -6n],
				[13n, 20n, 6n, 2n],
			])
		})

		it('computes inner product (1xk * kx1) and outer product (mx1 * 1xn)', () => {
			const row = [[2n, -3n, 5n]]
			const col = [[7n], [11n], [13n]]
			assert.deepEqual(matMulBigIntIterative(row, col), [[46n]])
			assert.deepEqual(matMulBigIntIterative(col, row), [
				[14n, -21n, 35n],
				[22n, -33n, 55n],
				[26n, -39n, 65n],
			])
		})

		it('does not mutate input matrices', () => {
			const a = [
				[1n, 2n],
				[3n, 4n],
			]
			const b = [
				[5n, 6n],
				[7n, 8n],
			]
			const aCopy = a.map((r) => [...r])
			const bCopy = b.map((r) => [...r])
			matMulBigIntIterative(a, b)
			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})
	})

	describe('edge cases', () => {
		it('handles 1x1 matrices', () => {
			assert.deepEqual(matMulBigIntIterative([[6n]], [[-7n]]), [[-42n]])
			assert.deepEqual(matMulBigIntIterative([[0n]], [[99n]]), [[0n]])
		})

		it('satisfies left and right identity matrix laws', () => {
			const id2 = [
				[1n, 0n],
				[0n, 1n],
			]
			const id3 = [
				[1n, 0n, 0n],
				[0n, 1n, 0n],
				[0n, 0n, 1n],
			]
			const m = [
				[-9n, 0n, 4n],
				[12n, -3n, 7n],
			]
			assert.deepEqual(matMulBigIntIterative(id2, m), m)
			assert.deepEqual(matMulBigIntIterative(m, id3), m)
		})

		it('handles zero matrices', () => {
			const zero = [
				[0n, 0n],
				[0n, 0n],
			]
			const m = [
				[5n, -8n],
				[13n, 21n],
			]
			assert.deepEqual(matMulBigIntIterative(zero, m), zero)
			assert.deepEqual(matMulBigIntIterative(m, zero), zero)
		})

		it('preserves exact precision for large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
			const big1 = 10n ** 30n + 7n
			const big2 = 10n ** 30n + 11n
			const big3 = -(2n ** 128n) + 1n
			const big4 = 2n ** 128n + 3n

			const a = [
				[big1, big3],
				[big2, big4],
			]
			const b = [
				[big4, -big1],
				[big2, big3],
			]

			const actual = matMulBigIntIterative(a, b)
			const expected = [
				[big1 * big4 + big3 * big2, big1 * -big1 + big3 * big3],
				[big2 * big4 + big4 * big2, big2 * -big1 + big4 * big3],
			]
			assert.deepEqual(actual, expected)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array matrix inputs', () => {
			const valid = [[1n]]
			for (const bad of [null, undefined, 42, 42n, '[[1n]]', {}]) {
				assert.throws(() => matMulBigIntIterative(bad, valid), TypeError)
				assert.throws(() => matMulBigIntIterative(valid, bad), TypeError)
			}
		})

		it('throws TypeError for non-array rows or non-bigint entries', () => {
			const valid = [[1n, 2n]]
			const validCol = [[1n], [2n]]
			assert.throws(() => matMulBigIntIterative([1n, 2n], validCol), TypeError)
			assert.throws(
				() => matMulBigIntIterative([[1n], 'not-a-row'], [[1n]]),
				TypeError,
			)
			assert.throws(() => matMulBigIntIterative([[1, 2]], validCol), TypeError)
			assert.throws(
				() => matMulBigIntIterative(valid, [[1n], ['2']]),
				TypeError,
			)
			assert.throws(
				() => matMulBigIntIterative([[0n, 0n]], [[1n], [2]]),
				TypeError,
			)
		})

		it('throws RangeError for empty or ragged matrices', () => {
			const valid = [[1n]]
			assert.throws(() => matMulBigIntIterative([], valid), RangeError)
			assert.throws(() => matMulBigIntIterative(valid, []), RangeError)
			assert.throws(() => matMulBigIntIterative([[]], valid), RangeError)
			assert.throws(() => matMulBigIntIterative(valid, [[]]), RangeError)
			assert.throws(
				() => matMulBigIntIterative([[1n, 2n], [3n]], [[1n], [2n]]),
				RangeError,
			)
			assert.throws(
				() =>
					matMulBigIntIterative(
						[[1n, 2n]],
						[
							[1n, 2n],
							[3n],
						],
					),
				RangeError,
			)
		})

		it('throws RangeError for incompatible inner dimensions', () => {
			const a = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
			]
			const b = [
				[1n, 2n],
				[3n, 4n],
			]
			assert.throws(() => matMulBigIntIterative(a, b), RangeError)
		})
	})

	describe('cross-checks and algebraic identities', () => {
		it('matches independent transpose-dot-product reference on rectangular matrices', () => {
			const a = Array.from({ length: 5 }, (_, r) =>
				Array.from({ length: 7 }, (_, c) => BigInt((r * 13 - c * 7 + 5) * (r + 1))),
			)
			const b = Array.from({ length: 7 }, (_, r) =>
				Array.from({ length: 4 }, (_, c) => BigInt(r * r - 3 * c + 2) * 10n ** 12n),
			)
			assert.deepEqual(
				matMulBigIntIterative(a, b),
				referenceDotProductMul(a, b),
			)
		})

		it('satisfies associativity, distributivity, and transpose identities', () => {
			const a = [
				[2n, -1n, 3n],
				[0n, 4n, -5n],
			]
			const b = [
				[1n, 3n],
				[-2n, 0n],
				[4n, -1n],
			]
			const c = [
				[5n, -2n, 1n],
				[3n, 1n, -4n],
			]
			const b2 = [
				[-3n, 2n],
				[1n, 5n],
				[0n, -2n],
			]

			// (A * B) * C === A * (B * C)
			assert.deepEqual(
				matMulBigIntIterative(matMulBigIntIterative(a, b), c),
				matMulBigIntIterative(a, matMulBigIntIterative(b, c)),
			)

			// A * (B + B2) === A * B + A * B2
			assert.deepEqual(
				matMulBigIntIterative(a, matAdd(b, b2)),
				matAdd(matMulBigIntIterative(a, b), matMulBigIntIterative(a, b2)),
			)

			// (A * B)^T === B^T * A^T
			assert.deepEqual(
				transpose(matMulBigIntIterative(a, b)),
				matMulBigIntIterative(transpose(b), transpose(a)),
			)
		})

		it('preserves determinant multiplicativity det(A * B) === det(A) * det(B)', () => {
			const a = [
				[3n, -1n, 2n],
				[5n, 0n, -4n],
				[-2n, 7n, 1n],
			]
			const b = [
				[-6n, 2n, 3n],
				[1n, 4n, -5n],
				[8n, -3n, 2n],
			]
			const ab = matMulBigIntIterative(a, b)
			assert.equal(det3x3(ab), det3x3(a) * det3x3(b))
		})

		it('computes Fibonacci Q-matrix power Q^100 matching scalar Fibonacci sequence', () => {
			const q = [
				[1n, 1n],
				[1n, 0n],
			]
			let power = [
				[1n, 0n],
				[0n, 1n],
			]
			for (let i = 0; i < 100; i++) {
				power = matMulBigIntIterative(power, q)
			}

			// Independent iterative scalar Fibonacci calculation
			let fPrev = 0n
			let fCurr = 1n
			for (let i = 1; i < 100; i++) {
				const next = fPrev + fCurr
				fPrev = fCurr
				fCurr = next
			}
			const f100 = fCurr
			const f99 = fPrev
			const f101 = f100 + f99

			assert.deepEqual(power, [
				[f101, f100],
				[f100, f99],
			])
			assert.equal(f100, 354224848179261915075n)
		})
	})
})
