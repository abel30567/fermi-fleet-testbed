import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddTypedLazy } from './vectorAddTypedLazy.js'

/**
 * Independent reference implementation for cross-checking element-wise addition.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function referenceVectorAdd(a, b) {
	assert.equal(a.length, b.length)
	const out = new Float64Array(a.length)
	for (let i = 0; i < a.length; i += 1) {
		out[i] = a[i] + b[i]
	}
	return out
}

/**
 * Deterministic LCG PRNG for reproducible cross-check vectors.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return (state / 0x100000000) * 2000 - 1000
	}
}

describe('vectorAddTypedLazy', () => {
	describe('normal cases', () => {
		test('adds two Float64Array vectors element-wise', () => {
			const a = new Float64Array([1.5, -2.25, 0, 100.125])
			const b = new Float64Array([2.5, 4.75, -0, -0.125])

			const result = Float64Array.from(vectorAddTypedLazy(a, b))
			assert.deepEqual(result, new Float64Array([4, 2.5, 0, 100]))
		})

		test('returns a standard generator object', () => {
			const gen = vectorAddTypedLazy(
				new Float64Array([1, 2]),
				new Float64Array([3, 4])
			)
			assert.equal(typeof gen.next, 'function')
			assert.equal(typeof gen.return, 'function')
			assert.equal(typeof gen.throw, 'function')
			assert.equal(gen[Symbol.iterator](), gen)
			assert.deepEqual(gen.next(), { value: 4, done: false })
			assert.deepEqual(gen.next(), { value: 6, done: false })
			assert.deepEqual(gen.next(), { value: undefined, done: true })
		})

		test('supports mixed Float64Array and generator inputs', () => {
			function* genValues() {
				yield 10
				yield 20
				yield 30
			}

			const typed = new Float64Array([1, 2, 3])
			assert.deepEqual(
				Float64Array.from(vectorAddTypedLazy(typed, genValues())),
				new Float64Array([11, 22, 33])
			)
			assert.deepEqual(
				Float64Array.from(vectorAddTypedLazy(genValues(), typed)),
				new Float64Array([11, 22, 33])
			)
		})

		test('composes lazily across chained calls', () => {
			const a = new Float64Array([1, 2, 3, 4])
			const b = new Float64Array([10, 20, 30, 40])
			const c = new Float64Array([100, 200, 300, 400])

			const chained = vectorAddTypedLazy(vectorAddTypedLazy(a, b), c)
			assert.deepEqual(
				Float64Array.from(chained),
				new Float64Array([111, 222, 333, 444])
			)
		})

		test('supports custom synchronous iterable objects', () => {
			const customA = {
				*[Symbol.iterator]() {
					yield 0.5
					yield -1.5
				},
			}
			const customB = {
				*[Symbol.iterator]() {
					yield 1.5
					yield 4.5
				},
			}

			assert.deepEqual([...vectorAddTypedLazy(customA, customB)], [2, 3])
		})
	})

	describe('edge cases', () => {
		test('handles empty Float64Array vectors', () => {
			const emptyA = new Float64Array(0)
			const emptyB = new Float64Array(0)

			const result = Float64Array.from(vectorAddTypedLazy(emptyA, emptyB))
			assert.equal(result.length, 0)
			assert.deepEqual(result, new Float64Array(0))
		})

		test('handles empty generators', () => {
			function* empty() {}

			assert.deepEqual([...vectorAddTypedLazy(empty(), empty())], [])
		})

		test('handles single-element vectors and signed zero', () => {
			const negZero = Float64Array.from(
				vectorAddTypedLazy(new Float64Array([-0]), new Float64Array([-0]))
			)
			assert.equal(Object.is(negZero[0], -0), true)

			const posZero = Float64Array.from(
				vectorAddTypedLazy(new Float64Array([0]), new Float64Array([-0]))
			)
			assert.equal(Object.is(posZero[0], 0), true)
		})

		test('throws RangeError eagerly for mismatched Float64Array dimensions', () => {
			assert.throws(
				() =>
					vectorAddTypedLazy(
						new Float64Array([1, 2]),
						new Float64Array([1, 2, 3])
					),
				RangeError
			)

			assert.throws(
				() =>
					vectorAddTypedLazy(new Float64Array(0), new Float64Array([1])),
				RangeError
			)
		})

		test('throws RangeError when lazy iterables have mismatched lengths', () => {
			function* seq(values) {
				for (const v of values) {
					yield v
				}
			}

			assert.throws(
				() => [...vectorAddTypedLazy(seq([1, 2]), seq([10, 20, 30]))],
				RangeError
			)

			assert.throws(
				() => [...vectorAddTypedLazy(seq([1, 2, 3]), seq([10]))],
				RangeError
			)

			assert.throws(
				() => [...vectorAddTypedLazy(new Float64Array([1, 2]), seq([10]))],
				RangeError
			)
		})
	})

	describe('lazy and streaming behavior', () => {
		test('consumes elements strictly on demand (one pull per next)', () => {
			let pullsA = 0
			let pullsB = 0

			function* trackedA() {
				for (let i = 1; i <= 5; i += 1) {
					pullsA += 1
					yield i
				}
			}

			function* trackedB() {
				for (let i = 10; i <= 50; i += 10) {
					pullsB += 1
					yield i
				}
			}

			const stream = vectorAddTypedLazy(trackedA(), trackedB())
			assert.equal(pullsA, 0)
			assert.equal(pullsB, 0)

			assert.deepEqual(stream.next(), { value: 11, done: false })
			assert.equal(pullsA, 1)
			assert.equal(pullsB, 1)

			assert.deepEqual(stream.next(), { value: 22, done: false })
			assert.equal(pullsA, 2)
			assert.equal(pullsB, 2)

			stream.return()
		})

		test('supports partial consumption of infinite generators and runs cleanup', () => {
			let closedA = false
			let closedB = false

			function* naturals() {
				try {
					let n = 1
					while (true) {
						yield n
						n += 1
					}
				} finally {
					closedA = true
				}
			}

			function* multiplesOfTen() {
				try {
					let n = 10
					while (true) {
						yield n
						n += 10
					}
				} finally {
					closedB = true
				}
			}

			const prefix = []
			for (const sum of vectorAddTypedLazy(naturals(), multiplesOfTen())) {
				prefix.push(sum)
				if (prefix.length === 4) {
					break
				}
			}

			assert.deepEqual(prefix, [11, 22, 33, 44])
			assert.equal(closedA, true)
			assert.equal(closedB, true)
		})

		test('validates elements lazily during consumption', () => {
			const a = new Float64Array([1, 2, Number.NaN, 4])
			const b = new Float64Array([10, 20, 30, 40])

			const stream = vectorAddTypedLazy(a, b)
			assert.deepEqual(stream.next(), { value: 11, done: false })
			assert.deepEqual(stream.next(), { value: 22, done: false })
			assert.throws(() => stream.next(), RangeError)
		})
	})

	describe('input validation', () => {
		test('rejects invalid container types eagerly with TypeError', () => {
			const valid = new Float64Array([1, 2])
			const invalidInputs = [
				null,
				undefined,
				42,
				true,
				'12',
				new String('12'),
				{},
				() => {},
				new Map([
					[0, 1],
					[1, 2],
				]),
			]

			for (const bad of invalidInputs) {
				assert.throws(() => vectorAddTypedLazy(bad, valid), TypeError)
				assert.throws(() => vectorAddTypedLazy(valid, bad), TypeError)
			}
		})

		test('rejects non-Float64Array TypedArrays and DataView eagerly', () => {
			const valid = new Float64Array([1, 2])
			const wrongViews = [
				new Int32Array([1, 2]),
				new Float32Array([1, 2]),
				new Uint8Array([1, 2]),
				new BigInt64Array([1n, 2n]),
				new DataView(new ArrayBuffer(16)),
			]

			for (const view of wrongViews) {
				assert.throws(() => vectorAddTypedLazy(view, valid), TypeError)
				assert.throws(() => vectorAddTypedLazy(valid, view), TypeError)
			}
		})

		test('rejects non-number elements yielded by iterables with TypeError', () => {
			function* badElements() {
				yield 1
				yield '2'
			}

			assert.throws(
				() => [...vectorAddTypedLazy(badElements(), new Float64Array([3, 4]))],
				TypeError
			)
			assert.throws(
				() => [...vectorAddTypedLazy(new Float64Array([3, 4]), badElements())],
				TypeError
			)
		})

		test('rejects non-finite numbers (NaN, Infinity, -Infinity) with RangeError', () => {
			for (const badVal of [
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY,
			]) {
				assert.throws(
					() =>
						Float64Array.from(
							vectorAddTypedLazy(
								new Float64Array([badVal]),
								new Float64Array([1])
							)
						),
					RangeError
				)
				assert.throws(
					() =>
						Float64Array.from(
							vectorAddTypedLazy(
								new Float64Array([1]),
								new Float64Array([badVal])
							)
						),
					RangeError
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches independent loop reference across varied sizes and PRNG data', () => {
			const rand = createRng(0x5eed1234)

			for (const size of [0, 1, 7, 64, 512]) {
				const a = new Float64Array(size)
				const b = new Float64Array(size)
				for (let i = 0; i < size; i += 1) {
					a[i] = rand()
					b[i] = rand()
				}

				const expected = referenceVectorAdd(a, b)
				const actualTyped = Float64Array.from(vectorAddTypedLazy(a, b))
				const actualGen = Float64Array.from(
					vectorAddTypedLazy(a.values(), b.values())
				)

				assert.equal(actualTyped.length, expected.length)
				assert.equal(actualGen.length, expected.length)
				for (let i = 0; i < size; i += 1) {
					assert.equal(Object.is(actualTyped[i], expected[i]), true)
					assert.equal(Object.is(actualGen[i], expected[i]), true)
				}
			}
		})

		test('satisfies algebraic vector addition laws (commutativity, identity, inverse, associativity)', () => {
			const a = new Float64Array([12, -7, 0, 42, -100])
			const b = new Float64Array([-5, 19, 8, -42, 25])
			const c = new Float64Array([3, 11, -8, 17, 75])
			const zeros = new Float64Array(a.length)
			const negA = new Float64Array(a.map((x) => -x))

			// Commutativity: a + b === b + a
			assert.deepEqual(
				Float64Array.from(vectorAddTypedLazy(a, b)),
				Float64Array.from(vectorAddTypedLazy(b, a))
			)

			// Identity: a + 0 === a
			assert.deepEqual(Float64Array.from(vectorAddTypedLazy(a, zeros)), a)

			// Inverse: a + (-a) === 0
			assert.deepEqual(Float64Array.from(vectorAddTypedLazy(a, negA)), zeros)

			// Associativity (exact integer float64 values): (a + b) + c === a + (b + c)
			assert.deepEqual(
				Float64Array.from(vectorAddTypedLazy(vectorAddTypedLazy(a, b), c)),
				Float64Array.from(vectorAddTypedLazy(a, vectorAddTypedLazy(b, c)))
			)
		})
	})
})
