import { describe, test } from 'node:test'
import assert from 'node:assert'
import { traceFloatLazy } from './traceFloatLazy.js'

describe('traceFloatLazy', () => {
	describe('normal cases', () => {
		test('1x1 matrix', () => {
			assert.strictEqual(traceFloatLazy([[42.5]]), 42.5)
		})

		test('2x2 and 3x3 matrices', () => {
			assert.strictEqual(
				traceFloatLazy([
					[1, 2],
					[3, 4],
				]),
				5
			)
			assert.strictEqual(
				traceFloatLazy([
					[1.5, -2, 3],
					[4, 2.25, -6],
					[7, 8, -0.75],
				]),
				3
			)
		})

		test('identity and zero matrices', () => {
			const n = 5
			const identity = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
			)
			const zeros = Array.from({ length: n }, () => new Float64Array(n))
			assert.strictEqual(traceFloatLazy(identity), n)
			assert.strictEqual(traceFloatLazy(zeros), 0)
		})

		test('accepts TypedArray, Set, and generator iterables', () => {
			const mixed = [
				new Float64Array([1.25, 9, 8]),
				new Set([7, 2.5, 6]),
				(function* () {
					yield 5
					yield 4
					yield 3.75
				})(),
			]
			assert.strictEqual(traceFloatLazy(mixed), 7.5)
		})

		test('accepts generator of generators', () => {
			function* matrixGen(n) {
				for (let i = 0; i < n; i++) {
					yield (function* (row) {
						for (let j = 0; j < n; j++) {
							yield row === j ? (row + 1) * 0.5 : -999
						}
					})(i)
				}
			}
			// 0.5 + 1.0 + 1.5 + 2.0 = 5.0
			assert.strictEqual(traceFloatLazy(matrixGen(4)), 5)
		})
	})

	describe('edge cases (IEEE-754 float64 and empty)', () => {
		test('empty 0x0 matrix returns 0', () => {
			assert.strictEqual(traceFloatLazy([]), 0)
			assert.strictEqual(
				traceFloatLazy((function* () {})()),
				0
			)
		})

		test('preserves IEEE-754 signed zero semantics', () => {
			assert.ok(Object.is(traceFloatLazy([[-0]]), -0))
			assert.ok(
				Object.is(
					traceFloatLazy([
						[-0, 1],
						[2, -0],
					]),
					-0
				)
			)
			assert.ok(
				Object.is(
					traceFloatLazy([
						[-0, 1],
						[2, 0],
					]),
					0
				)
			)
		})

		test('handles subnormals, MAX_VALUE overflow, Infinity, and NaN', () => {
			assert.strictEqual(
				traceFloatLazy([
					[Number.MIN_VALUE, 0],
					[0, Number.MIN_VALUE],
				]),
				Number.MIN_VALUE + Number.MIN_VALUE
			)
			assert.strictEqual(
				traceFloatLazy([
					[Number.MAX_VALUE, 0],
					[0, Number.MAX_VALUE],
				]),
				Infinity
			)
			assert.strictEqual(
				traceFloatLazy([
					[Infinity, 1],
					[2, 3],
				]),
				Infinity
			)
			assert.strictEqual(
				traceFloatLazy([
					[-Infinity, 1],
					[2, 3],
				]),
				-Infinity
			)
			assert.ok(
				Number.isNaN(
					traceFloatLazy([
						[Infinity, 0],
						[0, -Infinity],
					])
				)
			)
			assert.ok(
				Number.isNaN(
					traceFloatLazy([
						[NaN, 1],
						[2, 3],
					])
				)
			)
		})

		test('off-diagonal NaN and Infinity do not pollute diagonal trace', () => {
			assert.strictEqual(
				traceFloatLazy([
					[1.5, NaN, Infinity],
					[-Infinity, 2.5, NaN],
					[NaN, Infinity, 3.5],
				]),
				7.5
			)
		})

		test('matches IEEE-754 float64 rounding for 0.1 + 0.2', () => {
			assert.strictEqual(
				traceFloatLazy([
					[0.1, 0],
					[0, 0.2],
				]),
				0.1 + 0.2
			)
		})
	})

	describe('input validation', () => {
		test('rejects non-iterable or string matrix inputs', () => {
			for (const bad of [null, undefined, 42, true, {}, 'abc']) {
				assert.throws(() => traceFloatLazy(bad), TypeError)
			}
		})

		test('rejects non-iterable or string rows', () => {
			for (const bad of [[null], [undefined], [123], [{}], ['ab', 'cd']]) {
				assert.throws(() => traceFloatLazy(bad), TypeError)
			}
		})

		test('rejects non-number entries on and off the diagonal', () => {
			const sparseRow = [1, , 3]
			const badMatrices = [
				[['1']],
				[[1, '2'], [3, 4]],
				[[1, null], [3, 4]],
				[[1, undefined], [3, 4]],
				[[1n]],
				[[true]],
				[[new Number(1)]],
				[sparseRow, [4, 5, 6], [7, 8, 9]],
				[new BigInt64Array([1n])],
			]
			for (const bad of badMatrices) {
				assert.throws(() => traceFloatLazy(bad), TypeError)
			}
		})

		test('rejects non-square and ragged matrices', () => {
			const nonSquare = [
				[[]],
				[[], []],
				[[1, 2]],
				[[1], [2]],
				[
					[1, 2, 3],
					[4, 5, 6],
				],
				[
					[1, 2],
					[3, 4],
					[5, 6],
				],
				[
					[1, 2, 3],
					[4, 5],
					[6, 7, 8],
				],
				[
					[1, 2],
					[3, 4, 5],
				],
			]
			for (const bad of nonSquare) {
				assert.throws(() => traceFloatLazy(bad), RangeError)
			}
		})
	})

	describe('lazy streaming behavior', () => {
		test('consumes outer and inner iterables in a single pass', () => {
			let matrixIterCount = 0
			const rowIterCounts = [0, 0, 0]

			const oneShotMatrix = {
				[Symbol.iterator]() {
					matrixIterCount += 1
					if (matrixIterCount > 1) {
						throw new Error('matrix iterated more than once')
					}
					let r = 0
					return {
						next() {
							if (r >= 3) return { done: true, value: undefined }
							const rowIdx = r++
							return {
								done: false,
								value: {
									[Symbol.iterator]() {
										rowIterCounts[rowIdx] += 1
										if (rowIterCounts[rowIdx] > 1) {
											throw new Error(`row ${rowIdx} iterated more than once`)
										}
										let c = 0
										return {
											next() {
												if (c >= 3) return { done: true, value: undefined }
												const colIdx = c++
												return {
													done: false,
													value: rowIdx === colIdx ? (rowIdx + 1) * 10 : 0,
												}
											},
										}
									},
								},
							}
						},
					}
				},
			}

			assert.strictEqual(traceFloatLazy(oneShotMatrix), 60)
			assert.strictEqual(matrixIterCount, 1)
			assert.deepStrictEqual(rowIterCounts, [1, 1, 1])
		})

		test('stops lazily on infinite row stream once row count exceeds width and closes generator', () => {
			let rowsYielded = 0
			let closed = false

			function* infiniteRows() {
				try {
					while (true) {
						rowsYielded += 1
						yield [1, 2]
					}
				} finally {
					closed = true
				}
			}

			assert.throws(() => traceFloatLazy(infiniteRows()), RangeError)
			assert.strictEqual(rowsYielded, 3)
			assert.strictEqual(closed, true)
		})

		test('stops lazily on infinite column stream in subsequent row and closes both generators', () => {
			let colsYieldedInRow1 = 0
			let row1Closed = false
			let matrixClosed = false

			function* infiniteRow() {
				try {
					while (true) {
						colsYieldedInRow1 += 1
						yield 1
					}
				} finally {
					row1Closed = true
				}
			}

			function* matrixWithInfiniteRow() {
				try {
					yield [1, 2]
					yield infiniteRow()
					yield [3, 4]
				} finally {
					matrixClosed = true
				}
			}

			assert.throws(() => traceFloatLazy(matrixWithInfiniteRow()), RangeError)
			assert.strictEqual(colsYieldedInRow1, 3)
			assert.strictEqual(row1Closed, true)
			assert.strictEqual(matrixClosed, true)
		})

		test('does not evaluate later rows after an earlier element validation error', () => {
			let rowsEvaluated = 0

			function* lazyMatrix() {
				rowsEvaluated += 1
				yield [1, 'invalid']
				rowsEvaluated += 1
				yield [3, 4]
			}

			assert.throws(() => traceFloatLazy(lazyMatrix()), TypeError)
			assert.strictEqual(rowsEvaluated, 1)
		})

		test('streams a large 500x500 generated matrix without materializing it', () => {
			const n = 500
			let activeRows = 0
			let maxActiveRows = 0

			function* largeStream() {
				for (let i = 0; i < n; i++) {
					activeRows += 1
					if (activeRows > maxActiveRows) maxActiveRows = activeRows
					yield (function* (rowIndex) {
						try {
							for (let j = 0; j < n; j++) {
								yield rowIndex === j ? rowIndex + 1 : 0
							}
						} finally {
							activeRows -= 1
						}
					})(i)
				}
			}

			const expected = (n * (n + 1)) / 2
			assert.strictEqual(traceFloatLazy(largeStream()), expected)
			assert.strictEqual(maxActiveRows, 1)
			assert.strictEqual(activeRows, 0)
		})
	})

	describe('independent cross-checks', () => {
		// Deterministic PRNG (Mulberry32) for reproducible matrix tests
		function mulberry32(seed) {
			let s = seed >>> 0
			return () => {
				s = (s + 0x6d2b79f5) >>> 0
				let t = Math.imul(s ^ (s >>> 15), 1 | s)
				t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
				return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 20 - 10
			}
		}

		function randomMatrix(rows, cols, rand) {
			return Array.from({ length: rows }, () =>
				Array.from({ length: cols }, () => rand())
			)
		}

		function transpose(m) {
			const rows = m.length
			const cols = m[0].length
			return Array.from({ length: cols }, (_, c) =>
				Array.from({ length: rows }, (_, r) => m[r][c])
			)
		}

		function matMul(a, b) {
			const rows = a.length
			const inner = b.length
			const cols = b[0].length
			return Array.from({ length: rows }, (_, i) =>
				Array.from({ length: cols }, (_, j) => {
					let acc = 0
					for (let k = 0; k < inner; k++) {
						acc += a[i][k] * b[k][j]
					}
					return acc
				})
			)
		}

		function* asLazyStream(mat) {
			for (const row of mat) {
				yield (function* () {
					for (const x of row) yield x
				})()
			}
		}

		test('matches direct reference sum and satisfies transpose invariance, linearity, and cyclic product property', () => {
			const rand = mulberry32(0x20261123)

			for (const n of [1, 2, 4, 7, 12]) {
				const A = randomMatrix(n, n, rand)
				const B = randomMatrix(n, n, rand)

				// 1. Bit-for-bit match against materialized reference sum
				const refTraceA = A.reduce((acc, row, i) => acc + row[i], 0)
				const lazyTraceA = traceFloatLazy(asLazyStream(A))
				assert.ok(Object.is(lazyTraceA, refTraceA))

				// 2. Transpose invariance: tr(A^T) === tr(A)
				assert.ok(Object.is(traceFloatLazy(asLazyStream(transpose(A))), lazyTraceA))

				// 3. Linearity: tr(alpha * A + beta * B) ≈ alpha * tr(A) + beta * tr(B)
				const alpha = 2.75
				const beta = -1.5
				const linearComb = A.map((row, i) =>
					row.map((val, j) => alpha * val + beta * B[i][j])
				)
				const lhs = traceFloatLazy(asLazyStream(linearComb))
				const rhs = alpha * lazyTraceA + beta * traceFloatLazy(asLazyStream(B))
				assert.ok(
					Math.abs(lhs - rhs) <= 1e-11 * Math.max(1, Math.abs(lhs), Math.abs(rhs)),
					`linearity mismatch for n=${n}: lhs=${lhs}, rhs=${rhs}`
				)
			}

			// 4. Cyclic property for rectangular factors: tr(P * Q) ≈ tr(Q * P)
			const P = randomMatrix(5, 8, rand)
			const Q = randomMatrix(8, 5, rand)
			const trPQ = traceFloatLazy(asLazyStream(matMul(P, Q)))
			const trQP = traceFloatLazy(asLazyStream(matMul(Q, P)))
			assert.ok(
				Math.abs(trPQ - trQP) <= 1e-11 * Math.max(1, Math.abs(trPQ), Math.abs(trQP)),
				`cyclic property mismatch: tr(PQ)=${trPQ}, tr(QP)=${trQP}`
			)
		})
	})
})
