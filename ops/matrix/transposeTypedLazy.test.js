import { describe, it } from 'node:test'
import assert from 'node:assert'
import { transposeTypedLazy } from './transposeTypedLazy.js'

/**
 * Helper to collect all rows from an iterable of Float64Arrays into an Array.
 * @param {Iterable<Float64Array>} iterable
 * @returns {Float64Array[]}
 */
function collect(iterable) {
	return Array.from(iterable)
}

describe('transposeTypedLazy', () => {
	describe('normal cases', () => {
		it('transposes a 2x2 square matrix', () => {
			const input = [
				new Float64Array([1, 2]),
				new Float64Array([3, 4])
			]
			const result = collect(transposeTypedLazy(input))

			assert.strictEqual(result.length, 2)
			for (const row of result) {
				assert.ok(row instanceof Float64Array)
			}
			assert.deepStrictEqual(result, [
				new Float64Array([1, 3]),
				new Float64Array([2, 4])
			])
		})

		it('transposes a 3x3 square matrix with negative and fractional values', () => {
			const input = [
				new Float64Array([1.5, -2.25, 3.75]),
				new Float64Array([0, 4.125, -5.5]),
				new Float64Array([6.25, -7.75, 8.5])
			]
			const result = collect(transposeTypedLazy(input))

			assert.deepStrictEqual(result, [
				new Float64Array([1.5, 0, 6.25]),
				new Float64Array([-2.25, 4.125, -7.75]),
				new Float64Array([3.75, -5.5, 8.5])
			])
		})

		it('preserves special IEEE-754 float64 values (NaN, -0, Infinity, subnormals)', () => {
			const input = [
				new Float64Array([NaN, -0, Infinity]),
				new Float64Array([-Infinity, Number.MAX_VALUE, Number.MIN_VALUE])
			]
			const result = collect(transposeTypedLazy(input))

			assert.strictEqual(result.length, 3)
			assert.ok(Number.isNaN(result[0][0]))
			assert.strictEqual(result[0][1], -Infinity)
			assert.ok(Object.is(result[1][0], -0))
			assert.strictEqual(result[1][1], Number.MAX_VALUE)
			assert.strictEqual(result[2][0], Infinity)
			assert.strictEqual(result[2][1], Number.MIN_VALUE)
		})

		it('handles Float64Array subarrays with non-zero byteOffset', () => {
			const backing = new Float64Array([99, 10, 20, 30, 88, 40, 50, 60, 77])
			const row0 = backing.subarray(1, 4) // [10, 20, 30]
			const row1 = backing.subarray(5, 8) // [40, 50, 60]

			const result = collect(transposeTypedLazy([row0, row1]))
			assert.deepStrictEqual(result, [
				new Float64Array([10, 40]),
				new Float64Array([20, 50]),
				new Float64Array([30, 60])
			])
		})

		it('accepts diverse iterable sources (Set, generator, custom iterable)', () => {
			const r0 = new Float64Array([1, 2])
			const r1 = new Float64Array([3, 4])
			const expected = [
				new Float64Array([1, 3]),
				new Float64Array([2, 4])
			]

			// Set
			assert.deepStrictEqual(collect(transposeTypedLazy(new Set([r0, r1]))), expected)

			// Generator
			function* rowGen() {
				yield r0
				yield r1
			}
			assert.deepStrictEqual(collect(transposeTypedLazy(rowGen())), expected)

			// Custom iterable
			const customIterable = {
				[Symbol.iterator]() {
					const items = [r0, r1]
					let idx = 0
					return {
						next() {
							if (idx < items.length) {
								return { value: items[idx++], done: false }
							}
							return { value: undefined, done: true }
						}
					}
				}
			}
			assert.deepStrictEqual(collect(transposeTypedLazy(customIterable)), expected)
		})
	})

	describe('edge cases', () => {
		it('transposes a wide rectangular matrix (2x4 -> 4x2)', () => {
			const input = [
				new Float64Array([1, 2, 3, 4]),
				new Float64Array([5, 6, 7, 8])
			]
			const result = collect(transposeTypedLazy(input))

			assert.deepStrictEqual(result, [
				new Float64Array([1, 5]),
				new Float64Array([2, 6]),
				new Float64Array([3, 7]),
				new Float64Array([4, 8])
			])
		})

		it('transposes a tall rectangular matrix (4x2 -> 2x4)', () => {
			const input = [
				new Float64Array([1, 2]),
				new Float64Array([3, 4]),
				new Float64Array([5, 6]),
				new Float64Array([7, 8])
			]
			const result = collect(transposeTypedLazy(input))

			assert.deepStrictEqual(result, [
				new Float64Array([1, 3, 5, 7]),
				new Float64Array([2, 4, 6, 8])
			])
		})

		it('transposes a 1xN row matrix into an Nx1 column matrix', () => {
			const input = [new Float64Array([10, 20, 30, 40])]
			const result = collect(transposeTypedLazy(input))

			assert.deepStrictEqual(result, [
				new Float64Array([10]),
				new Float64Array([20]),
				new Float64Array([30]),
				new Float64Array([40])
			])
		})

		it('transposes an Nx1 column matrix into a 1xN row matrix', () => {
			const input = [
				new Float64Array([10]),
				new Float64Array([20]),
				new Float64Array([30]),
				new Float64Array([40])
			]
			const result = collect(transposeTypedLazy(input))

			assert.deepStrictEqual(result, [
				new Float64Array([10, 20, 30, 40])
			])
		})

		it('transposes a 1x1 matrix', () => {
			const input = [new Float64Array([42])]
			const result = collect(transposeTypedLazy(input))

			assert.deepStrictEqual(result, [new Float64Array([42])])
		})

		it('yields nothing for an empty iterable (0 rows)', () => {
			assert.deepStrictEqual(collect(transposeTypedLazy([])), [])

			function* emptyGen() {}
			assert.deepStrictEqual(collect(transposeTypedLazy(emptyGen())), [])
		})

		it('yields nothing for an Rx0 matrix (all rows empty)', () => {
			const input = [
				new Float64Array(0),
				new Float64Array(0),
				new Float64Array(0)
			]
			assert.deepStrictEqual(collect(transposeTypedLazy(input)), [])
		})

		it('yields freshly allocated Float64Arrays isolated from input mutations', () => {
			const input = [
				new Float64Array([1, 2]),
				new Float64Array([3, 4])
			]
			const result = collect(transposeTypedLazy(input))
			result[0][0] = 999

			assert.strictEqual(input[0][0], 1)
			assert.notStrictEqual(result[0].buffer, input[0].buffer)
		})
	})

	describe('lazy and streaming behavior', () => {
		it('does not consume the input iterable until iteration begins', () => {
			let pullCount = 0
			function* trackedSource() {
				pullCount++
				yield new Float64Array([1, 2, 3])
				pullCount++
				yield new Float64Array([4, 5, 6])
			}

			const gen = transposeTypedLazy(trackedSource())
			assert.strictEqual(pullCount, 0, 'source must not be consumed before .next()')

			const first = gen.next()
			assert.strictEqual(first.done, false)
			assert.deepStrictEqual(first.value, new Float64Array([1, 4]))
			assert.strictEqual(pullCount, 2)
		})

		it('yields transposed rows lazily one column at a time and supports early termination', () => {
			const cols = 500
			const r0 = new Float64Array(cols)
			const r1 = new Float64Array(cols)
			for (let i = 0; i < cols; i++) {
				r0[i] = i
				r1[i] = i * 10
			}

			const gen = transposeTypedLazy([r0, r1])
			const taken = []
			for (const row of gen) {
				taken.push(row)
				if (taken.length === 3) break
			}

			assert.deepStrictEqual(taken, [
				new Float64Array([0, 0]),
				new Float64Array([1, 10]),
				new Float64Array([2, 20])
			])
			// Generator should be closed after early break
			assert.deepStrictEqual(gen.next(), { value: undefined, done: true })
		})

		it('stays completely lazy when chaining transposeTypedLazy pipelines', () => {
			let started = false
			function* lazyMatrix() {
				started = true
				yield new Float64Array([7, 8, 9])
				yield new Float64Array([10, 11, 12])
			}

			const pipeline = transposeTypedLazy(transposeTypedLazy(lazyMatrix()))
			assert.strictEqual(started, false, 'chained generators must remain lazy before consumption')

			const result = collect(pipeline)
			assert.strictEqual(started, true)
			assert.deepStrictEqual(result, [
				new Float64Array([7, 8, 9]),
				new Float64Array([10, 11, 12])
			])
		})
	})

	describe('input validation', () => {
		it('throws TypeError synchronously for non-iterable or invalid outer inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				true,
				false,
				'not a matrix',
				Symbol('sym'),
				{},
				() => {},
				new Float64Array([1, 2, 3]),
				new Int32Array([1, 2, 3]),
				new DataView(new ArrayBuffer(8))
			]

			for (const bad of invalidInputs) {
				assert.throws(
					() => transposeTypedLazy(bad),
					TypeError,
					`Expected TypeError for input: ${String(bad)}`
				)
			}
		})

		it('throws TypeError when any yielded row is not a Float64Array', () => {
			const badMatrices = [
				[[1, 2], [3, 4]],
				[new Float64Array([1, 2]), [3, 4]],
				[new Float32Array([1, 2])],
				[new Int32Array([1, 2])],
				[new Float64Array([1, 2]), null],
				[new Float64Array([1, 2]), '12']
			]

			for (const bad of badMatrices) {
				assert.throws(
					() => collect(transposeTypedLazy(bad)),
					TypeError
				)
			}
		})

		it('throws RangeError for ragged matrices', () => {
			const raggedMatrices = [
				[new Float64Array([1, 2, 3]), new Float64Array([4, 5])],
				[new Float64Array([1, 2]), new Float64Array([3, 4, 5])],
				[new Float64Array(0), new Float64Array([1])],
				[new Float64Array([1]), new Float64Array(0)],
				[new Float64Array([1, 2]), new Float64Array([3, 4]), new Float64Array([5])]
			]

			for (const ragged of raggedMatrices) {
				assert.throws(
					() => collect(transposeTypedLazy(ragged)),
					RangeError
				)
			}
		})

		it('closes the input generator cleanly when validation fails mid-stream', () => {
			let finalized = false
			function* raggedGen() {
				try {
					yield new Float64Array([1, 2])
					yield new Float64Array([3])
					yield new Float64Array([4, 5])
				} finally {
					finalized = true
				}
			}

			assert.throws(() => collect(transposeTypedLazy(raggedGen())), RangeError)
			assert.strictEqual(finalized, true)
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies double transpose involution ((A^T)^T === A) across shapes', () => {
			const shapes = [
				[0, 0],
				[1, 1],
				[1, 5],
				[5, 1],
				[2, 5],
				[5, 2],
				[4, 4],
				[7, 11]
			]

			for (const [rows, cols] of shapes) {
				const matrix = Array.from({ length: rows }, (_, r) =>
					Float64Array.from({ length: cols }, (_, c) => (r + 1) * 1.25 - (c + 1) * 0.5)
				)
				const doubleTransposed = collect(transposeTypedLazy(transposeTypedLazy(matrix)))
				assert.deepStrictEqual(
					doubleTransposed,
					matrix,
					`Involution failed for shape ${rows}x${cols}`
				)
			}
		})

		it('matches an independent element-wise reference implementation and preserves Frobenius norm and trace', () => {
			// Deterministic LCG for reproducible floating-point test matrices
			let seed = 1337
			const nextVal = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0
				return (seed / 0xffffffff) * 200 - 100
			}

			const cases = [
				[6, 6],
				[5, 9],
				[9, 5]
			]

			for (const [R, C] of cases) {
				const matrix = Array.from({ length: R }, () =>
					Float64Array.from({ length: C }, () => nextVal())
				)

				const actual = collect(transposeTypedLazy(matrix))
				assert.strictEqual(actual.length, C)

				let frobOriginal = 0
				let frobTransposed = 0

				for (let r = 0; r < R; r++) {
					for (let c = 0; c < C; c++) {
						assert.strictEqual(actual[c].length, R)
						assert.strictEqual(actual[c][r], matrix[r][c])
						frobOriginal += matrix[r][c] ** 2
					}
				}

				for (let c = 0; c < C; c++) {
					for (let r = 0; r < R; r++) {
						frobTransposed += actual[c][r] ** 2
					}
				}
				assert.ok(Math.abs(frobOriginal - frobTransposed) < 1e-9)

				if (R === C) {
					let traceOrig = 0
					let traceTrans = 0
					for (let i = 0; i < R; i++) {
						traceOrig += matrix[i][i]
						traceTrans += actual[i][i]
					}
					assert.strictEqual(traceTrans, traceOrig)
				}
			}
		})
	})
})
