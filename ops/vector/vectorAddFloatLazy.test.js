import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddFloatLazy } from './vectorAddFloatLazy.js'

describe('vectorAddFloatLazy', () => {
	describe('normal cases', () => {
		test('adds two arrays of float64 numbers', () => {
			const result = [...vectorAddFloatLazy([1.5, -2.25, 3.0, 0], [0.5, 2.25, -1.25, 4.75])]
			assert.deepEqual(result, [2, 0, 1.75, 4.75])
		})

		test('supports TypedArrays, Sets, generators, and custom iterables', () => {
			function* gen() {
				yield 10.5
				yield -4.5
				yield 0.25
			}
			const customIterable = {
				[Symbol.iterator]() {
					const values = [1.5, 4.5, 0.75]
					let i = 0
					return {
						next() {
							return i < values.length
								? { value: values[i++], done: false }
								: { value: undefined, done: true }
						}
					}
				}
			}

			assert.deepEqual(
				[...vectorAddFloatLazy(new Float64Array([1.25, 2.5, 3.75]), gen())],
				[11.75, -2, 4]
			)
			assert.deepEqual(
				[...vectorAddFloatLazy(new Set([1, 2, 3]), customIterable)],
				[2.5, 6.5, 3.75]
			)
			assert.deepEqual(
				[...vectorAddFloatLazy(new Int32Array([10, -20]), new Float32Array([0.5, 0.25]))],
				[10.5, -19.75]
			)
		})

		test('handles large vectors accurately', () => {
			const n = 10_000
			function* seqA() {
				for (let i = 0; i < n; i++) yield i * 0.5
			}
			function* seqB() {
				for (let i = 0; i < n; i++) yield n - i * 0.5
			}
			let count = 0
			for (const sum of vectorAddFloatLazy(seqA(), seqB())) {
				assert.equal(sum, n)
				count += 1
			}
			assert.equal(count, n)
		})
	})

	describe('edge cases', () => {
		test('handles empty iterables', () => {
			assert.deepEqual([...vectorAddFloatLazy([], [])], [])
			assert.deepEqual([...vectorAddFloatLazy(new Float64Array(0), new Set())], [])
		})

		test('handles single-element vectors', () => {
			assert.deepEqual([...vectorAddFloatLazy([42.5], [-0.5])], [42])
		})

		test('preserves IEEE-754 float64 special value semantics', () => {
			const a = [-0, -0, 0, Infinity, -Infinity, Infinity, NaN, Number.MIN_VALUE, Number.MAX_VALUE]
			const b = [-0, 0, -0, 1, -1, -Infinity, 5, Number.MIN_VALUE, Number.MAX_VALUE]
			const result = [...vectorAddFloatLazy(a, b)]

			assert.ok(Object.is(result[0], -0))
			assert.ok(Object.is(result[1], 0))
			assert.ok(Object.is(result[2], 0))
			assert.equal(result[3], Infinity)
			assert.equal(result[4], -Infinity)
			assert.ok(Number.isNaN(result[5]))
			assert.ok(Number.isNaN(result[6]))
			assert.equal(result[7], 2 * Number.MIN_VALUE)
			assert.equal(result[8], Infinity)
		})

		test('throws RangeError on length mismatch after yielding shared prefix', () => {
			const gen1 = vectorAddFloatLazy([1, 2], [10, 20, 30])
			assert.deepEqual(gen1.next(), { value: 11, done: false })
			assert.deepEqual(gen1.next(), { value: 22, done: false })
			assert.throws(() => gen1.next(), RangeError)

			const gen2 = vectorAddFloatLazy([1, 2, 3], [10])
			assert.deepEqual(gen2.next(), { value: 11, done: false })
			assert.throws(() => gen2.next(), RangeError)

			assert.throws(() => [...vectorAddFloatLazy([], [1])], RangeError)
			assert.throws(() => [...vectorAddFloatLazy([1], [])], RangeError)
		})
	})

	describe('input validation', () => {
		test('eagerly rejects non-iterable or string arguments with TypeError', () => {
			const invalidInputs = [null, undefined, 42, true, {}, Symbol('x'), '123', '']
			for (const bad of invalidInputs) {
				assert.throws(() => vectorAddFloatLazy(bad, [1]), TypeError)
				assert.throws(() => vectorAddFloatLazy([1], bad), TypeError)
			}
			assert.throws(() => vectorAddFloatLazy(), TypeError)
			assert.throws(() => vectorAddFloatLazy([1, 2]), TypeError)
		})

		test('rejects custom iterable whose Symbol.iterator does not return a valid iterator', () => {
			const badIterable = { [Symbol.iterator]: () => ({}) }
			const gen = vectorAddFloatLazy(badIterable, [1])
			assert.throws(() => gen.next(), TypeError)

			let closedA = false
			const goodIterable = {
				[Symbol.iterator]() {
					return {
						next: () => ({ value: 1, done: false }),
						return() {
							closedA = true
							return { value: undefined, done: true }
						}
					}
				}
			}
			const gen2 = vectorAddFloatLazy(goodIterable, badIterable)
			assert.throws(() => gen2.next(), TypeError)
			assert.equal(closedA, true)
		})

		test('lazily rejects non-number elements with TypeError at the offending index', () => {
			const badValues = ['1', null, undefined, 1n, {}, true, [1]]
			for (const bad of badValues) {
				const genA = vectorAddFloatLazy([1, bad, 3], [10, 20, 30])
				assert.deepEqual(genA.next(), { value: 11, done: false })
				assert.throws(() => genA.next(), TypeError)

				const genB = vectorAddFloatLazy([1, 2, 3], [10, bad, 30])
				assert.deepEqual(genB.next(), { value: 11, done: false })
				assert.throws(() => genB.next(), TypeError)
			}
		})
	})

	describe('lazy streaming behavior', () => {
		test('consumes source iterables strictly one element pair per step', () => {
			let pullsA = 0
			let pullsB = 0

			function* trackedA() {
				for (const x of [10, 20, 30, 40]) {
					pullsA += 1
					yield x
				}
			}
			function* trackedB() {
				for (const x of [1, 2, 3, 4]) {
					pullsB += 1
					yield x
				}
			}

			const stream = vectorAddFloatLazy(trackedA(), trackedB())
			assert.equal(pullsA, 0)
			assert.equal(pullsB, 0)

			assert.deepEqual(stream.next(), { value: 11, done: false })
			assert.equal(pullsA, 1)
			assert.equal(pullsB, 1)

			assert.deepEqual(stream.next(), { value: 22, done: false })
			assert.equal(pullsA, 2)
			assert.equal(pullsB, 2)

			stream.return()
			assert.equal(pullsA, 2)
			assert.equal(pullsB, 2)
		})

		test('streams over infinite generators and closes them on early termination', () => {
			let closedA = false
			let closedB = false

			function* naturals() {
				try {
					let i = 1
					while (true) {
						yield i++
					}
				} finally {
					closedA = true
				}
			}

			function* halves() {
				try {
					let i = 0.5
					while (true) {
						yield i
						i += 0.5
					}
				} finally {
					closedB = true
				}
			}

			const taken = []
			for (const value of vectorAddFloatLazy(naturals(), halves())) {
				taken.push(value)
				if (taken.length === 5) {
					break
				}
			}

			assert.deepEqual(taken, [1.5, 3, 4.5, 6, 7.5])
			assert.equal(closedA, true)
			assert.equal(closedB, true)
		})

		test('closes open source iterators on length mismatch or element validation error', () => {
			let closedLonger = false
			function* longer() {
				try {
					yield 1
					yield 2
					yield 3
				} finally {
					closedLonger = true
				}
			}

			assert.throws(() => [...vectorAddFloatLazy([10], longer())], RangeError)
			assert.equal(closedLonger, true)

			let closedOnTypeErrA = false
			let closedOnTypeErrB = false
			function* badStream() {
				try {
					yield 1
					yield 'not-a-number'
					yield 3
				} finally {
					closedOnTypeErrA = true
				}
			}
			function* goodStream() {
				try {
					yield 10
					yield 20
					yield 30
				} finally {
					closedOnTypeErrB = true
				}
			}

			assert.throws(() => [...vectorAddFloatLazy(badStream(), goodStream())], TypeError)
			assert.equal(closedOnTypeErrA, true)
			assert.equal(closedOnTypeErrB, true)
		})
	})

	describe('independent cross-checks', () => {
		// Deterministic PRNG (Mulberry32) for reproducible float64 test vectors
		function makePrng(seed) {
			let s = seed >>> 0
			return () => {
				s = (s + 0x6d2b79f5) >>> 0
				let t = Math.imul(s ^ (s >>> 15), 1 | s)
				t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296
			}
		}

		test('matches eager reference implementation bit-for-bit across random float64 vectors', () => {
			const rand = makePrng(20261123)
			const lengths = [0, 1, 2, 7, 64, 513]

			for (const len of lengths) {
				const a = Array.from({ length: len }, () => (rand() - 0.5) * 1e6)
				const b = Array.from({ length: len }, () => (rand() - 0.5) * 1e6)
				const expected = a.map((x, i) => x + b[i])
				const actual = [...vectorAddFloatLazy(a, b)]

				assert.equal(actual.length, expected.length)
				for (let i = 0; i < len; i++) {
					assert.ok(Object.is(actual[i], expected[i]), `mismatch at index ${i}`)
				}
			}
		})

		test('satisfies vector space identities (commutativity, identity, inverse, dot-product linearity)', () => {
			const rand = makePrng(987654321)
			const n = 200
			const a = Array.from({ length: n }, () => (rand() - 0.5) * 100)
			const b = Array.from({ length: n }, () => (rand() - 0.5) * 100)
			const c = Array.from({ length: n }, () => (rand() - 0.5) * 100)
			const zeros = new Float64Array(n)
			const negA = a.map((x) => -x)

			// Commutativity: a + b === b + a (exact in IEEE-754 float64)
			assert.deepEqual([...vectorAddFloatLazy(a, b)], [...vectorAddFloatLazy(b, a)])

			// Additive identity: a + 0 === a
			assert.deepEqual([...vectorAddFloatLazy(a, zeros)], a)

			// Additive inverse: a + (-a) === 0
			for (const v of vectorAddFloatLazy(a, negA)) {
				assert.equal(v, 0)
			}

			// Dot-product linearity: (a + b) · c ≈ (a · c) + (b · c)
			const dot = (u, v) => u.reduce((acc, x, i) => acc + x * v[i], 0)
			const lhs = dot([...vectorAddFloatLazy(a, b)], c)
			const rhs = dot(a, c) + dot(b, c)
			assert.ok(Math.abs(lhs - rhs) <= 1e-9 * (Math.abs(lhs) + Math.abs(rhs) + 1))
		})
	})
})
