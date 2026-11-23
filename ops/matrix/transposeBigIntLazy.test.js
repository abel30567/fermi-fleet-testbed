import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { transposeBigIntLazy } from './transposeBigIntLazy.js'

describe('transposeBigIntLazy', () => {
	describe('normal cases', () => {
		it('transposes a 1x1 square matrix', () => {
			const result = [...transposeBigIntLazy([[42n]])]
			assert.deepStrictEqual(result, [[42n]])
		})

		it('transposes a 2x2 square matrix', () => {
			const input = [
				[1n, 2n],
				[3n, 4n],
			]
			assert.deepStrictEqual([...transposeBigIntLazy(input)], [
				[1n, 3n],
				[2n, 4n],
			])
		})

		it('transposes a 3x3 square matrix with negative and zero BigInts', () => {
			const input = [
				[-1n, 0n, 3n],
				[4n, -5n, 6n],
				[7n, 8n, -9n],
			]
			assert.deepStrictEqual([...transposeBigIntLazy(input)], [
				[-1n, 4n, 7n],
				[0n, -5n, 8n],
				[3n, 6n, -9n],
			])
		})

		it('transposes a rectangular 2x3 matrix into 3x2', () => {
			const input = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
			]
			assert.deepStrictEqual([...transposeBigIntLazy(input)], [
				[1n, 4n],
				[2n, 5n],
				[3n, 6n],
			])
		})

		it('transposes a rectangular 3x2 matrix into 2x3', () => {
			const input = [
				[10n, 20n],
				[30n, 40n],
				[50n, 60n],
			]
			assert.deepStrictEqual([...transposeBigIntLazy(input)], [
				[10n, 30n, 50n],
				[20n, 40n, 60n],
			])
		})

		it('transposes a 1xN row vector into an Nx1 column vector', () => {
			const input = [[1n, 2n, 3n, 4n, 5n]]
			assert.deepStrictEqual([...transposeBigIntLazy(input)], [
				[1n],
				[2n],
				[3n],
				[4n],
				[5n],
			])
		})

		it('transposes an Nx1 column vector into a 1xN row vector', () => {
			const input = [[1n], [2n], [3n], [4n], [5n]]
			assert.deepStrictEqual([...transposeBigIntLazy(input)], [
				[1n, 2n, 3n, 4n, 5n],
			])
		})

		it('preserves 10^18-scaled fixed-point BigInt entries exactly', () => {
			const SCALE = 10n ** 18n
			const input = [
				[SCALE / 2n, -3n * SCALE + 123456789012345678n],
				[0n, 999999999999999999n],
			]
			assert.deepStrictEqual([...transposeBigIntLazy(input)], [
				[SCALE / 2n, 0n],
				[-3n * SCALE + 123456789012345678n, 999999999999999999n],
			])
		})
	})

	describe('edge cases', () => {
		it('returns empty output for an empty matrix', () => {
			assert.deepStrictEqual([...transposeBigIntLazy([])], [])
		})

		it('returns empty output for a matrix of empty rows', () => {
			assert.deepStrictEqual([...transposeBigIntLazy([[]])], [])
			assert.deepStrictEqual([...transposeBigIntLazy([[], [], []])], [])
		})

		it('handles huge arbitrary-precision BigInt values accurately', () => {
			const huge1 = (1n << 256n) + 123456789012345678901234567890n
			const huge2 = -(1n << 512n) - 987654321098765432109876543210n
			const huge3 = 10n ** 100n - 1n
			const huge4 = -(10n ** 100n) + 7n

			const input = [
				[huge1, huge2],
				[huge3, huge4],
			]
			assert.deepStrictEqual([...transposeBigIntLazy(input)], [
				[huge1, huge3],
				[huge2, huge4],
			])
		})

		it('supports TypedArrays, Sets, and custom iterables as rows', () => {
			const customRow = {
				*[Symbol.iterator]() {
					yield 7n
					yield 8n
					yield 9n
				},
			}
			const input = new Set([
				new BigInt64Array([1n, 2n, 3n]),
				new BigUint64Array([4n, 5n, 6n]),
				customRow,
			])
			assert.deepStrictEqual([...transposeBigIntLazy(input)], [
				[1n, 4n, 7n],
				[2n, 5n, 8n],
				[3n, 6n, 9n],
			])
		})

		it('throws RangeError on ragged rows', () => {
			assert.throws(
				() => [...transposeBigIntLazy([[1n, 2n], [3n]])],
				RangeError
			)
			assert.throws(
				() => [...transposeBigIntLazy([[1n], [2n, 3n]])],
				RangeError
			)
			assert.throws(
				() => [...transposeBigIntLazy([[], [1n]])],
				RangeError
			)
			assert.throws(
				() => [...transposeBigIntLazy([[1n], []])],
				RangeError
			)
			assert.throws(
				() => [...transposeBigIntLazy([[1n, 2n, 3n], [4n, 5n], [6n, 7n, 8n]])],
				RangeError
			)
		})

		it('consumes lazy generator inputs and produces outputs lazily', () => {
			let outerPulled = 0
			const rowPulled = [0, 0, 0]
			const closed = [false, false, false]

			function* makeInfiniteRow(rowIndex, factor) {
				try {
					for (let col = 0n; ; col++) {
						rowPulled[rowIndex]++
						yield col * factor + BigInt(rowIndex)
					}
				} finally {
					closed[rowIndex] = true
				}
			}

			function* makeMatrix() {
				outerPulled++
				yield makeInfiniteRow(0, 10n)
				outerPulled++
				yield makeInfiniteRow(1, 100n)
				outerPulled++
				yield makeInfiniteRow(2, 1000n)
			}

			const gen = transposeBigIntLazy(makeMatrix())

			// Nothing pulled before the consumer calls next()
			assert.strictEqual(outerPulled, 0)
			assert.deepStrictEqual(rowPulled, [0, 0, 0])

			// Pull first 3 transposed rows from infinite-column input
			const first3 = []
			for (const row of gen) {
				first3.push(row)
				if (first3.length === 3) break
			}

			assert.strictEqual(outerPulled, 3)
			assert.deepStrictEqual(rowPulled, [3, 3, 3])
			assert.deepStrictEqual(first3, [
				[0n, 1n, 2n],
				[10n, 101n, 1002n],
				[20n, 201n, 2002n],
			])
			// Early break closes all open upstream row generators
			assert.deepStrictEqual(closed, [true, true, true])
		})

		it('closes already-opened row iterators when a later row fails validation', () => {
			let row0ReturnCalled = false
			const row0 = {
				[Symbol.iterator]() {
					return {
						next() {
							return { value: 1n, done: false }
						},
						return() {
							row0ReturnCalled = true
							return { value: undefined, done: true }
						},
					}
				},
			}

			assert.throws(
				() => [...transposeBigIntLazy([row0, null])],
				TypeError
			)
			assert.strictEqual(row0ReturnCalled, true)

			let genRow0Closed = false
			function* genRow0() {
				try {
					yield 1n
					yield 2n
					yield 3n
				} finally {
					genRow0Closed = true
				}
			}

			assert.throws(
				() => [...transposeBigIntLazy([genRow0(), [10n, 'bad', 30n]])],
				TypeError
			)
			assert.strictEqual(genRow0Closed, true)
		})

		it('throws TypeError on invalid matrix arguments', () => {
			for (const bad of [null, undefined, 42, 42n, true, {}, 'abc']) {
				assert.throws(() => transposeBigIntLazy(bad), TypeError)
			}
		})

		it('throws TypeError on invalid row arguments', () => {
			for (const badRow of [null, undefined, 1, 1n, true, {}, '123']) {
				assert.throws(() => [...transposeBigIntLazy([badRow])], TypeError)
			}
		})

		it('throws TypeError on malformed row iterators', () => {
			const badIterable = {
				[Symbol.iterator]() {
					return { notNext: true }
				},
			}
			assert.throws(() => [...transposeBigIntLazy([badIterable])], TypeError)
		})

		it('throws TypeError on non-BigInt matrix entries', () => {
			assert.throws(() => [...transposeBigIntLazy([[1, 2n]])], TypeError)
			assert.throws(() => [...transposeBigIntLazy([[1n], ['2']])], TypeError)
			assert.throws(() => [...transposeBigIntLazy([[1n, null]])], TypeError)
			assert.throws(() => [...transposeBigIntLazy([[1n, undefined]])], TypeError)
			assert.throws(() => [...transposeBigIntLazy([[1n, NaN]])], TypeError)
			assert.throws(() => [...transposeBigIntLazy([[1n, true]])], TypeError)
			assert.throws(() => [...transposeBigIntLazy([[1n, {}]])], TypeError)
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies involution (A^T)^T === A across diverse shapes and chained generators', () => {
			const matrices = [
				[[0n]],
				[
					[1n, 2n],
					[3n, 4n],
				],
				[
					[-10n, 20n, -30n, 40n],
					[50n, -60n, 70n, -80n],
					[90n, -100n, 110n, -120n],
				],
				[[1n, 2n, 3n, 4n]],
				[[1n], [2n], [3n], [4n]],
				[
					[10n ** 40n, -(10n ** 40n) + 1n],
					[2n ** 128n, -(2n ** 128n)],
					[0n, 1n],
				],
			]

			for (const A of matrices) {
				// Direct generator-to-generator pipeline without intermediate materialization
				const doubleTransposed = [...transposeBigIntLazy(transposeBigIntLazy(A))]
				assert.deepStrictEqual(doubleTransposed, A)

				// Coordinate-by-coordinate definition check: A^T[j][i] === A[i][j]
				const AT = [...transposeBigIntLazy(A)]
				assert.strictEqual(AT.length, A[0].length)
				for (let i = 0; i < A.length; i++) {
					for (let j = 0; j < A[0].length; j++) {
						assert.strictEqual(AT[j][i], A[i][j])
					}
				}
			}
		})

		it('satisfies linearity (A + B)^T === A^T + B^T and scalar multiplication (c * A)^T === c * A^T', () => {
			const A = [
				[1n, -2n, 3n],
				[4n, 5n, -6n],
			]
			const B = [
				[7n, 8n, -9n],
				[-10n, 11n, 12n],
			]
			const c = -(10n ** 18n)

			const addMat = (X, Y) =>
				X.map((row, i) => row.map((v, j) => v + Y[i][j]))
			const scaleMat = (k, X) => X.map((row) => row.map((v) => k * v))

			const sumT = [...transposeBigIntLazy(addMat(A, B))]
			const tSum = addMat(
				[...transposeBigIntLazy(A)],
				[...transposeBigIntLazy(B)]
			)
			assert.deepStrictEqual(sumT, tSum)

			const scaledT = [...transposeBigIntLazy(scaleMat(c, A))]
			const tScaled = scaleMat(c, [...transposeBigIntLazy(A)])
			assert.deepStrictEqual(scaledT, tScaled)
		})
	})
})
