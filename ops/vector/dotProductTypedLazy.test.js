import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductTypedLazy } from './dotProductTypedLazy.js'

describe('dotProductTypedLazy', () => {
	describe('normal cases', () => {
		test('computes dot product of basic Float64Array vectors', () => {
			const a = new Float64Array([1, 2, 3])
			const b = new Float64Array([4, 5, 6])
			assert.equal(dotProductTypedLazy(a, b), 32)
		})

		test('handles negative and fractional values', () => {
			const a = new Float64Array([-1.5, 2.25, -4])
			const b = new Float64Array([2, -4, -0.5])
			// (-3) + (-9) + 2 = -10
			assert.equal(dotProductTypedLazy(a, b), -10)
		})

		test('handles single-element Float64Array vectors', () => {
			assert.equal(
				dotProductTypedLazy(new Float64Array([7.5]), new Float64Array([-2])),
				-15
			)
		})

		test('works with Float64Array subarray views', () => {
			const bufA = new Float64Array([99, 2, 3, 4, 88])
			const bufB = new Float64Array([77, 5, 6, 7, 66])
			assert.equal(dotProductTypedLazy(bufA.subarray(1, 4), bufB.subarray(1, 4)), 56)
		})

		test('preserves precision with Neumaier compensated summation', () => {
			const a = new Float64Array([1e16, 1, -1e16])
			const b = new Float64Array([1, 1, 1])
			assert.equal(dotProductTypedLazy(a, b), 1)
		})
	})

	describe('edge cases', () => {
		test('returns 0 for empty Float64Array inputs', () => {
			assert.equal(dotProductTypedLazy(new Float64Array(0), new Float64Array(0)), 0)
		})

		test('returns 0 for empty lazy generators', () => {
			function* empty() {}
			assert.equal(dotProductTypedLazy(empty(), empty()), 0)
		})

		test('returns 0 for orthogonal vectors', () => {
			const a = new Float64Array([1, 0, -2, 0])
			const b = new Float64Array([0, 5, 0, 9])
			assert.equal(dotProductTypedLazy(a, b), 0)

			const u = new Float64Array([3, 4])
			const v = new Float64Array([-4, 3])
			assert.equal(dotProductTypedLazy(u, v), 0)
		})

		test('normalizes -0 result to +0', () => {
			const res = dotProductTypedLazy(new Float64Array([-0]), new Float64Array([1]))
			assert.equal(Object.is(res, 0), true)
		})

		test('throws RangeError on mismatched Float64Array lengths', () => {
			assert.throws(
				() => dotProductTypedLazy(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
				RangeError
			)
			assert.throws(
				() => dotProductTypedLazy(new Float64Array([1]), new Float64Array(0)),
				RangeError
			)
		})

		test('throws RangeError on mismatched lazy sequence lengths', () => {
			function* seq(values) {
				for (const v of values) yield v
			}
			assert.throws(() => dotProductTypedLazy(seq([1, 2, 3]), seq([4, 5])), RangeError)
			assert.throws(() => dotProductTypedLazy(seq([1, 2]), seq([4, 5, 6])), RangeError)
		})
	})

	describe('lazy and streaming behavior', () => {
		test('consumes iterables strictly in lockstep rather than eagerly', () => {
			const trace = []
			function* genA() {
				for (let i = 0; i < 3; i++) {
					trace.push(`A:${i}`)
					yield i + 1
				}
			}
			function* genB() {
				for (let i = 0; i < 3; i++) {
					trace.push(`B:${i}`)
					yield (i + 1) * 10
				}
			}

			const result = dotProductTypedLazy(genA(), genB())
			assert.equal(result, 1 * 10 + 2 * 20 + 3 * 30)
			assert.deepEqual(trace, ['A:0', 'B:0', 'A:1', 'B:1', 'A:2', 'B:2'])
		})

		test('supports streaming Float64Array chunks with misaligned boundaries and empty chunks', () => {
			const pulledChunks = []
			function* chunksA() {
				pulledChunks.push('A0')
				yield new Float64Array([1, 2])
				pulledChunks.push('A1')
				yield new Float64Array(0)
				pulledChunks.push('A2')
				yield new Float64Array([3, 4, 5])
			}
			function* chunksB() {
				pulledChunks.push('B0')
				yield new Float64Array([10])
				pulledChunks.push('B1')
				yield new Float64Array([20, 30, 40])
				pulledChunks.push('B2')
				yield new Float64Array([50])
			}

			// 1*10 + 2*20 + 3*30 + 4*40 + 5*50 = 10 + 40 + 90 + 160 + 250 = 550
			assert.equal(dotProductTypedLazy(chunksA(), chunksB()), 550)
			assert.deepEqual(pulledChunks, ['A0', 'B0', 'B1', 'A1', 'A2', 'B2'])
		})

		test('supports mixing Float64Array and lazy iterable sequence', () => {
			function* gen() {
				yield new Float64Array([2, 3])
				yield 4
			}
			assert.equal(dotProductTypedLazy(new Float64Array([10, 20, 30]), gen()), 200)
		})

		test('terminates early on infinite generator when length mismatches and runs cleanup', () => {
			let pulled = 0
			let closed = false
			function* infinite() {
				try {
					while (true) {
						pulled++
						yield 1
					}
				} finally {
					closed = true
				}
			}

			assert.throws(
				() => dotProductTypedLazy(infinite(), new Float64Array([1, 2, 3])),
				RangeError
			)
			// Only pulled 4 elements (3 matched + 1 to detect mismatch), never hung
			assert.equal(pulled, 4)
			assert.equal(closed, true)
		})

		test('terminates early and closes other generator when invalid element is encountered', () => {
			let pulledB = 0
			let closedB = false
			function* badA() {
				yield 1
				yield 2
				yield Number.NaN
				yield 4
			}
			function* infiniteB() {
				try {
					while (true) {
						pulledB++
						yield 10
					}
				} finally {
					closedB = true
				}
			}

			assert.throws(() => dotProductTypedLazy(badA(), infiniteB()), RangeError)
			assert.equal(pulledB, 2)
			assert.equal(closedB, true)
		})
	})

	describe('input validation', () => {
		test('rejects null, undefined, primitives, strings, and plain objects', () => {
			const valid = new Float64Array([1, 2])
			for (const invalid of [null, undefined, 42, true, '12', {}, () => {}]) {
				assert.throws(() => dotProductTypedLazy(invalid, valid), TypeError)
				assert.throws(() => dotProductTypedLazy(valid, invalid), TypeError)
			}
		})

		test('rejects plain Arrays, non-Float64Array typed arrays, DataView, Map, and Set', () => {
			const valid = new Float64Array([1, 2])
			const invalidContainers = [
				[1, 2],
				new Float32Array([1, 2]),
				new Int32Array([1, 2]),
				new Uint8Array([1, 2]),
				new DataView(new ArrayBuffer(16)),
				new Map([[1, 2]]),
				new Set([1, 2])
			]
			for (const invalid of invalidContainers) {
				assert.throws(() => dotProductTypedLazy(invalid, valid), TypeError)
				assert.throws(() => dotProductTypedLazy(valid, invalid), TypeError)
			}
		})

		test('rejects NaN and Infinity elements in Float64Array and streams', () => {
			const valid = new Float64Array([1, 2])
			for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				assert.throws(() => dotProductTypedLazy(new Float64Array([1, bad]), valid), RangeError)
				assert.throws(() => dotProductTypedLazy(valid, new Float64Array([bad, 2])), RangeError)

				function* badStream() {
					yield 1
					yield bad
				}
				assert.throws(() => dotProductTypedLazy(badStream(), valid), RangeError)
			}
		})

		test('rejects non-number, non-Float64Array elements yielded by iterables', () => {
			const valid = new Float64Array([1, 2])
			for (const badItem of ['2', null, undefined, {}, [2], new Float32Array([2])]) {
				function* badStream() {
					yield 1
					yield badItem
				}
				assert.throws(() => dotProductTypedLazy(badStream(), valid), TypeError)
			}
		})

		test('throws RangeError on product or sum overflow', () => {
			assert.throws(
				() => dotProductTypedLazy(new Float64Array([1e200]), new Float64Array([1e200])),
				RangeError
			)
			assert.throws(
				() =>
					dotProductTypedLazy(
						new Float64Array([1e308, 1e308]),
						new Float64Array([1, 1])
					),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		test('matches closed-form sum of squares over large streamed sequence', () => {
			const N = 10000
			function* rangeChunks(chunkSize) {
				for (let start = 1; start <= N; start += chunkSize) {
					const len = Math.min(chunkSize, N - start + 1)
					const chunk = new Float64Array(len)
					for (let i = 0; i < len; i++) {
						chunk[i] = start + i
					}
					yield chunk
				}
			}

			// Closed-form: sum_{k=1}^N k^2 = N(N+1)(2N+1)/6
			const expected = (N * (N + 1) * (2 * N + 1)) / 6
			assert.equal(dotProductTypedLazy(rangeChunks(128), rangeChunks(257)), expected)
		})

		test('matches closed-form triangular product identity sum_{k=1}^N k(N+1-k)', () => {
			const N = 500
			function* asc() {
				for (let k = 1; k <= N; k++) yield k
			}
			function* desc() {
				for (let k = N; k >= 1; k--) yield k
			}

			// Closed-form: sum_{k=1}^N k(N+1-k) = N(N+1)(N+2)/6
			const expected = (N * (N + 1) * (N + 2)) / 6
			assert.equal(dotProductTypedLazy(asc(), desc()), expected)
		})

		test('satisfies commutativity, bilinearity, and Cauchy-Schwarz inequality on deterministic vectors', () => {
			let state = 123456789
			const nextRand = () => {
				state = (1103515245 * state + 12345) & 0x7fffffff
				return state / 0x7fffffff - 0.5
			}

			const n = 256
			const a = new Float64Array(n)
			const b = new Float64Array(n)
			const c = new Float64Array(n)
			const bPlusC = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				a[i] = nextRand()
				b[i] = nextRand()
				c[i] = nextRand()
				bPlusC[i] = b[i] + c[i]
			}

			const ab = dotProductTypedLazy(a, b)
			const ba = dotProductTypedLazy(b, a)
			assert.equal(ab, ba)

			const ac = dotProductTypedLazy(a, c)
			const aBPlusC = dotProductTypedLazy(a, bPlusC)
			assert.ok(Math.abs(aBPlusC - (ab + ac)) < 1e-12)

			const normASq = dotProductTypedLazy(a, a)
			const normBSq = dotProductTypedLazy(b, b)
			assert.ok(ab * ab <= normASq * normBSq + 1e-12)
		})
	})
})
