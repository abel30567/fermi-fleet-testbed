import { describe, it } from 'node:test'
import assert from 'node:assert'
import { traceBigIntRecursive } from './traceBigIntRecursive.js'

/**
 * Deterministic PRNG (SplitMix64-inspired BigInt generator) for reproducible tests.
 *
 * @param {bigint} seed
 * @returns {() => bigint}
 */
function createRng(seed) {
	let state = seed
	const mask64 = (1n << 64n) - 1n
	return () => {
		state = (state + 0x9e3779b97f4a7c15n) & mask64
		let z = state
		z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & mask64
		z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & mask64
		return z ^ (z >> 31n)
	}
}

/**
 * Generates an n x n matrix of signed large BigInt values using the provided RNG.
 *
 * @param {number} n
 * @param {() => bigint} nextRand
 * @returns {bigint[][]}
 */
function randomBigIntMatrix(n, nextRand) {
	const half64 = 1n << 63n
	return Array.from({ length: n }, () =>
		Array.from({ length: n }, () => {
			const hi = nextRand() - half64
			const lo = nextRand()
			return (hi << 64n) | lo
		})
	)
}

/**
 * Independent naive iterative reference implementation of matrix trace.
 *
 * @param {bigint[][]} matrix
 * @returns {bigint}
 */
function iterativeTrace(matrix) {
	let sum = 0n
	for (let i = 0; i < matrix.length; i++) {
		sum += matrix[i][i]
	}
	return sum
}

/**
 * Naive BigInt matrix multiplication for algebraic cross-checks.
 *
 * @param {bigint[][]} a
 * @param {bigint[][]} b
 * @returns {bigint[][]}
 */
function matMul(a, b) {
	const n = a.length
	const out = Array.from({ length: n }, () => Array(n).fill(0n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let acc = 0n
			for (let k = 0; k < n; k++) {
				acc += a[i][k] * b[k][j]
			}
			out[i][j] = acc
		}
	}
	return out
}

describe('traceBigIntRecursive', () => {
	describe('normal cases', () => {
		it('computes trace of 1x1 matrices', () => {
			assert.strictEqual(traceBigIntRecursive([[0n]]), 0n)
			assert.strictEqual(traceBigIntRecursive([[42n]]), 42n)
			assert.strictEqual(traceBigIntRecursive([[-17n]]), -17n)
		})

		it('computes trace of 2x2 and 3x3 matrices', () => {
			assert.strictEqual(
				traceBigIntRecursive([
					[1n, 2n],
					[3n, 4n],
				]),
				5n
			)

			assert.strictEqual(
				traceBigIntRecursive([
					[10n, -99n, 50n],
					[7n, -3n, 8n],
					[100n, 200n, 5n],
				]),
				12n
			)
		})

		it('handles both power-of-two (4x4) and odd (5x5) dimensions', () => {
			const m4 = [
				[1n, 0n, 0n, 0n],
				[0n, 2n, 0n, 0n],
				[0n, 0n, 3n, 0n],
				[0n, 0n, 0n, 4n],
			]
			assert.strictEqual(traceBigIntRecursive(m4), 10n)

			const m5 = [
				[1n, 2n, 3n, 4n, 5n],
				[6n, -7n, 8n, 9n, 10n],
				[11n, 12n, 13n, 14n, 15n],
				[16n, 17n, 18n, -19n, 20n],
				[21n, 22n, 23n, 24n, 25n],
			]
			assert.strictEqual(traceBigIntRecursive(m5), 1n - 7n + 13n - 19n + 25n)
		})

		it('computes trace of identity and zero matrices', () => {
			const n = 7
			const identity = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n))
			)
			const zero = Array.from({ length: n }, () => Array(n).fill(0n))

			assert.strictEqual(traceBigIntRecursive(identity), 7n)
			assert.strictEqual(traceBigIntRecursive(zero), 0n)
		})
	})

	describe('edge cases', () => {
		it('returns 0n for an empty 0x0 matrix', () => {
			assert.strictEqual(traceBigIntRecursive([]), 0n)
		})

		it('preserves exact precision for values far beyond Number.MAX_SAFE_INTEGER', () => {
			const huge = 10n ** 100n
			const matrix = [
				[huge, 999n, -888n],
				[777n, -huge, 666n],
				[-555n, 444n, 123456789012345678901234567890n],
			]
			assert.strictEqual(traceBigIntRecursive(matrix), 123456789012345678901234567890n)
		})

		it('preserves scale for fixed-point BigInt values scaled by 10^18', () => {
			const SCALE = 10n ** 18n
			// Diagonal: 1.5, -0.25, 2.75 => sum = 4.0
			const matrix = [
				[(15n * SCALE) / 10n, 0n, 0n],
				[0n, (-25n * SCALE) / 100n, 0n],
				[0n, 0n, (275n * SCALE) / 100n],
			]
			assert.strictEqual(traceBigIntRecursive(matrix), 4n * SCALE)
		})

		it('handles larger matrices (128x128) without stack overflow and without mutating input', () => {
			const n = 128
			const matrix = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => BigInt(i * n + j))
			)
			const snapshot = matrix.map((row) => [...row])

			// Sum_{i=0}^{n-1} (i*n + i) = (n + 1) * n * (n - 1) / 2
			const expected = (BigInt(n + 1) * BigInt(n) * BigInt(n - 1)) / 2n
			assert.strictEqual(traceBigIntRecursive(matrix), expected)
			assert.deepStrictEqual(matrix, snapshot)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array matrix inputs', () => {
			for (const invalid of [null, undefined, 0, 42n, '[[1n]]', {}, new BigInt64Array(4)]) {
				assert.throws(() => traceBigIntRecursive(invalid), TypeError)
			}
		})

		it('throws TypeError when any row is not an array', () => {
			assert.throws(() => traceBigIntRecursive([1n]), TypeError)
			assert.throws(() => traceBigIntRecursive([null]), TypeError)
			assert.throws(() => traceBigIntRecursive([[1n, 2n], 'not-a-row']), TypeError)
			assert.throws(() => traceBigIntRecursive([new BigInt64Array([1n])]), TypeError)
		})

		it('throws RangeError for non-square or ragged matrices', () => {
			assert.throws(() => traceBigIntRecursive([[]]), RangeError)
			assert.throws(() => traceBigIntRecursive([[1n, 2n]]), RangeError)
			assert.throws(() => traceBigIntRecursive([[1n], [2n]]), RangeError)
			assert.throws(
				() =>
					traceBigIntRecursive([
						[1n, 2n, 3n],
						[4n, 5n, 6n],
					]),
				RangeError
			)
			assert.throws(() => traceBigIntRecursive([[1n, 2n], [3n]]), RangeError)
		})

		it('throws TypeError when any diagonal or off-diagonal entry is not a BigInt', () => {
			// Non-BigInt on diagonal
			assert.throws(
				() =>
					traceBigIntRecursive([
						[1, 2n],
						[3n, 4n],
					]),
				TypeError
			)
			// Non-BigInt off diagonal (must still be rejected)
			assert.throws(
				() =>
					traceBigIntRecursive([
						[1n, 2],
						[3n, 4n],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceBigIntRecursive([
						[1n, '2'],
						[3n, 4n],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceBigIntRecursive([
						[1n, null],
						[3n, 4n],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceBigIntRecursive([
						[1n, undefined],
						[3n, 4n],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceBigIntRecursive([
						[1n, NaN],
						[3n, 4n],
					]),
				TypeError
			)
			// Sparse array hole
			const sparseRow = new Array(2)
			sparseRow[0] = 1n
			assert.throws(() => traceBigIntRecursive([sparseRow, [3n, 4n]]), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches naive iterative trace across randomized matrices of sizes 0..19', () => {
			const nextRand = createRng(0x123456789abcdef0n)
			for (let n = 0; n < 20; n++) {
				const m = randomBigIntMatrix(n, nextRand)
				assert.strictEqual(traceBigIntRecursive(m), iterativeTrace(m))
			}
		})

		it('satisfies algebraic invariants: linearity, transpose invariance, and cyclic property tr(AB) = tr(BA)', () => {
			const nextRand = createRng(0xfedcba9876543210n)
			const n = 9
			const A = randomBigIntMatrix(n, nextRand)
			const B = randomBigIntMatrix(n, nextRand)
			const alpha = 13n
			const beta = -29n

			// Linearity: tr(alpha * A + beta * B) === alpha * tr(A) + beta * tr(B)
			const linearCombo = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => alpha * A[i][j] + beta * B[i][j])
			)
			assert.strictEqual(
				traceBigIntRecursive(linearCombo),
				alpha * traceBigIntRecursive(A) + beta * traceBigIntRecursive(B)
			)

			// Transpose invariance: tr(A^T) === tr(A)
			const AT = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => A[j][i])
			)
			assert.strictEqual(traceBigIntRecursive(AT), traceBigIntRecursive(A))

			// Cyclic invariance: tr(A * B) === tr(B * A) even though A * B !== B * A
			const AB = matMul(A, B)
			const BA = matMul(B, A)
			assert.notDeepStrictEqual(AB, BA)
			assert.strictEqual(traceBigIntRecursive(AB), traceBigIntRecursive(BA))
		})
	})
})
