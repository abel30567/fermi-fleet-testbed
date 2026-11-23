import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { determinantBigIntMemo } from './determinantBigIntMemo.js'

/**
 * Independent reference implementation: exact Leibniz sum over all permutations
 * (for small n <= 7) used to cross-check determinantBigIntMemo.
 *
 * @param {bigint[][]} matrix
 * @returns {bigint}
 */
function referenceLeibnizDeterminant(matrix) {
	const n = matrix.length
	if (n === 0) return 1n
	const cols = Array.from({ length: n }, (_, i) => i)
	let total = 0n

	function permute(start, sign) {
		if (start === n) {
			let prod = sign
			for (let r = 0; r < n; r++) {
				prod *= matrix[r][cols[r]]
			}
			total += prod
			return
		}
		for (let i = start; i < n; i++) {
			const tmp = cols[start]
			cols[start] = cols[i]
			cols[i] = tmp
			permute(start + 1, i === start ? sign : -sign)
			cols[i] = cols[start]
			cols[start] = tmp
		}
	}

	permute(0, 1n)
	return total
}

/**
 * Independent reference implementation: BigInt matrix multiplication.
 *
 * @param {bigint[][]} a
 * @param {bigint[][]} b
 * @returns {bigint[][]}
 */
function matMul(a, b) {
	const n = a.length
	const out = Array.from({ length: n }, () => new Array(n).fill(0n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0n
			for (let k = 0; k < n; k++) {
				sum += a[i][k] * b[k][j]
			}
			out[i][j] = sum
		}
	}
	return out
}

/**
 * Independent reference: matrix transpose.
 *
 * @param {bigint[][]} a
 * @returns {bigint[][]}
 */
function transpose(a) {
	const n = a.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => a[j][i])
	)
}

/**
 * Deterministic PRNG for reproducible matrix generation.
 *
 * @param {number} seed
 * @returns {() => bigint}
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0
		return BigInt((state % 21) - 10)
	}
}

/**
 * Generates an n x n matrix using a deterministic PRNG.
 *
 * @param {number} n
 * @param {number} seed
 * @returns {bigint[][]}
 */
function randomMatrix(n, seed) {
	const next = makeRng(seed)
	return Array.from({ length: n }, () =>
		Array.from({ length: n }, () => next())
	)
}

/**
 * Constructs a Vandermonde matrix V[i][j] = x_i^j whose exact determinant is
 * prod_{0 <= i < j < n} (x_j - x_i).
 *
 * @param {bigint[]} xs
 * @returns {{ matrix: bigint[][], expected: bigint }}
 */
function vandermonde(xs) {
	const n = xs.length
	const matrix = Array.from({ length: n }, (_, i) => {
		const row = new Array(n)
		let pow = 1n
		for (let j = 0; j < n; j++) {
			row[j] = pow
			pow *= xs[i]
		}
		return row
	})
	let expected = 1n
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			expected *= xs[j] - xs[i]
		}
	}
	return { matrix, expected }
}

describe('determinantBigIntMemo', () => {
	it('handles 0x0 and 1x1 edge cases', () => {
		assert.equal(determinantBigIntMemo([]), 1n)
		assert.equal(determinantBigIntMemo([[0n]]), 0n)
		assert.equal(determinantBigIntMemo([[42n]]), 42n)
		assert.equal(determinantBigIntMemo([[-999999999999999999999n]]), -999999999999999999999n)
	})

	it('computes exact determinants for 2x2 and 3x3 table-driven cases', () => {
		assert.equal(
			determinantBigIntMemo([
				[1n, 2n],
				[3n, 4n],
			]),
			-2n
		)
		assert.equal(
			determinantBigIntMemo([
				[0n, 5n],
				[7n, 0n],
			]),
			-35n
		)
		assert.equal(
			determinantBigIntMemo([
				[6n, 1n, 1n],
				[4n, -2n, 5n],
				[2n, 8n, 7n],
			]),
			-306n
		)
		assert.equal(
			determinantBigIntMemo([
				[1n, 2n, 3n],
				[4n, 5n, 6n],
				[7n, 8n, 9n],
			]),
			0n
		)
	})

	it('handles singular, triangular, diagonal, and permutation matrices', () => {
		// Identity 5x5
		const id5 = Array.from({ length: 5 }, (_, i) =>
			Array.from({ length: 5 }, (_, j) => (i === j ? 1n : 0n))
		)
		assert.equal(determinantBigIntMemo(id5), 1n)

		// Upper triangular 6x6
		const upper6 = Array.from({ length: 6 }, (_, i) =>
			Array.from({ length: 6 }, (_, j) =>
				j < i ? 0n : j === i ? BigInt(i + 2) : BigInt((i + 1) * (j + 3))
			)
		)
		assert.equal(determinantBigIntMemo(upper6), 2n * 3n * 4n * 5n * 6n * 7n)

		// Zero matrix 4x4
		const zero4 = Array.from({ length: 4 }, () => [0n, 0n, 0n, 0n])
		assert.equal(determinantBigIntMemo(zero4), 0n)

		// Duplicate rows 5x5 -> singular
		const dupRows = randomMatrix(5, 101)
		dupRows[4] = dupRows[1].slice()
		assert.equal(determinantBigIntMemo(dupRows), 0n)

		// Anti-diagonal permutation matrix 14x14 (forces row swaps in Bareiss path)
		// Number of swaps = floor(n/2) = 7 -> sign = (-1)^7 = -1n
		const n = 14
		const antiDiag = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => (i + j === n - 1 ? 1n : 0n))
		)
		assert.equal(determinantBigIntMemo(antiDiag), -1n)
	})

	it('cross-checks bitmask-memoized path (n = 2..7) against independent Leibniz formula', () => {
		for (let n = 2; n <= 7; n++) {
			for (let trial = 0; trial < 3; trial++) {
				const m = randomMatrix(n, n * 100 + trial)
				const expected = referenceLeibnizDeterminant(m)
				assert.equal(determinantBigIntMemo(m), expected)
			}
		}
	})

	it('cross-checks Vandermonde closed-form formula across both bitmask DP (n <= 12) and Bareiss (n >= 13)', () => {
		// n = 8 (bitmask DP)
		const v8 = vandermonde([-3n, -2n, -1n, 0n, 1n, 2n, 3n, 4n])
		assert.equal(determinantBigIntMemo(v8.matrix), v8.expected)

		// n = 12 (bitmask DP boundary)
		const v12 = vandermonde([1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 12n])
		assert.equal(determinantBigIntMemo(v12.matrix), v12.expected)

		// n = 13 (Bareiss boundary)
		const v13 = vandermonde([
			-6n, -5n, -4n, -3n, -2n, -1n, 0n, 1n, 2n, 3n, 4n, 5n, 6n,
		])
		assert.equal(determinantBigIntMemo(v13.matrix), v13.expected)

		// n = 16 (larger Bareiss + huge exact BigInt determinant)
		const v16 = vandermonde(Array.from({ length: 16 }, (_, i) => BigInt(i - 7)))
		assert.equal(determinantBigIntMemo(v16.matrix), v16.expected)
	})

	it('satisfies algebraic determinant identities: det(AB) = det(A)det(B) and det(A^T) = det(A)', () => {
		for (const n of [4, 9, 14]) {
			const a = randomMatrix(n, 700 + n)
			const b = randomMatrix(n, 900 + n)
			const detA = determinantBigIntMemo(a)
			const detB = determinantBigIntMemo(b)
			const detAB = determinantBigIntMemo(matMul(a, b))
			const detAT = determinantBigIntMemo(transpose(a))
			assert.equal(detAB, detA * detB)
			assert.equal(detAT, detA)
		}
	})

	it('preserves exact precision for huge BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
		const scale = 10n ** 18n
		const m = [
			[scale + 1n, scale],
			[scale, scale - 1n],
		]
		// (S + 1)(S - 1) - S^2 = -1n (would suffer catastrophic cancellation in IEEE 754 float)
		assert.equal(determinantBigIntMemo(m), -1n)

		const huge = 10n ** 40n
		const m3 = [
			[huge + 1n, huge + 2n, huge + 3n],
			[huge + 4n, huge + 5n, huge + 6n],
			[huge + 7n, huge + 8n, huge + 10n],
		]
		assert.equal(determinantBigIntMemo(m3), -3n)
	})

	it('returns consistent memoized results on repeated calls without key collisions or input mutation', () => {
		const m1 = [
			[12n, 3n],
			[4n, 5n],
		]
		const m2 = [
			[1n, 23n],
			[4n, 5n],
		]
		const snapshot = m1.map((row) => row.slice())

		assert.equal(determinantBigIntMemo(m1), 48n)
		assert.equal(determinantBigIntMemo(m2), -87n)
		// Cache hit check
		assert.equal(determinantBigIntMemo(m1), 48n)
		assert.deepEqual(m1, snapshot)

		// Verify Bareiss path also does not mutate input
		const big = randomMatrix(14, 12345)
		const bigCopy = big.map((row) => row.slice())
		const d1 = determinantBigIntMemo(big)
		const d2 = determinantBigIntMemo(big)
		assert.equal(d1, d2)
		assert.deepEqual(big, bigCopy)
	})

	it('validates inputs and throws appropriate errors on invalid matrices', () => {
		assert.throws(() => determinantBigIntMemo(null), TypeError)
		assert.throws(() => determinantBigIntMemo(undefined), TypeError)
		assert.throws(() => determinantBigIntMemo(42), TypeError)
		assert.throws(() => determinantBigIntMemo('[[1]]'), TypeError)
		assert.throws(() => determinantBigIntMemo([1n, 2n]), TypeError)
		assert.throws(() => determinantBigIntMemo([[1n, 2n], null]), TypeError)
		assert.throws(() => determinantBigIntMemo([[1n], null]), TypeError)
		assert.throws(() => determinantBigIntMemo([[1n, 2n]]), RangeError)
		assert.throws(
			() =>
				determinantBigIntMemo([
					[1n, 2n],
					[3n],
				]),
			RangeError
		)
		assert.throws(
			() =>
				determinantBigIntMemo([
					[1, 2],
					[3, 4],
				]),
			TypeError
		)
		assert.throws(
			() =>
				determinantBigIntMemo([
					[1n, '2'],
					[3n, 4n],
				]),
			TypeError
		)
		assert.throws(
			() =>
				determinantBigIntMemo([
					[1n, NaN],
					[3n, 4n],
				]),
			TypeError
		)
	})
})
