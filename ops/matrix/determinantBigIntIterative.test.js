import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { determinantBigIntIterative } from './determinantBigIntIterative.js'

/**
 * Independent reference determinant via Laplace cofactor expansion (for small n).
 * @param {readonly (readonly bigint[])[]} m
 * @returns {bigint}
 */
function referenceCofactorDet(m) {
	const n = m.length
	if (n === 0) return 1n
	if (n === 1) return m[0][0]
	if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0]

	let det = 0n
	for (let col = 0; col < n; col++) {
		const entry = m[0][col]
		if (entry === 0n) continue
		const minor = []
		for (let r = 1; r < n; r++) {
			const row = []
			for (let c = 0; c < n; c++) {
				if (c !== col) row.push(m[r][c])
			}
			minor.push(row)
		}
		const sign = col % 2 === 0 ? 1n : -1n
		det += sign * entry * referenceCofactorDet(minor)
	}
	return det
}

/**
 * Multiply two n x n BigInt matrices.
 * @param {bigint[][]} a
 * @param {bigint[][]} b
 * @returns {bigint[][]}
 */
function matMul(a, b) {
	const n = a.length
	const out = Array.from({ length: n }, () => new Array(n).fill(0n))
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < n; k++) {
			for (let j = 0; j < n; j++) {
				out[i][j] += a[i][k] * b[k][j]
			}
		}
	}
	return out
}

/**
 * Transpose an n x n BigInt matrix.
 * @param {bigint[][]} m
 * @returns {bigint[][]}
 */
function transpose(m) {
	const n = m.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => m[j][i])
	)
}

/**
 * Deterministic LCG PRNG for reproducible tests.
 * @param {bigint} seed
 */
function makeRng(seed) {
	let state = seed
	return () => {
		state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
		return state
	}
}

describe('determinantBigIntIterative', () => {
	describe('normal cases', () => {
		it('computes 1x1 matrices', () => {
			assert.equal(determinantBigIntIterative([[0n]]), 0n)
			assert.equal(determinantBigIntIterative([[7n]]), 7n)
			assert.equal(determinantBigIntIterative([[-42n]]), -42n)
		})

		it('computes 2x2 matrices', () => {
			assert.equal(
				determinantBigIntIterative([
					[3n, 8n],
					[4n, 6n],
				]),
				-14n
			)
			assert.equal(
				determinantBigIntIterative([
					[-5n, 2n],
					[7n, -3n],
				]),
				1n
			)
		})

		it('computes 3x3 matrices', () => {
			assert.equal(
				determinantBigIntIterative([
					[6n, 1n, 1n],
					[4n, -2n, 5n],
					[2n, 8n, 7n],
				]),
				-306n
			)
			assert.equal(
				determinantBigIntIterative([
					[1n, 2n, 3n],
					[0n, 4n, 5n],
					[1n, 0n, 6n],
				]),
				22n
			)
		})

		it('handles row swaps at k = 0 and mid-elimination (k >= 1) with negative prevPivot', () => {
			// Requires a row swap at k = 1 after prevPivot = -2n
			const m = [
				[-2n, 3n, 1n, 4n],
				[2n, -3n, 5n, 1n],
				[1n, 2n, -1n, 3n],
				[4n, 1n, 2n, -2n],
			]
			assert.equal(determinantBigIntIterative(m), -343n)
			assert.equal(determinantBigIntIterative(m), referenceCofactorDet(m))

			// Zero in top-left corner forcing immediate row swap
			const m2 = [
				[0n, 2n, 1n, 3n],
				[0n, 0n, 4n, 1n],
				[5n, 1n, 2n, 0n],
				[0n, 3n, 0n, 2n],
			]
			assert.equal(determinantBigIntIterative(m2), referenceCofactorDet(m2))
		})
	})

	describe('edge cases', () => {
		it('returns 1n for empty 0x0 matrix', () => {
			assert.equal(determinantBigIntIterative([]), 1n)
		})

		it('returns 1n for identity matrices of various sizes', () => {
			for (const n of [1, 2, 3, 5, 10]) {
				const id = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n))
				)
				assert.equal(determinantBigIntIterative(id), 1n)
			}
		})

		it('returns 0n for zero and singular matrices', () => {
			const zero4 = Array.from({ length: 4 }, () => new Array(4).fill(0n))
			assert.equal(determinantBigIntIterative(zero4), 0n)

			// Linearly dependent rows: row 2 = row 0 + 2 * row 1
			const singular3 = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
				[9n, 12n, 15n],
			]
			assert.equal(determinantBigIntIterative(singular3), 0n)

			// Singular only after elimination (last diagonal becomes 0)
			const singular4 = [
				[1n, 2n, 3n, 4n],
				[2n, 5n, 7n, 9n],
				[3n, 8n, 11n, 14n],
				[1n, 1n, 1n, 1n],
			]
			assert.equal(determinantBigIntIterative(singular4), 0n)

			// Zero column in the middle
			const zeroCol = [
				[3n, 0n, 1n],
				[2n, 0n, 5n],
				[7n, 0n, 9n],
			]
			assert.equal(determinantBigIntIterative(zeroCol), 0n)
		})

		it('computes diagonal, triangular, and permutation matrices', () => {
			const upper = [
				[2n, 9n, -3n, 4n],
				[0n, -5n, 7n, 1n],
				[0n, 0n, 3n, -8n],
				[0n, 0n, 0n, 11n],
			]
			assert.equal(determinantBigIntIterative(upper), 2n * -5n * 3n * 11n)

			// 4-cycle permutation matrix has odd parity -> det = -1n
			const cycle4 = [
				[0n, 1n, 0n, 0n],
				[0n, 0n, 1n, 0n],
				[0n, 0n, 0n, 1n],
				[1n, 0n, 0n, 0n],
			]
			assert.equal(determinantBigIntIterative(cycle4), -1n)

			// 3-cycle permutation matrix has even parity -> det = 1n
			const cycle3 = [
				[0n, 1n, 0n],
				[0n, 0n, 1n],
				[1n, 0n, 0n],
			]
			assert.equal(determinantBigIntIterative(cycle3), 1n)
		})

		it('preserves exact precision for very large BigInt entries beyond float range', () => {
			const big = 10n ** 40n
			// [[big + 1, big], [big, big - 1]] => (big^2 - 1) - big^2 = -1n
			const nearSingular = [
				[big + 1n, big],
				[big, big - 1n],
			]
			assert.equal(determinantBigIntIterative(nearSingular), -1n)

			// 3x3 with entries around 10^30 where floating-point would catastrophically cancel
			const scale = 10n ** 30n
			const m = [
				[scale + 1n, scale + 2n, scale + 3n],
				[scale + 4n, scale + 5n, scale + 7n],
				[scale + 8n, scale + 10n, scale + 13n],
			]
			assert.equal(determinantBigIntIterative(m), referenceCofactorDet(m))
		})

		it('does not mutate the input matrix', () => {
			const original = [
				[0n, 3n, -1n],
				[2n, 5n, 4n],
				[-7n, 1n, 6n],
			]
			const snapshot = original.map((row) => [...row])
			const det = determinantBigIntIterative(original)
			assert.equal(det, referenceCofactorDet(snapshot))
			assert.deepEqual(original, snapshot)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when matrix is not an array', () => {
			for (const bad of [null, undefined, 0, 1n, '[[1n]]', {}, true]) {
				assert.throws(() => determinantBigIntIterative(bad), TypeError)
			}
		})

		it('throws TypeError when any row is not an array', () => {
			assert.throws(() => determinantBigIntIterative([1n]), TypeError)
			assert.throws(() => determinantBigIntIterative([null]), TypeError)
			assert.throws(() => determinantBigIntIterative([[1n, 2n], 'bad']), TypeError)
			// Sparse outer array
			const sparseOuter = new Array(2)
			sparseOuter[0] = [1n, 2n]
			assert.throws(() => determinantBigIntIterative(sparseOuter), TypeError)
		})

		it('throws RangeError for non-square or ragged matrices', () => {
			assert.throws(() => determinantBigIntIterative([[]]), RangeError)
			assert.throws(() => determinantBigIntIterative([[1n, 2n]]), RangeError)
			assert.throws(() => determinantBigIntIterative([[1n], [2n]]), RangeError)
			assert.throws(
				() =>
					determinantBigIntIterative([
						[1n, 2n, 3n],
						[4n, 5n],
						[6n, 7n, 8n],
					]),
				RangeError
			)
		})

		it('throws TypeError when any entry is not a BigInt', () => {
			assert.throws(() => determinantBigIntIterative([[1]]), TypeError)
			assert.throws(
				() =>
					determinantBigIntIterative([
						[1n, 2],
						[3n, 4n],
					]),
				TypeError
			)
			assert.throws(() => determinantBigIntIterative([['1']]), TypeError)
			assert.throws(() => determinantBigIntIterative([[null]]), TypeError)
			assert.throws(() => determinantBigIntIterative([[undefined]]), TypeError)
			assert.throws(() => determinantBigIntIterative([[NaN]]), TypeError)
			assert.throws(() => determinantBigIntIterative([[true]]), TypeError)
			// Sparse inner row
			const sparseRow = new Array(2)
			sparseRow[0] = 1n
			assert.throws(
				() => determinantBigIntIterative([sparseRow, [2n, 3n]]),
				TypeError
			)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		it('matches cofactor expansion on deterministic pseudo-random matrices (n = 1..6)', () => {
			const nextRand = makeRng(0x123456789abcdef0n)
			for (let n = 1; n <= 6; n++) {
				for (let trial = 0; trial < 8; trial++) {
					const m = Array.from({ length: n }, () =>
						Array.from({ length: n }, () => {
							const r = nextRand()
							// Bias ~30% zeros to exercise pivoting heavily
							if (r % 10n < 3n) return 0n
							return (r % 21n) - 10n
						})
					)
					assert.equal(
						determinantBigIntIterative(m),
						referenceCofactorDet(m),
						`mismatch for n=${n}, trial=${trial}`
					)
				}
			}
		})

		it('satisfies det(A * B) = det(A) * det(B), det(A^T) = det(A), and det(cA) = c^n det(A)', () => {
			const nextRand = makeRng(0xfedcba9876543210n)
			const n = 5
			const randomMat = () =>
				Array.from({ length: n }, () =>
					Array.from({ length: n }, () => (nextRand() % 41n) - 20n)
				)

			const A = randomMat()
			const B = randomMat()

			const detA = determinantBigIntIterative(A)
			const detB = determinantBigIntIterative(B)
			const detAB = determinantBigIntIterative(matMul(A, B))
			assert.equal(detAB, detA * detB)

			// Transpose invariance
			assert.equal(determinantBigIntIterative(transpose(A)), detA)

			// Scalar multiplication: det(c * A) = c^n * det(A)
			const c = -7n
			const cA = A.map((row) => row.map((v) => v * c))
			assert.equal(determinantBigIntIterative(cA), c ** BigInt(n) * detA)

			// Row swap negation
			const swapped = A.map((row) => [...row])
			;[swapped[1], swapped[4]] = [swapped[4], swapped[1]]
			assert.equal(determinantBigIntIterative(swapped), -detA)

			// Elementary row addition preserves determinant
			const sheared = A.map((row) => [...row])
			for (let j = 0; j < n; j++) {
				sheared[3][j] += 13n * sheared[0][j]
			}
			assert.equal(determinantBigIntIterative(sheared), detA)
		})

		it('matches closed-form Vandermonde determinant with large BigInt nodes', () => {
			const xs = [
				-(10n ** 12n),
				-3n,
				0n,
				5n,
				17n,
				10n ** 12n + 7n,
			]
			const n = xs.length
			const vandermonde = xs.map((x) =>
				Array.from({ length: n }, (_, j) => x ** BigInt(j))
			)

			let expected = 1n
			for (let i = 0; i < n; i++) {
				for (let j = i + 1; j < n; j++) {
					expected *= xs[j] - xs[i]
				}
			}

			assert.equal(determinantBigIntIterative(vandermonde), expected)
		})

		it('computes determinant = 1n for symmetric Pascal matrices up to 12x12', () => {
			for (const n of [4, 8, 12]) {
				const pascal = Array.from({ length: n }, () => new Array(n).fill(1n))
				for (let i = 1; i < n; i++) {
					for (let j = 1; j < n; j++) {
						pascal[i][j] = pascal[i - 1][j] + pascal[i][j - 1]
					}
				}
				assert.equal(determinantBigIntIterative(pascal), 1n)
			}
		})
	})
})
