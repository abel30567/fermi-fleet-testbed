import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { inverseBigIntIterative, SCALE } from './inverseBigIntIterative.js'

/**
 * Helper: exact BigInt matrix multiplication A * B.
 *
 * @param {bigint[][]} a
 * @param {bigint[][]} b
 * @returns {bigint[][]}
 */
function matMul(a, b) {
	const n = a.length
	const out = Array.from({ length: n }, () => new Array(n).fill(0n))
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < n; k++) {
			const aik = a[i][k]
			if (aik === 0n) continue
			for (let j = 0; j < n; j++) {
				out[i][j] += aik * b[k][j]
			}
		}
	}
	return out
}

/**
 * Independent reference determinant using Laplace cofactor expansion (for small n).
 *
 * @param {bigint[][]} m
 * @returns {bigint}
 */
function detCofactor(m) {
	const n = m.length
	if (n === 1) return m[0][0]
	if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0]
	let sum = 0n
	for (let c = 0; c < n; c++) {
		const minor = []
		for (let r = 1; r < n; r++) {
			const row = []
			for (let j = 0; j < n; j++) {
				if (j !== c) row.push(m[r][j])
			}
			minor.push(row)
		}
		const sign = c % 2 === 0 ? 1n : -1n
		sum += sign * m[0][c] * detCofactor(minor)
	}
	return sum
}

/**
 * Independent reference inverse using explicit adjugate / determinant formula
 * scaled by `scale` with half-to-even rounding.
 *
 * @param {bigint[][]} m
 * @param {bigint} [scale=SCALE]
 * @returns {bigint[][]}
 */
function inverseByAdjugateReference(m, scale = SCALE) {
	const n = m.length
	const det = detCofactor(m)
	const absDet = det < 0n ? -det : det
	const signDet = det < 0n ? -1n : 1n

	const out = Array.from({ length: n }, () => new Array(n).fill(0n))
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			const minor = []
			for (let i = 0; i < n; i++) {
				if (i === r) continue
				const row = []
				for (let j = 0; j < n; j++) {
					if (j !== c) row.push(m[i][j])
				}
				minor.push(row)
			}
			const cofactor = ((r + c) % 2 === 0 ? 1n : -1n) * detCofactor(minor)
			// Adjugate is transpose of cofactor matrix: adj[c][r] = cofactor(r, c)
			const num = signDet * cofactor * scale
			const neg = num < 0n
			const absNum = neg ? -num : num
			let q = absNum / absDet
			const rem = absNum % absDet
			if (rem * 2n > absDet || (rem * 2n === absDet && (q & 1n) === 1n)) {
				q += 1n
			}
			out[c][r] = neg ? -q : q
		}
	}
	return out
}

/**
 * Helper: absolute value of a BigInt.
 *
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x
}

describe('inverseBigIntIterative', () => {
	describe('normal cases', () => {
		it('inverts 1x1 matrices', () => {
			assert.deepEqual(inverseBigIntIterative([[1n]]), [[SCALE]])
			assert.deepEqual(inverseBigIntIterative([[-1n]]), [[-SCALE]])
			assert.deepEqual(inverseBigIntIterative([[2n]]), [[500_000_000_000_000_000n]])
			assert.deepEqual(inverseBigIntIterative([[-4n]]), [[-250_000_000_000_000_000n]])
			assert.deepEqual(inverseBigIntIterative([[3n]]), [[333_333_333_333_333_333n]])
		})

		it('inverts a 2x2 unimodular matrix exactly', () => {
			// det = 2*1 - 1*1 = 1; inverse = [[1, -1], [-1, 2]]
			const a = [
				[2n, 1n],
				[1n, 1n],
			]
			const expected = [
				[SCALE, -SCALE],
				[-SCALE, 2n * SCALE],
			]
			assert.deepEqual(inverseBigIntIterative(a), expected)
		})

		it('inverts a 2x2 matrix with fractional fixed-point entries', () => {
			// A = [[4, 7], [2, 6]], det = 10
			// A^-1 = [[0.6, -0.7], [-0.2, 0.4]]
			const a = [
				[4n, 7n],
				[2n, 6n],
			]
			const expected = [
				[600_000_000_000_000_000n, -700_000_000_000_000_000n],
				[-200_000_000_000_000_000n, 400_000_000_000_000_000n],
			]
			assert.deepEqual(inverseBigIntIterative(a), expected)
		})

		it('inverts a 2x2 matrix with negative determinant and repeating decimals', () => {
			// A = [[1, 2], [3, 3]], det = -3
			// A^-1 = [[-1, 2/3], [1, -1/3]]
			const a = [
				[1n, 2n],
				[3n, 3n],
			]
			const expected = [
				[-SCALE, 666_666_666_666_666_667n],
				[SCALE, -333_333_333_333_333_333n],
			]
			assert.deepEqual(inverseBigIntIterative(a), expected)
		})

		it('inverts a 3x3 matrix requiring intermediate row swaps (zero pivots)', () => {
			// Leading 2x2 minor [[1, 2], [2, 4]] has det 0, forcing a swap at k = 1.
			// det = -1, exact integer inverse = [[13, -5, -2], [-9, 4, 1], [2, -1, 0]]
			const a = [
				[1n, 2n, 3n],
				[2n, 4n, 5n],
				[1n, 3n, 7n],
			]
			const expected = [
				[13n * SCALE, -5n * SCALE, -2n * SCALE],
				[-9n * SCALE, 4n * SCALE, SCALE],
				[2n * SCALE, -SCALE, 0n],
			]
			assert.deepEqual(inverseBigIntIterative(a), expected)
		})

		it('inverts a 3x3 matrix with zero on the entire main diagonal', () => {
			// det = 2, inverse = [[-1/2, 1/2, 1/2], [1/2, -1/2, 1/2], [1/2, 1/2, -1/2]]
			const a = [
				[0n, 1n, 1n],
				[1n, 0n, 1n],
				[1n, 1n, 0n],
			]
			const half = SCALE / 2n
			const expected = [
				[-half, half, half],
				[half, -half, half],
				[half, half, -half],
			]
			assert.deepEqual(inverseBigIntIterative(a), expected)
		})

		it('supports custom positive BigInt scale values', () => {
			const a = [
				[4n, 7n],
				[2n, 6n],
			]
			assert.deepEqual(inverseBigIntIterative(a, 100n), [
				[60n, -70n],
				[-20n, 40n],
			])
		})
	})

	describe('edge cases', () => {
		it('maps identity matrices to SCALE * I', () => {
			for (const n of [1, 2, 4, 5]) {
				const id = Array.from({ length: n }, (_, r) =>
					Array.from({ length: n }, (_, c) => (r === c ? 1n : 0n))
				)
				const expected = Array.from({ length: n }, (_, r) =>
					Array.from({ length: n }, (_, c) => (r === c ? SCALE : 0n))
				)
				assert.deepEqual(inverseBigIntIterative(id), expected)
			}
		})

		it('inverts permutation matrices (its transpose)', () => {
			const perm = [
				[0n, 0n, 1n, 0n],
				[1n, 0n, 0n, 0n],
				[0n, 0n, 0n, 1n],
				[0n, 1n, 0n, 0n],
			]
			const expected = [
				[0n, SCALE, 0n, 0n],
				[0n, 0n, 0n, SCALE],
				[SCALE, 0n, 0n, 0n],
				[0n, 0n, SCALE, 0n],
			]
			assert.deepEqual(inverseBigIntIterative(perm), expected)
		})

		it('inverts diagonal matrices with mixed signs', () => {
			const diag = [
				[2n, 0n, 0n],
				[0n, -5n, 0n],
				[0n, 0n, 8n],
			]
			const expected = [
				[500_000_000_000_000_000n, 0n, 0n],
				[0n, -200_000_000_000_000_000n, 0n],
				[0n, 0n, 125_000_000_000_000_000n],
			]
			assert.deepEqual(inverseBigIntIterative(diag), expected)
		})

		it('satisfies odd symmetry inv(-A) === -inv(A)', () => {
			const a = [
				[3n, -1n, 2n],
				[4n, 5n, -6n],
				[-2n, 7n, 1n],
			]
			const negA = a.map((row) => row.map((v) => -v))
			const invA = inverseBigIntIterative(a)
			const invNegA = inverseBigIntIterative(negA)
			const negInvA = invA.map((row) => row.map((v) => -v))
			assert.deepEqual(invNegA, negInvA)
		})

		it('rounds exact half ties to even (banker rounding)', () => {
			// 1/2 -> 0, 3/2 -> 2, 5/2 -> 2, 7/2 -> 4 (and negative mirrors)
			assert.deepEqual(inverseBigIntIterative([[2n]], 1n), [[0n]])
			assert.deepEqual(inverseBigIntIterative([[2n]], 3n), [[2n]])
			assert.deepEqual(inverseBigIntIterative([[2n]], 5n), [[2n]])
			assert.deepEqual(inverseBigIntIterative([[2n]], 7n), [[4n]])
			assert.deepEqual(inverseBigIntIterative([[-2n]], 1n), [[0n]])
			assert.deepEqual(inverseBigIntIterative([[-2n]], 3n), [[-2n]])
			assert.deepEqual(inverseBigIntIterative([[-2n]], 5n), [[-2n]])
			assert.deepEqual(inverseBigIntIterative([[-2n]], 7n), [[-4n]])
		})

		it('handles very large BigInt values beyond Number.MAX_SAFE_INTEGER without precision loss', () => {
			// Unimodular matrix [[k, k+1], [k-1, k]] has det = k^2 - (k^2 - 1) = 1
			// regardless of how huge k is! Float64 would catastrophically cancel to det = 0.
			const k = 10n ** 30n + 7n
			const a = [
				[k, k + 1n],
				[k - 1n, k],
			]
			const expected = [
				[k * SCALE, -(k + 1n) * SCALE],
				[-(k - 1n) * SCALE, k * SCALE],
			]
			const inv = inverseBigIntIterative(a)
			assert.deepEqual(inv, expected)
			// Verify exact product A * A^-1 === SCALE * I
			assert.deepEqual(matMul(a, inv), [
				[SCALE, 0n],
				[0n, SCALE],
			])
		})

		it('does not mutate the input matrix or its rows', () => {
			const original = [
				[0n, 2n, 1n],
				[1n, 0n, 3n],
				[2n, 1n, 0n],
			]
			const snapshot = original.map((r) => [...r])
			inverseBigIntIterative(original)
			assert.deepEqual(original, snapshot)
		})
	})

	describe('input validation and singular matrices', () => {
		it('throws TypeError for non-array matrix inputs', () => {
			for (const bad of [null, undefined, 123, 123n, 'matrix', {}]) {
				assert.throws(() => inverseBigIntIterative(/** @type {any} */ (bad)), TypeError)
			}
		})

		it('throws TypeError for non-array rows or non-BigInt elements', () => {
			assert.throws(() => inverseBigIntIterative(/** @type {any} */ ([1n])), TypeError)
			assert.throws(
				() => inverseBigIntIterative(/** @type {any} */ ([[1n, 2n], 'not-a-row'])),
				TypeError
			)
			assert.throws(() => inverseBigIntIterative(/** @type {any} */ ([[1]])), TypeError)
			assert.throws(
				() =>
					inverseBigIntIterative(
						/** @type {any} */ ([
							[1n, 2n],
							[3n, 4],
						])
					),
				TypeError
			)
			assert.throws(() => inverseBigIntIterative(/** @type {any} */ ([['1']])), TypeError)
			assert.throws(() => inverseBigIntIterative(/** @type {any} */ ([[NaN]])), TypeError)
		})

		it('throws RangeError for empty or non-square matrices', () => {
			assert.throws(() => inverseBigIntIterative([]), RangeError)
			assert.throws(() => inverseBigIntIterative([[]]), RangeError)
			assert.throws(() => inverseBigIntIterative([[1n, 2n]]), RangeError)
			assert.throws(() => inverseBigIntIterative([[1n], [2n]]), RangeError)
			assert.throws(
				() =>
					inverseBigIntIterative([
						[1n, 2n],
						[3n],
					]),
				RangeError
			)
		})

		it('validates optional scale parameter', () => {
			assert.throws(
				() => inverseBigIntIterative([[1n]], /** @type {any} */ (1000)),
				TypeError
			)
			assert.throws(() => inverseBigIntIterative([[1n]], 0n), RangeError)
			assert.throws(() => inverseBigIntIterative([[1n]], -10n), RangeError)
		})

		it('throws RangeError for singular matrices', () => {
			assert.throws(() => inverseBigIntIterative([[0n]]), RangeError)
			assert.throws(
				() =>
					inverseBigIntIterative([
						[0n, 0n],
						[0n, 0n],
					]),
				RangeError
			)
			assert.throws(
				() =>
					inverseBigIntIterative([
						[1n, 2n],
						[2n, 4n],
					]),
				RangeError
			)
			// Classic singular 3x3 matrix (rows in arithmetic progression)
			assert.throws(
				() =>
					inverseBigIntIterative([
						[1n, 2n, 3n],
						[4n, 5n, 6n],
						[7n, 8n, 9n],
					]),
				RangeError
			)
			// 4x4 with a zero column
			assert.throws(
				() =>
					inverseBigIntIterative([
						[1n, 0n, 2n, 3n],
						[4n, 0n, 5n, 6n],
						[7n, 0n, 8n, 10n],
						[2n, 0n, 1n, 4n],
					]),
				RangeError
			)
		})
	})

	describe('cross-checks against independent computations', () => {
		it('matches independent cofactor/adjugate expansion bit-for-bit on 3x3 and 4x4 matrices', () => {
			const matrices = [
				[
					[2n, -1n, 0n],
					[-1n, 2n, -1n],
					[0n, -1n, 2n],
				],
				[
					[0n, 5n, -3n],
					[7n, 0n, 2n],
					[-4n, 11n, 9n],
				],
				[
					[3n, 1n, -2n, 5n],
					[2n, -4n, 1n, 0n],
					[-1n, 3n, 7n, -2n],
					[4n, 0n, -3n, 6n],
				],
				[
					[0n, 0n, 3n, -1n],
					[2n, 5n, 0n, 4n],
					[-3n, 1n, 2n, 0n],
					[1n, -2n, 0n, 7n],
				],
			]

			for (const m of matrices) {
				const actual = inverseBigIntIterative(m)
				const ref = inverseByAdjugateReference(m)
				assert.deepEqual(actual, ref)
			}
		})

		it('satisfies A * A^-1 ≈ SCALE * I and A^-1 * A ≈ SCALE * I within theoretical rounding bound', () => {
			const matrices = [
				[
					[5n, -3n, 2n],
					[7n, 11n, -13n],
					[-17n, 19n, 23n],
				],
				// 4x4 scaled Hilbert matrix (lcm(1..7) = 420): ill-conditioned in float, exact here
				[
					[420n, 210n, 140n, 105n],
					[210n, 140n, 105n, 84n],
					[140n, 105n, 84n, 70n],
					[105n, 84n, 70n, 60n],
				],
				// 5x5 dense matrix with mixed signs and zero pivots
				[
					[0n, 3n, -1n, 2n, 5n],
					[4n, 0n, 7n, -3n, 1n],
					[-2n, 5n, 0n, 6n, -4n],
					[1n, -6n, 3n, 0n, 2n],
					[8n, 2n, -5n, 1n, 0n],
				],
			]

			for (const a of matrices) {
				const n = a.length
				const inv = inverseBigIntIterative(a)
				const prodRight = matMul(a, inv)
				const prodLeft = matMul(inv, a)

				for (let i = 0; i < n; i++) {
					// Since each entry of inv has error <= 0.5, the residual of
					// (A * inv)[i][j] is bounded by 0.5 * sum_k |A[i][k]|.
					let rowNorm = 0n
					for (let k = 0; k < n; k++) rowNorm += absBigInt(a[i][k])
					const maxErrRight = (rowNorm + 1n) / 2n

					for (let j = 0; j < n; j++) {
						const expected = i === j ? SCALE : 0n
						assert.ok(
							absBigInt(prodRight[i][j] - expected) <= maxErrRight,
							`A * A^-1 residual too large at [${i}][${j}]`
						)

						let colNorm = 0n
						for (let k = 0; k < n; k++) colNorm += absBigInt(a[k][j])
						const maxErrLeft = (colNorm + 1n) / 2n
						assert.ok(
							absBigInt(prodLeft[i][j] - expected) <= maxErrLeft,
							`A^-1 * A residual too large at [${i}][${j}]`
						)
					}
				}
			}
		})

		it('satisfies involution (A^-1)^-1 = A and (A * B)^-1 = B^-1 * A^-1 on unimodular matrices', () => {
			// Lower-unitriangular * upper-unitriangular => det = 1
			const a = [
				[1n, 2n, -3n],
				[3n, 7n, -8n],
				[-2n, -3n, 8n],
			]
			const b = [
				[1n, -1n, 4n],
				[2n, -1n, 5n],
				[1n, 0n, 2n],
			]

			// Involution with scale = 1n (exact integers since det = 1)
			const invA1 = inverseBigIntIterative(a, 1n)
			assert.deepEqual(inverseBigIntIterative(invA1, 1n), a)

			// Product inverse: (A * B)^-1 = B^-1 * A^-1
			const ab = matMul(a, b)
			const invAB = inverseBigIntIterative(ab)
			const invA = inverseBigIntIterative(a)
			const invB = inverseBigIntIterative(b)
			const prodInv = matMul(invB, invA).map((row) => row.map((v) => v / SCALE))
			assert.deepEqual(invAB, prodInv)
		})
	})
})
