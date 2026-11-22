import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matMulBigIntSeries } from './matMulBigIntSeries.js'

function transpose(matrix) {
	const rows = matrix.length
	const cols = matrix[0].length
	const out = Array.from({ length: cols }, () => new Array(rows))
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			out[j][i] = matrix[i][j]
		}
	}
	return out
}

function addMatrices(a, b) {
	return a.map((row, i) => row.map((val, j) => val + b[i][j]))
}

function identityMatrix(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n)),
	)
}

function zeroMatrix(rows, cols) {
	return Array.from({ length: rows }, () => new Array(cols).fill(0n))
}

function matPow(matrix, exp) {
	let result = identityMatrix(matrix.length)
	let base = matrix
	let e = exp
	while (e > 0n) {
		if ((e & 1n) === 1n) {
			result = matMulBigIntSeries(result, base)
		}
		e >>= 1n
		if (e > 0n) {
			base = matMulBigIntSeries(base, base)
		}
	}
	return result
}

function fibonacciIterative(n) {
	let prev = 0n
	let curr = 1n
	for (let i = 0; i < n; i++) {
		const next = prev + curr
		prev = curr
		curr = next
	}
	return prev
}

describe('matMulBigIntSeries', () => {
	describe('normal cases', () => {
		it('multiplies 2x2 square matrices including negative values', () => {
			const a = [
				[1n, 2n],
				[3n, -4n],
			]
			const b = [
				[5n, -6n],
				[7n, 8n],
			]
			assert.deepEqual(matMulBigIntSeries(a, b), [
				[19n, 10n],
				[-13n, -50n],
			])
		})

		it('multiplies 3x3 square matrices', () => {
			const a = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
				[7n, 8n, 9n],
			]
			const b = [
				[9n, 8n, 7n],
				[6n, 5n, 4n],
				[3n, 2n, 1n],
			]
			assert.deepEqual(matMulBigIntSeries(a, b), [
				[30n, 24n, 18n],
				[84n, 69n, 54n],
				[138n, 114n, 90n],
			])
		})

		it('multiplies rectangular matrices (2x3 by 3x4 -> 2x4)', () => {
			const a = [
				[1n, -2n, 3n],
				[4n, 0n, -5n],
			]
			const b = [
				[2n, 1n, 0n, -1n],
				[3n, -1n, 4n, 2n],
				[-2n, 5n, 1n, 3n],
			]
			assert.deepEqual(matMulBigIntSeries(a, b), [
				[-10n, 18n, -5n, 4n],
				[18n, -21n, -5n, -19n],
			])
		})

		it('computes dot product (1x4 by 4x1 -> 1x1) and outer product (3x1 by 1x3 -> 3x3)', () => {
			const row = [[2n, -3n, 5n, 7n]]
			const col = [[11n], [13n], [-17n], [19n]]
			assert.deepEqual(matMulBigIntSeries(row, col), [[31n]])

			const u = [[2n], [-3n], [5n]]
			const v = [[7n, -11n, 13n]]
			assert.deepEqual(matMulBigIntSeries(u, v), [
				[14n, -22n, 26n],
				[-21n, 33n, -39n],
				[35n, -55n, 65n],
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
			matMulBigIntSeries(a, b)
			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})
	})

	describe('edge cases', () => {
		it('handles 1x1 matrices', () => {
			assert.deepEqual(matMulBigIntSeries([[6n]], [[-7n]]), [[-42n]])
			assert.deepEqual(matMulBigIntSeries([[0n]], [[999n]]), [[0n]])
		})

		it('preserves matrices under left and right identity multiplication', () => {
			const a = [
				[12n, -34n, 56n],
				[-78n, 90n, -11n],
			]
			assert.deepEqual(matMulBigIntSeries(identityMatrix(2), a), a)
			assert.deepEqual(matMulBigIntSeries(a, identityMatrix(3)), a)
		})

		it('returns zero matrix when multiplied by a zero matrix', () => {
			const a = [
				[3n, -1n, 4n],
				[1n, 5n, -9n],
			]
			assert.deepEqual(matMulBigIntSeries(a, zeroMatrix(3, 4)), zeroMatrix(2, 4))
			assert.deepEqual(matMulBigIntSeries(zeroMatrix(4, 2), a), zeroMatrix(4, 3))
		})

		it('computes exact products for huge BigInts beyond Number.MAX_SAFE_INTEGER', () => {
			const big1 = 10n ** 50n + 7n
			const big2 = 2n ** 256n - 1n
			const big3 = -(10n ** 40n) + 123456789012345678901234567890n
			const big4 = 10n ** 60n - 99n

			const a = [
				[big1, big2],
				[big3, big4],
			]
			const b = [
				[big4, big3],
				[big2, big1],
			]
			const expected = [
				[big1 * big4 + big2 * big2, big1 * big3 + big2 * big1],
				[big3 * big4 + big4 * big2, big3 * big3 + big4 * big1],
			]
			assert.deepEqual(matMulBigIntSeries(a, b), expected)
		})
	})

	describe('invalid inputs', () => {
		it('rejects non-array inputs', () => {
			const valid = [[1n]]
			for (const bad of [null, undefined, 42, 42n, '1', {}, true]) {
				assert.throws(() => matMulBigIntSeries(bad, valid), TypeError)
				assert.throws(() => matMulBigIntSeries(valid, bad), TypeError)
			}
		})

		it('rejects empty matrices and matrices with empty rows', () => {
			const valid = [[1n]]
			assert.throws(() => matMulBigIntSeries([], valid), RangeError)
			assert.throws(() => matMulBigIntSeries(valid, []), RangeError)
			assert.throws(() => matMulBigIntSeries([[]], valid), RangeError)
			assert.throws(() => matMulBigIntSeries(valid, [[], []]), RangeError)
		})

		it('rejects 1D arrays and ragged matrices', () => {
			const valid = [
				[1n, 2n],
				[3n, 4n],
			]
			assert.throws(() => matMulBigIntSeries([1n, 2n], valid), TypeError)
			assert.throws(() => matMulBigIntSeries(valid, [1n, 2n]), TypeError)

			const ragged = [
				[1n, 2n],
				[3n],
			]
			assert.throws(() => matMulBigIntSeries(ragged, valid), RangeError)
			assert.throws(() => matMulBigIntSeries(valid, ragged), RangeError)
		})

		it('rejects non-BigInt elements and sparse rows', () => {
			const valid = [
				[1n, 2n],
				[3n, 4n],
			]
			for (const badVal of [1, 0, NaN, '1', null, undefined, true, {}]) {
				const badMatrix = [
					[1n, 2n],
					[3n, badVal],
				]
				assert.throws(() => matMulBigIntSeries(badMatrix, valid), TypeError)
				assert.throws(() => matMulBigIntSeries(valid, badMatrix), TypeError)
			}

			const sparseRow = new Array(2)
			sparseRow[0] = 1n
			assert.throws(() => matMulBigIntSeries([sparseRow], [[1n], [2n]]), TypeError)
		})

		it('rejects incompatible inner dimensions', () => {
			const m2x3 = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
			]
			const m2x2 = [
				[1n, 2n],
				[3n, 4n],
			]
			assert.throws(() => matMulBigIntSeries(m2x3, m2x2), RangeError)
			assert.throws(() => matMulBigIntSeries([[1n, 2n]], [[1n], [2n], [3n]]), RangeError)
		})
	})

	describe('algebraic and independent cross-checks', () => {
		it('satisfies associativity (A*B)*C == A*(B*C)', () => {
			const a = [
				[10n ** 20n + 3n, -7n, 19n],
				[-5n, 2n ** 80n, -13n],
			]
			const b = [
				[2n, -3n, 5n, -7n],
				[11n, 13n, -17n, 19n],
				[-23n, 29n, 31n, -37n],
			]
			const c = [
				[41n, -43n],
				[47n, 53n],
				[-59n, 61n],
				[67n, -71n],
			]

			const left = matMulBigIntSeries(matMulBigIntSeries(a, b), c)
			const right = matMulBigIntSeries(a, matMulBigIntSeries(b, c))
			assert.deepEqual(left, right)
		})

		it('satisfies distributivity A*(B+C) == A*B + A*C', () => {
			const a = [
				[3n, -8n, 15n],
				[-2n, 9n, 4n],
			]
			const b = [
				[7n, -1n],
				[0n, 6n],
				[-5n, 12n],
			]
			const c = [
				[-4n, 11n],
				[8n, -3n],
				[2n, 9n],
			]

			const lhs = matMulBigIntSeries(a, addMatrices(b, c))
			const rhs = addMatrices(matMulBigIntSeries(a, b), matMulBigIntSeries(a, c))
			assert.deepEqual(lhs, rhs)
		})

		it('satisfies transpose identity (A*B)^T == B^T * A^T', () => {
			const a = [
				[12345678901234567890n, -42n, 99n],
				[7n, 88888888888888888888n, -3n],
			]
			const b = [
				[5n, -6n, 7n, 8n],
				[-9n, 10n, -11n, 12n],
				[13n, 14n, -15n, 16n],
			]

			const lhs = transpose(matMulBigIntSeries(a, b))
			const rhs = matMulBigIntSeries(transpose(b), transpose(a))
			assert.deepEqual(lhs, rhs)
		})

		it('matches independent Fibonacci sequence via Q-matrix exponentiation up to F_100', () => {
			const q = [
				[1n, 1n],
				[1n, 0n],
			]

			for (const n of [1, 2, 10, 50, 100]) {
				const qn = matPow(q, BigInt(n))
				assert.equal(qn[0][0], fibonacciIterative(n + 1))
				assert.equal(qn[0][1], fibonacciIterative(n))
				assert.equal(qn[1][0], fibonacciIterative(n))
				assert.equal(qn[1][1], fibonacciIterative(n - 1))
			}
			// Known exact value of F_100
			assert.equal(matPow(q, 100n)[0][1], 354224848179261915075n)
		})
	})
})
