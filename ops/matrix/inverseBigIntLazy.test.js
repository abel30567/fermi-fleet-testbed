import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { inverseBigIntLazy, SCALE } from './inverseBigIntLazy.js'

const S = 10n ** 18n

/**
 * Exact BigInt matrix multiplication A * B.
 *
 * @param {bigint[][]} a
 * @param {bigint[][]} b
 * @returns {bigint[][]}
 */
function matMul(a, b) {
	const n = a.length
	const m = b[0].length
	const kLen = b.length
	const out = Array.from({ length: n }, () => Array(m).fill(0n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < m; j++) {
			let sum = 0n
			for (let k = 0; k < kLen; k++) {
				sum += a[i][k] * b[k][j]
			}
			out[i][j] = sum
		}
	}
	return out
}

/**
 * Assert that `A * A^-1 ≈ I * scale` and `A^-1 * A ≈ I * scale` within
 * tight analytical rounding bounds (each entry of `A^-1` has error <= 0.5 ULP).
 *
 * @param {bigint[][]} a
 * @param {bigint[][]} inv
 * @param {bigint} [scale=S]
 */
function assertInverseCrossCheck(a, inv, scale = S) {
	const n = a.length
	assert.equal(inv.length, n)
	for (const row of inv) {
		assert.equal(row.length, n)
	}

	const rightProd = matMul(a, inv)
	const leftProd = matMul(inv, a)

	for (let i = 0; i < n; i++) {
		let rowL1 = 0n
		for (let k = 0; k < n; k++) {
			rowL1 += a[i][k] < 0n ? -a[i][k] : a[i][k]
		}
		// Each entry of inv is within 0.5 ULP, so |(A * inv)[i][j] - I[i][j]*scale| <= ceil(rowL1 / 2)
		const rightTol = (rowL1 + 1n) / 2n

		for (let j = 0; j < n; j++) {
			const expected = i === j ? scale : 0n

			const rightDiff = rightProd[i][j] - expected
			const absRightDiff = rightDiff < 0n ? -rightDiff : rightDiff
			assert.ok(
				absRightDiff <= rightTol,
				`A * A^-1 mismatch at (${i},${j}): got ${rightProd[i][j]}, expected ${expected}, diff ${absRightDiff} > tol ${rightTol}`
			)

			let colL1 = 0n
			for (let k = 0; k < n; k++) {
				colL1 += a[k][j] < 0n ? -a[k][j] : a[k][j]
			}
			const leftTol = (colL1 + 1n) / 2n
			const leftDiff = leftProd[i][j] - expected
			const absLeftDiff = leftDiff < 0n ? -leftDiff : leftDiff
			assert.ok(
				absLeftDiff <= leftTol,
				`A^-1 * A mismatch at (${i},${j}): got ${leftProd[i][j]}, expected ${expected}, diff ${absLeftDiff} > tol ${leftTol}`
			)
		}
	}
}

describe('inverseBigIntLazy', () => {
	it('exports SCALE = 10^18', () => {
		assert.equal(SCALE, 10n ** 18n)
	})

	describe('normal cases', () => {
		it('inverts 1x1 matrices (integer and non-integer inverses)', () => {
			assert.deepEqual([...inverseBigIntLazy([[1n]])], [[S]])
			assert.deepEqual([...inverseBigIntLazy([[-1n]])], [[-S]])
			assert.deepEqual([...inverseBigIntLazy([[4n]])], [[250000000000000000n]])
			assert.deepEqual([...inverseBigIntLazy([[3n]])], [[333333333333333333n]])
			assert.deepEqual([...inverseBigIntLazy([[-3n]])], [[-333333333333333333n]])
			// 1/6 = 0.1666666666666666666... rounds up to ...667
			assert.deepEqual([...inverseBigIntLazy([[6n]])], [[166666666666666667n]])
			assert.deepEqual([...inverseBigIntLazy([[-6n]])], [[-166666666666666667n]])
		})

		it('inverts 2x2 unimodular matrices exactly', () => {
			// det = 1
			const a = [
				[2n, 1n],
				[1n, 1n]
			]
			assert.deepEqual([...inverseBigIntLazy(a)], [
				[1n * S, -1n * S],
				[-1n * S, 2n * S]
			])

			// det = -1
			const b = [
				[1n, 2n],
				[3n, 5n]
			]
			assert.deepEqual([...inverseBigIntLazy(b)], [
				[-5n * S, 2n * S],
				[3n * S, -1n * S]
			])
		})

		it('inverts 2x2 matrices with non-integer inverses', () => {
			// det = 10; inverse = [[0.6, -0.7], [-0.2, 0.4]]
			const a = [
				[4n, 7n],
				[2n, 6n]
			]
			const invA = [...inverseBigIntLazy(a)]
			assert.deepEqual(invA, [
				[600000000000000000n, -700000000000000000n],
				[-200000000000000000n, 400000000000000000n]
			])
			assertInverseCrossCheck(a, invA)

			// det = 3; inverse = [[3, -2/3], [-1, 1/3]]
			const b = [
				[1n, 2n],
				[3n, 9n]
			]
			const invB = [...inverseBigIntLazy(b)]
			assert.deepEqual(invB, [
				[3n * S, -666666666666666667n],
				[-1n * S, 333333333333333333n]
			])
			assertInverseCrossCheck(b, invB)
		})

		it('inverts 3x3 unimodular and non-integer matrices', () => {
			// Unimodular (det = 1)
			const unimod = [
				[1n, 2n, 3n],
				[0n, 1n, 4n],
				[5n, 6n, 0n]
			]
			const invUnimod = [...inverseBigIntLazy(unimod)]
			assert.deepEqual(invUnimod, [
				[-24n * S, 18n * S, 5n * S],
				[20n * S, -15n * S, -4n * S],
				[-5n * S, 4n * S, 1n * S]
			])
			assertInverseCrossCheck(unimod, invUnimod)

			// Symmetric tridiagonal (det = 4)
			const tridiag = [
				[2n, -1n, 0n],
				[-1n, 2n, -1n],
				[0n, -1n, 2n]
			]
			const invTridiag = [...inverseBigIntLazy(tridiag)]
			assert.deepEqual(invTridiag, [
				[750000000000000000n, 500000000000000000n, 250000000000000000n],
				[500000000000000000n, 1000000000000000000n, 500000000000000000n],
				[250000000000000000n, 500000000000000000n, 750000000000000000n]
			])
			assertInverseCrossCheck(tridiag, invTridiag)

			// Non-terminating rational inverse (det = -7)
			const rational3 = [
				[1n, 2n, 1n],
				[2n, 1n, 3n],
				[3n, 4n, 1n]
			]
			const invRat3 = [...inverseBigIntLazy(rational3)]
			assertInverseCrossCheck(rational3, invRat3)
		})

		it('inverts 4x4 unimodular and dense non-integer matrices', () => {
			// 4x4 unimodular (det = 1): lower-triangular * upper-triangular with unit diagonals
			const unimod4 = [
				[1n, 2n, -1n, 3n],
				[1n, 3n, 1n, 2n],
				[-2n, -3n, 5n, -5n],
				[3n, 5n, -3n, 15n]
			]
			const invUnimod4 = [...inverseBigIntLazy(unimod4)]
			// Verify exact integer multiples of SCALE
			for (const row of invUnimod4) {
				for (const v of row) {
					assert.equal(v % S, 0n)
				}
			}
			assert.deepEqual(matMul(unimod4, invUnimod4), [
				[S, 0n, 0n, 0n],
				[0n, S, 0n, 0n],
				[0n, 0n, S, 0n],
				[0n, 0n, 0n, S]
			])
			assert.deepEqual(matMul(invUnimod4, unimod4), [
				[S, 0n, 0n, 0n],
				[0n, S, 0n, 0n],
				[0n, 0n, S, 0n],
				[0n, 0n, 0n, S]
			])

			// 4x4 non-integer inverse
			const dense4 = [
				[4n, 1n, 0n, 2n],
				[1n, 5n, -1n, 0n],
				[0n, 2n, 6n, 1n],
				[-3n, 0n, 2n, 7n]
			]
			const invDense4 = [...inverseBigIntLazy(dense4)]
			assertInverseCrossCheck(dense4, invDense4)
		})

		it('preserves exactness for BigInts far beyond Number.MAX_SAFE_INTEGER', () => {
			const big = 10n ** 30n
			// det = big*big - (big+1)*(big-1) = big^2 - (big^2 - 1) = 1
			const hugeUnimod = [
				[big, big + 1n],
				[big - 1n, big]
			]
			const inv = [...inverseBigIntLazy(hugeUnimod)]
			assert.deepEqual(inv, [
				[big * S, -(big + 1n) * S],
				[-(big - 1n) * S, big * S]
			])
			assert.deepEqual(matMul(hugeUnimod, inv), [
				[S, 0n],
				[0n, S]
			])
		})

		it('supports custom positive BigInt scale', () => {
			const customScale = 10n ** 6n
			const inv = [...inverseBigIntLazy([[3n]], customScale)]
			assert.deepEqual(inv, [[333333n]])
			assertInverseCrossCheck([[3n]], inv, customScale)
		})
	})

	describe('edge cases', () => {
		it('handles zero pivots requiring row swaps', () => {
			// 2x2 swap matrix
			const p2 = [
				[0n, 1n],
				[1n, 0n]
			]
			assert.deepEqual([...inverseBigIntLazy(p2)], [
				[0n, S],
				[S, 0n]
			])

			// 3x3 cyclic permutation (all diagonal entries are 0)
			const p3 = [
				[0n, 0n, 1n],
				[1n, 0n, 0n],
				[0n, 1n, 0n]
			]
			const invP3 = [...inverseBigIntLazy(p3)]
			assert.deepEqual(invP3, [
				[0n, S, 0n],
				[0n, 0n, S],
				[S, 0n, 0n]
			])

			// 3x3 dense matrix with zero diagonal requiring multiple swaps
			const zeroDiag = [
				[0n, 2n, 1n],
				[1n, 0n, 3n],
				[4n, 5n, 0n]
			]
			const invZeroDiag = [...inverseBigIntLazy(zeroDiag)]
			assertInverseCrossCheck(zeroDiag, invZeroDiag)
		})

		it('throws RangeError on singular matrices', () => {
			assert.throws(() => [...inverseBigIntLazy([[0n]])], RangeError)
			assert.throws(
				() => [
					...inverseBigIntLazy([
						[1n, 2n],
						[2n, 4n]
					])
				],
				RangeError
			)
			assert.throws(
				() => [
					...inverseBigIntLazy([
						[1n, 2n, 3n],
						[4n, 5n, 6n],
						[7n, 8n, 9n]
					])
				],
				RangeError
			)
			assert.throws(
				() => [
					...inverseBigIntLazy([
						[1n, 0n, 2n],
						[0n, 0n, 0n],
						[3n, 4n, 5n]
					])
				],
				RangeError
			)
		})

		it('throws RangeError on non-square matrices', () => {
			assert.throws(
				() => [
					...inverseBigIntLazy([
						[1n, 2n, 3n],
						[4n, 5n, 6n]
					])
				],
				RangeError
			)
			assert.throws(
				() => [
					...inverseBigIntLazy([
						[1n, 2n],
						[3n, 4n],
						[5n, 6n]
					])
				],
				RangeError
			)
		})

		it('throws RangeError on ragged matrices', () => {
			assert.throws(() => [...inverseBigIntLazy([[1n, 2n], [3n]])], RangeError)
			assert.throws(() => [...inverseBigIntLazy([[1n], [2n, 3n]])], RangeError)
			assert.throws(
				() => [
					...inverseBigIntLazy([
						[1n, 2n],
						[3n, 4n],
						[5n]
					])
				],
				RangeError
			)
		})

		it('throws RangeError on empty matrices and empty rows', () => {
			assert.throws(() => [...inverseBigIntLazy([])], RangeError)
			assert.throws(() => [...inverseBigIntLazy([[]])], RangeError)
			assert.throws(() => [...inverseBigIntLazy((function* () {})())], RangeError)
		})

		it('throws TypeError or RangeError on invalid argument types', () => {
			assert.throws(() => inverseBigIntLazy(null), TypeError)
			assert.throws(() => inverseBigIntLazy(undefined), TypeError)
			assert.throws(() => inverseBigIntLazy(42), TypeError)
			assert.throws(() => inverseBigIntLazy('1234'), TypeError)
			assert.throws(() => inverseBigIntLazy({}), TypeError)

			assert.throws(() => [...inverseBigIntLazy([123])], TypeError)
			assert.throws(() => [...inverseBigIntLazy(['12', '34'])], TypeError)
			assert.throws(
				() => [
					...inverseBigIntLazy([
						[1, 2],
						[3, 4]
					])
				],
				TypeError
			)
			assert.throws(
				() => [
					...inverseBigIntLazy([
						[1n, '2'],
						[3n, 4n]
					])
				],
				TypeError
			)
			assert.throws(
				() => [
					...inverseBigIntLazy([
						[1n, null],
						[3n, 4n]
					])
				],
				TypeError
			)

			assert.throws(() => inverseBigIntLazy([[1n]], 0n), RangeError)
			assert.throws(() => inverseBigIntLazy([[1n]], -10n), RangeError)
			assert.throws(() => inverseBigIntLazy([[1n]], 1000), TypeError)
		})
	})

	describe('lazy generator inputs and outputs', () => {
		it('defers consuming input generator until first .next() and yields rows lazily', () => {
			let rowsYieldedByInput = 0
			let colsYieldedByInput = 0

			function* makeRow(values) {
				for (const v of values) {
					colsYieldedByInput++
					yield v
				}
			}

			function* makeMatrix() {
				const raw = [
					[2n, 1n, 0n],
					[1n, 3n, 1n],
					[0n, 1n, 2n]
				]
				for (const r of raw) {
					rowsYieldedByInput++
					yield makeRow(r)
				}
			}

			const gen = inverseBigIntLazy(makeMatrix())
			// Must be a generator / iterable iterator
			assert.equal(typeof gen.next, 'function')
			assert.equal(gen[Symbol.iterator](), gen)
			// Input must NOT have been touched yet
			assert.equal(rowsYieldedByInput, 0)
			assert.equal(colsYieldedByInput, 0)

			const first = gen.next()
			assert.equal(first.done, false)
			assert.equal(rowsYieldedByInput, 3)
			assert.equal(colsYieldedByInput, 9)
			assert.equal(first.value.length, 3)

			const second = gen.next()
			assert.equal(second.done, false)
			const third = gen.next()
			assert.equal(third.done, false)
			const end = gen.next()
			assert.equal(end.done, true)

			const fullInv = [first.value, second.value, third.value]
			assertInverseCrossCheck(
				[
					[2n, 1n, 0n],
					[1n, 3n, 1n],
					[0n, 1n, 2n]
				],
				fullInv
			)
		})

		it('supports early consumer termination and BigInt64Array row iterables', () => {
			const typedMatrix = [new BigInt64Array([1n, 2n]), new BigInt64Array([3n, 5n])]
			let collected = null
			for (const row of inverseBigIntLazy(typedMatrix)) {
				collected = row
				break
			}
			assert.deepEqual(collected, [-5n * S, 2n * S])
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies A * A^-1 ≈ I * 10^18 and A^-1 * A ≈ I * 10^18 across diverse matrices', () => {
			const matrices = [
				[[7n]],
				[
					[3n, -5n],
					[7n, 11n]
				],
				[
					[0n, -3n, 7n],
					[5n, 2n, -1n],
					[-4n, 6n, 9n]
				],
				[
					[5n, -2n, 3n, 1n],
					[0n, 4n, -1n, 6n],
					[2n, 0n, 7n, -3n],
					[-1n, 3n, 2n, 8n]
				],
				[
					[2n, 1n, 0n, 0n, 1n],
					[1n, 3n, 1n, 0n, 0n],
					[0n, 1n, 4n, 1n, 0n],
					[0n, 0n, 1n, 5n, 1n],
					[1n, 0n, 0n, 1n, 6n]
				]
			]

			for (const m of matrices) {
				const inv = [...inverseBigIntLazy(m)]
				assertInverseCrossCheck(m, inv)
			}
		})

		it('satisfies double-inverse involution (A^-1)^-1 = A for unimodular matrices', () => {
			const unimod = [
				[1n, 2n, 3n],
				[0n, 1n, 4n],
				[5n, 6n, 0n]
			]
			const invUnscaled = [...inverseBigIntLazy(unimod)].map((row) =>
				row.map((v) => v / S)
			)
			const doubleInv = [...inverseBigIntLazy(invUnscaled)]
			assert.deepEqual(
				doubleInv,
				unimod.map((row) => row.map((v) => v * S))
			)
		})
	})
})
