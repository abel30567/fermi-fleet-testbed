import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arccosTypedLazy } from './arccosTypedLazy.js'

const EPSILON = 1e-12

function assertClose(actual, expected, tol = EPSILON, message) {
	assert.equal(typeof actual, 'number', message)
	assert.ok(
		Math.abs(actual - expected) <= tol,
		message ?? `expected ${actual} to be within ${tol} of ${expected}`,
	)
}

describe('arccosTypedLazy', () => {
	describe('normal cases', () => {
		it('computes exact known angles over a Float64Array', () => {
			const input = new Float64Array([
				1,
				Math.SQRT1_2,
				0.5,
				0,
				-0.5,
				-Math.SQRT1_2,
				-1,
			])
			const expected = [
				0,
				Math.PI / 4,
				Math.PI / 3,
				Math.PI / 2,
				(2 * Math.PI) / 3,
				(3 * Math.PI) / 4,
				Math.PI,
			]

			const result = Array.from(arccosTypedLazy(input))
			assert.equal(result.length, expected.length)
			for (let i = 0; i < expected.length; i += 1) {
				assertClose(result[i], expected[i])
			}
		})

		it('computes element-wise arccos over an iterable sequence of Float64Array chunks', () => {
			const chunks = [
				new Float64Array([1, Math.sqrt(3) / 2]),
				new Float64Array([0]),
				new Float64Array([-Math.sqrt(3) / 2, -1]),
			]
			const expected = [
				0,
				Math.PI / 6,
				Math.PI / 2,
				(5 * Math.PI) / 6,
				Math.PI,
			]

			const result = Float64Array.from(arccosTypedLazy(chunks))
			assert.equal(result.length, expected.length)
			for (let i = 0; i < expected.length; i += 1) {
				assertClose(result[i], expected[i])
			}
		})

		it('works with Float64Array subarrays and does not mutate input', () => {
			const backing = new Float64Array([99, 1, 0, -1, -99])
			const view = backing.subarray(1, 4)
			const snapshot = Array.from(backing)

			const result = Array.from(arccosTypedLazy(view))
			assert.equal(result.length, 3)
			assertClose(result[0], 0)
			assertClose(result[1], Math.PI / 2)
			assertClose(result[2], Math.PI)
			assert.deepEqual(Array.from(backing), snapshot)
		})
	})

	describe('edge cases', () => {
		it('handles boundary values -1, -0, 0, and 1', () => {
			const input = new Float64Array([-1, -0, 0, 1])
			const result = Array.from(arccosTypedLazy(input))

			assert.equal(result[0], Math.PI)
			assert.equal(result[1], Math.PI / 2)
			assert.equal(result[2], Math.PI / 2)
			assert.ok(Object.is(result[3], 0))
		})

		it('yields NaN for out-of-domain values and NaN without throwing', () => {
			const input = new Float64Array([
				-Infinity,
				-2,
				-1 - Number.EPSILON,
				1 + Number.EPSILON,
				2,
				Infinity,
				Number.NaN,
			])
			const result = Array.from(arccosTypedLazy(input))

			assert.equal(result.length, input.length)
			for (const value of result) {
				assert.ok(Number.isNaN(value), `expected NaN, got ${value}`)
			}
		})

		it('handles empty Float64Array, empty iterable, and empty chunks', () => {
			assert.deepEqual(Array.from(arccosTypedLazy(new Float64Array(0))), [])
			assert.deepEqual(Array.from(arccosTypedLazy([])), [])
			const mixed = [
				new Float64Array(0),
				new Float64Array([1]),
				new Float64Array(0),
				new Float64Array([-1]),
				new Float64Array(0),
			]
			assert.deepEqual(Array.from(arccosTypedLazy(mixed)), [0, Math.PI])
		})
	})

	describe('lazy and streaming behavior', () => {
		it('does not pull from an upstream generator until iterated', () => {
			let pulled = 0
			function* source() {
				pulled += 1
				yield new Float64Array([1, 0])
				pulled += 1
				yield new Float64Array([-1])
			}

			const iter = arccosTypedLazy(source())
			assert.equal(pulled, 0)

			const first = iter.next()
			assert.equal(pulled, 1)
			assert.equal(first.done, false)
			assert.equal(first.value, 0)

			const second = iter.next()
			assert.equal(pulled, 1)
			assert.equal(second.done, false)
			assertClose(second.value, Math.PI / 2)

			const third = iter.next()
			assert.equal(pulled, 2)
			assert.equal(third.done, false)
			assertClose(third.value, Math.PI)

			const end = iter.next()
			assert.equal(end.done, true)
		})

		it('supports early termination and closes upstream generators cleanly', () => {
			let closed = false
			let chunksProduced = 0

			function* infiniteSource() {
				try {
					while (true) {
						chunksProduced += 1
						yield new Float64Array([1, 0, -1])
					}
				} finally {
					closed = true
				}
			}

			const taken = []
			for (const value of arccosTypedLazy(infiniteSource())) {
				taken.push(value)
				if (taken.length === 4) break
			}

			assert.equal(taken.length, 4)
			assert.equal(chunksProduced, 2)
			assert.equal(closed, true)
			assertClose(taken[0], 0)
			assertClose(taken[1], Math.PI / 2)
			assertClose(taken[2], Math.PI)
			assertClose(taken[3], 0)
		})

		it('returns a generator supporting manual next() and return()', () => {
			const gen = arccosTypedLazy(new Float64Array([1, 0.5, 0, -1]))
			assert.equal(typeof gen.next, 'function')
			assert.equal(typeof gen.return, 'function')
			assert.equal(typeof gen[Symbol.iterator], 'function')
			assert.equal(gen[Symbol.iterator](), gen)

			assert.equal(gen.next().value, 0)
			assert.deepEqual(gen.return(), { value: undefined, done: true })
			assert.deepEqual(gen.next(), { value: undefined, done: true })
		})
	})

	describe('input validation', () => {
		it('rejects null, undefined, primitives, plain objects, and non-Float64Array views synchronously', () => {
			const invalidInputs = [
				null,
				undefined,
				0,
				1,
				'123',
				true,
				Symbol('x'),
				{},
				() => {},
				new ArrayBuffer(16),
				new DataView(new ArrayBuffer(16)),
				new Float32Array([0, 1]),
				new Int32Array([0, 1]),
				new Uint8Array([0, 1]),
				new BigInt64Array([0n, 1n]),
			]

			for (const bad of invalidInputs) {
				assert.throws(() => arccosTypedLazy(bad), TypeError)
			}
		})

		it('rejects iterables containing non-Float64Array elements lazily when reached', () => {
			assert.throws(() => Array.from(arccosTypedLazy([0, 1])), TypeError)
			assert.throws(
				() =>
					Array.from(
						arccosTypedLazy([new Float64Array([1]), new Float32Array([0])]),
					),
				TypeError,
			)

			function* badSecondChunk() {
				yield new Float64Array([1])
				yield 'not-a-float64array'
			}

			const iter = arccosTypedLazy(badSecondChunk())
			assert.equal(iter.next().value, 0)
			assert.throws(() => iter.next(), TypeError)
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('satisfies cos(arccos(x)) == x, arccos(x) == atan2(sqrt(1-x^2), x), and arccos(-x) + arccos(x) == pi', () => {
			const samples = new Float64Array(41)
			for (let i = 0; i < samples.length; i += 1) {
				samples[i] = -1 + (2 * i) / (samples.length - 1)
			}

			const results = Array.from(arccosTypedLazy(samples))
			const negatedResults = Array.from(
				arccosTypedLazy(samples.map((x) => -x)),
			)

			assert.equal(results.length, samples.length)
			for (let i = 0; i < samples.length; i += 1) {
				const x = samples[i]
				const y = results[i]

				// Range check: [0, pi]
				assert.ok(y >= 0 && y <= Math.PI, `out of range: ${y}`)

				// Inverse check: cos(arccos(x)) === x
				assertClose(Math.cos(y), x, 1e-12)

				// Independent formula cross-check: atan2(sqrt(1 - x^2), x)
				const viaAtan2 = Math.atan2(Math.sqrt(Math.max(0, 1 - x * x)), x)
				assertClose(y, viaAtan2, 1e-12)

				// Symmetry identity: arccos(x) + arccos(-x) === pi
				assertClose(y + negatedResults[i], Math.PI, 1e-12)
			}
		})
	})
})
