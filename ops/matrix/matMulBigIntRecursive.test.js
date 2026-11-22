import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matMulBigIntRecursive } from './matMulBigIntRecursive.js'

/**
 * Independent naive iterative triple-loop reference implementation
 * for cross-checking exact BigInt matrix multiplication.
 */
function naiveMatMulBigInt(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const C = Array.from({ length: m }, () => new Array(n).fill(0n))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0n
			for (let p = 0; p < k; p++) {
				sum += A[i][p] * B[p][j]
			}
			C[i][j] = sum
		}
	}
	return C
}

function identityMatrix(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n))
	)
}

function zeroMatrix(rows, cols) {
	return Array.from({ length: rows }, () => new Array(cols).fill(0n))
}

function addMatrices(A, B) {
	return A.map((row, i) => row.map((val, j) => val + B[i][j]))
}

function transpose(M) {
	const rows = M.length
	const cols = M[0].length
	return Array.from({ length: cols }, (_, j) =>
		Array.from({ length: rows }, (_, i) => M[i][j])
	)
}

function det3x3(M) {
	const [[a, b, c], [d, e, f], [g, h, i]] = M
	return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
}

/**
 * Deterministic LCG-based BigInt matrix generator (signed arbitrary bit-width).
 */
function makeDeterministicMatrix(rows, cols, seedBigInt, limbs = 2) {
	let state = seedBigInt & ((1n << 64n) - 1n)
	const mod = 1n << 64n
	const next64 = () => {
		state = (state * 6364136223846793005n + 1442695040888963407n) % mod
		return state
	}
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => {
			let val = 0n
			for (let l = 0; l < limbs; l++) {
				val = (val << 64n) | next64()
			}
			// Make signed
			const sign = (next64() & 1n) === 0n ? 1n : -1n
			return sign * val
		})
	)
}

describe('matMulBigIntRecursive', () => {
	describe('normal cases', () => {
		it('multiplies 2x2 matrices with positive and negative BigInts', () => {
			const A = [
				[1n, 2n],
				[3n, 4n],
			]
			const B = [
				[5n, 6n],
				[7n, 8n],
			]
			assert.deepEqual(matMulBigIntRecursive(A, B), [
				[19n, 22n],
				[43n, 50n],
			])

			const C = [
				[-2n, 5n],
				[7n, -3n],
			]
			const D = [
				[4n, -1n],
				[-6n, 2n],
			]
			assert.deepEqual(matMulBigIntRecursive(C, D), [
				[-38n, 12n],
				[46n, -13n],
			])
		})

		it('multiplies rectangular matrices (2x3 * 3x2 and 3x2 * 2x4)', () => {
			const A = [
				[1n, -2n, 3n],
				[4n, 5n, -6n],
			]
			const B = [
				[7n, 8n],
				[-9n, 10n],
				[11n, -12n],
			]
			assert.deepEqual(matMulBigIntRecursive(A, B), [
				[58n, -48n],
				[-83n, 154n],
			])

			const P = [
				[2n, -1n],
				[0n, 3n],
				[4n, 5n],
			]
			const Q = [
				[1n, 2n, -3n, 4n],
				[-5n, 6n, 7n, -8n],
			]
			assert.deepEqual(matMulBigIntRecursive(P, Q), [
				[7n, -2n, -13n, 16n],
				[-15n, 18n, 21n, -24n],
				[-21n, 38n, 23n, -24n],
			])
		})

		it('preserves exact precision for very large BigInts (> 2^128)', () => {
			const big1 = 10n ** 50n + 1234567890123456789n
			const big2 = -(10n ** 45n + 9876543210987654321n)
			const big3 = (1n << 200n) - 1n
			const big4 = -((1n << 180n) + 77777777777777777n)

			const A = [
				[big1, big2],
				[big3, big4],
			]
			const B = [
				[big4, big1],
				[big2, big3],
			]

			const expected = [
				[big1 * big4 + big2 * big2, big1 * big1 + big2 * big3],
				[big3 * big4 + big4 * big2, big3 * big1 + big4 * big3],
			]
			assert.deepEqual(matMulBigIntRecursive(A, B), expected)
		})
	})

	describe('edge cases', () => {
		it('handles 1x1 scalar matrices including 0 and negative values', () => {
			assert.deepEqual(matMulBigIntRecursive([[0n]], [[0n]]), [[0n]])
			assert.deepEqual(matMulBigIntRecursive([[7n]], [[-3n]]), [[-21n]])
			assert.deepEqual(
				matMulBigIntRecursive([[10n ** 30n]], [[-(10n ** 30n)]]),
				[[-(10n ** 60n)]]
			)
		})

		it('handles inner product (1xN * Nx1) and outer product (Mx1 * 1xN)', () => {
			const row = [[1n, -2n, 3n, -4n, 5n]]
			const col = [[10n], [20n], [30n], [40n], [50n]]
			// 10 - 40 + 90 - 160 + 250 = 150
			assert.deepEqual(matMulBigIntRecursive(row, col), [[150n]])

			const u = [[2n], [-3n], [5n]]
			const v = [[7n, -11n, 13n, -17n]]
			assert.deepEqual(matMulBigIntRecursive(u, v), [
				[14n, -22n, 26n, -34n],
				[-21n, 33n, -39n, 51n],
				[35n, -55n, 65n, -85n],
			])
		})

		it('satisfies identity and zero matrix properties', () => {
			const A = [
				[3n, -1n, 4n, 1n, -5n],
				[9n, 2n, -6n, 5n, 3n],
				[5n, -8n, 9n, 7n, -9n],
			]
			assert.deepEqual(matMulBigIntRecursive(A, identityMatrix(5)), A)
			assert.deepEqual(matMulBigIntRecursive(identityMatrix(3), A), A)
			assert.deepEqual(matMulBigIntRecursive(A, zeroMatrix(5, 4)), zeroMatrix(3, 4))
			assert.deepEqual(matMulBigIntRecursive(zeroMatrix(2, 3), A), zeroMatrix(2, 5))
		})

		it('does not mutate input matrices', () => {
			const A = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
			]
			const B = [
				[7n, 8n],
				[9n, 10n],
				[11n, 12n],
			]
			const aSnap = A.map((r) => [...r])
			const bSnap = B.map((r) => [...r])

			const C = matMulBigIntRecursive(A, B)
			C[0][0] = 999999n

			assert.deepEqual(A, aSnap)
			assert.deepEqual(B, bSnap)
		})
	})

	describe('algebraic identities & independent cross-checks', () => {
		it('satisfies associativity, distributivity, and transpose identity', () => {
			const A = makeDeterministicMatrix(5, 7, 101n, 1)
			const B = makeDeterministicMatrix(7, 6, 202n, 1)
			const C = makeDeterministicMatrix(6, 4, 303n, 1)
			const B2 = makeDeterministicMatrix(7, 6, 404n, 1)

			// Associativity: (A * B) * C === A * (B * C)
			const leftAssoc = matMulBigIntRecursive(matMulBigIntRecursive(A, B), C)
			const rightAssoc = matMulBigIntRecursive(A, matMulBigIntRecursive(B, C))
			assert.deepEqual(leftAssoc, rightAssoc)

			// Left distributivity: A * (B + B2) === A * B + A * B2
			const distLeft = matMulBigIntRecursive(A, addMatrices(B, B2))
			const distRight = addMatrices(
				matMulBigIntRecursive(A, B),
				matMulBigIntRecursive(A, B2)
			)
			assert.deepEqual(distLeft, distRight)

			// Transpose identity: (A * B)^T === B^T * A^T
			assert.deepEqual(
				transpose(matMulBigIntRecursive(A, B)),
				matMulBigIntRecursive(transpose(B), transpose(A))
			)
		})

		it('satisfies det(A * B) === det(A) * det(B) for 3x3 BigInt matrices', () => {
			const A = makeDeterministicMatrix(3, 3, 777n, 1)
			const B = makeDeterministicMatrix(3, 3, 888n, 1)
			const AB = matMulBigIntRecursive(A, B)
			assert.equal(det3x3(AB), det3x3(A) * det3x3(B))
		})

		it('computes exact F_100 via matrix exponentiation Q^100', () => {
			const Q = [
				[1n, 1n],
				[1n, 0n],
			]
			// Recursive binary exponentiation using matMulBigIntRecursive
			function matPow(M, exp) {
				if (exp === 0) return identityMatrix(M.length)
				if (exp === 1) return M
				const half = matPow(M, exp >>> 1)
				const sq = matMulBigIntRecursive(half, half)
				return (exp & 1) === 1 ? matMulBigIntRecursive(sq, M) : sq
			}

			const Q100 = matPow(Q, 100)
			// Independent iterative Fibonacci calculation
			let fPrev = 0n
			let fCurr = 1n
			for (let i = 2; i <= 100; i++) {
				const next = fPrev + fCurr
				fPrev = fCurr
				fCurr = next
			}
			assert.equal(fCurr, 354224848179261915075n)
			assert.equal(Q100[0][1], fCurr)
			assert.equal(Q100[1][0], fCurr)
			assert.equal(Q100[1][1], fPrev)
			assert.equal(Q100[0][0], fCurr + fPrev)
		})

		it('matches naive iterative reference across varied shapes and 128-bit entries', () => {
			const shapes = [
				[1, 1, 1],
				[1, 19, 1],
				[19, 1, 17],
				[3, 3, 3],
				[4, 4, 4],
				[7, 11, 5],
				[13, 17, 19],
				[16, 16, 16],
				[25, 31, 23],
				[32, 32, 32],
			]

			for (let idx = 0; idx < shapes.length; idx++) {
				const [m, k, n] = shapes[idx]
				const A = makeDeterministicMatrix(m, k, BigInt(idx * 997 + 1), 2)
				const B = makeDeterministicMatrix(k, n, BigInt(idx * 997 + 503), 2)
				const actual = matMulBigIntRecursive(A, B)
				const expected = naiveMatMulBigInt(A, B)
				assert.deepEqual(
					actual,
					expected,
					`Mismatch for shape ${m}x${k} * ${k}x${n}`
				)
			}
		})
	})

	describe('validation & error handling', () => {
		it('throws TypeError for non-array matrix arguments', () => {
			const valid = [[1n]]
			for (const bad of [null, undefined, 42, 42n, 'matrix', {}]) {
				assert.throws(() => matMulBigIntRecursive(bad, valid), TypeError)
				assert.throws(() => matMulBigIntRecursive(valid, bad), TypeError)
			}
		})

		it('throws TypeError for non-array rows or non-BigInt elements', () => {
			const valid = [[1n]]
			assert.throws(() => matMulBigIntRecursive([1n], valid), TypeError)
			assert.throws(() => matMulBigIntRecursive([[1n], 'not-a-row'], valid), TypeError)
			assert.throws(() => matMulBigIntRecursive([[1]], valid), TypeError)
			assert.throws(() => matMulBigIntRecursive([[1n, '2']], [[1n], [2n]]), TypeError)
			assert.throws(() => matMulBigIntRecursive(valid, [[null]]), TypeError)
			assert.throws(() => matMulBigIntRecursive(valid, [[true]]), TypeError)
			assert.throws(() => matMulBigIntRecursive(valid, [[undefined]]), TypeError)
		})

		it('throws RangeError for empty matrices or empty rows', () => {
			const valid = [[1n]]
			assert.throws(() => matMulBigIntRecursive([], valid), RangeError)
			assert.throws(() => matMulBigIntRecursive(valid, []), RangeError)
			assert.throws(() => matMulBigIntRecursive([[]], valid), RangeError)
			assert.throws(() => matMulBigIntRecursive(valid, [[], []]), RangeError)
		})

		it('throws RangeError for ragged matrices', () => {
			const ragged = [[1n, 2n], [3n]]
			const valid2x2 = [
				[1n, 0n],
				[0n, 1n],
			]
			assert.throws(() => matMulBigIntRecursive(ragged, valid2x2), RangeError)
			assert.throws(() => matMulBigIntRecursive(valid2x2, ragged), RangeError)
		})

		it('throws RangeError for incompatible inner dimensions', () => {
			const m2x3 = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
			]
			const m2x2 = [
				[1n, 2n],
				[3n, 4n],
			]
			assert.throws(
				() => matMulBigIntRecursive(m2x3, m2x2),
				{ name: 'RangeError', message: /Incompatible matrix dimensions/ }
			)
			assert.throws(
				() => matMulBigIntRecursive(m2x3, m2x3),
				{ name: 'RangeError', message: /Incompatible matrix dimensions/ }
			)
			assert.throws(
				() => matMulBigIntRecursive([[1n, 2n]], [[1n], [2n], [3n]]),
				RangeError
			)
		})
	})
})
