import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinTypedLazy } from './arcsinTypedLazy.js'

const TOLERANCE = 1e-12

function assertClose(actual, expected, tol = TOLERANCE, message) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		message ?? `expected ${actual} to be within ${tol} of ${expected}`
	)
}

/**
 * Independent Maclaurin series approximation for arcsin(x) on |x| < 1:
 *   arcsin(x) = sum_{n=0..∞} ((2n)! / (4^n * (n!)^2 * (2n+1))) * x^(2n+1)
 * Uses iterative term recurrence without calling Math.asin.
 */
function arcsinTaylor(x, maxTerms = 120) {
	let term = x
	let sum = x
	const x2 = x * x
	for (let n = 0; n < maxTerms; n++) {
		const num = (2 * n + 1) * (2 * n + 1)
		const den = (2 * n + 2) * (2 * n + 3)
		term *= (num / den) * x2
		sum += term
		if (Math.abs(term) <= Number.EPSILON * Math.abs(sum)) {
			break
		}
	}
	return sum
}

describe('arcsinTypedLazy', () => {
	test('computes arcsin element-wise for standard Float64Array values', () => {
		const input = new Float64Array([
			-Math.sqrt(3) / 2,
			-Math.SQRT1_2,
			-0.5,
			0,
			0.5,
			Math.SQRT1_2,
			Math.sqrt(3) / 2
		])
		const expected = [
			-Math.PI / 3,
			-Math.PI / 4,
			-Math.PI / 6,
			0,
			Math.PI / 6,
			Math.PI / 4,
			Math.PI / 3
		]

		const result = Float64Array.from(arcsinTypedLazy(input))
		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, expected.length)
		for (let i = 0; i < expected.length; i++) {
			assertClose(result[i], expected[i])
		}
	})

	test('handles Float64Array subarrays with non-zero byteOffset', () => {
		const backing = new Float64Array([2, -0.5, 0, 0.5, -2])
		const view = backing.subarray(1, 4)
		const result = [...arcsinTypedLazy(view)]
		assert.equal(result.length, 3)
		assertClose(result[0], -Math.PI / 6)
		assert.equal(result[1], 0)
		assertClose(result[2], Math.PI / 6)
	})

	test('handles boundary and special domain edge cases (-1, -0, +0, 1, subnormals)', () => {
		const input = new Float64Array([-1, -0, 0, 1, 1e-12, -1e-12, Number.MIN_VALUE])
		const result = [...arcsinTypedLazy(input)]

		assertClose(result[0], -Math.PI / 2, 1e-15)
		assert.ok(Object.is(result[1], -0), 'expected -0 to be preserved')
		assert.ok(Object.is(result[2], 0), 'expected +0 to be preserved')
		assertClose(result[3], Math.PI / 2, 1e-15)
		assertClose(result[4], 1e-12, 1e-24)
		assertClose(result[5], -1e-12, 1e-24)
		assert.equal(result[6], Number.MIN_VALUE)
	})

	test('returns NaN for out-of-domain values and NaN', () => {
		const input = new Float64Array([
			-1 - Number.EPSILON,
			1 + Number.EPSILON,
			-2,
			2,
			-Infinity,
			Infinity,
			NaN
		])
		const result = [...arcsinTypedLazy(input)]
		assert.equal(result.length, input.length)
		for (let i = 0; i < result.length; i++) {
			assert.ok(Number.isNaN(result[i]), `expected NaN at index ${i} for input ${input[i]}`)
		}
	})

	test('handles empty Float64Array and empty iterables', () => {
		assert.deepEqual([...arcsinTypedLazy(new Float64Array(0))], [])
		assert.deepEqual([...arcsinTypedLazy([])], [])

		function* emptyChunks() {
			yield new Float64Array(0)
			yield new Float64Array(0)
		}
		assert.deepEqual([...arcsinTypedLazy(emptyChunks())], [])
	})

	test('streams lazily over an iterable of numbers without over-consuming upstream', () => {
		let pulled = 0
		let closed = false

		function* source() {
			const values = [0, 0.5, 1, -0.5, -1]
			try {
				for (const v of values) {
					pulled++
					yield v
				}
			} finally {
				closed = true
			}
		}

		const gen = arcsinTypedLazy(source())
		assert.equal(pulled, 0, 'must not pull before first .next()')

		const first = gen.next()
		assert.equal(first.done, false)
		assert.equal(first.value, 0)
		assert.equal(pulled, 1)

		const second = gen.next()
		assert.equal(second.done, false)
		assertClose(second.value, Math.PI / 6)
		assert.equal(pulled, 2)

		gen.return()
		assert.equal(pulled, 2, 'must not pull additional elements on early termination')
		assert.equal(closed, true, 'must close upstream generator on early termination')
	})

	test('streams lazily over an iterable of Float64Array chunks', () => {
		let chunksPulled = 0
		function* chunkStream() {
			chunksPulled++
			yield new Float64Array([0, 0.5])
			chunksPulled++
			yield new Float64Array([1, -1])
			chunksPulled++
			yield new Float64Array([-0.5])
		}

		const gen = arcsinTypedLazy(chunkStream())
		assert.equal(chunksPulled, 0)

		assert.equal(gen.next().value, 0)
		assert.equal(chunksPulled, 1)

		assertClose(gen.next().value, Math.PI / 6)
		assert.equal(chunksPulled, 1, 'second chunk must not be pulled while first still has items')

		assertClose(gen.next().value, Math.PI / 2)
		assert.equal(chunksPulled, 2)

		// Stop early via for..of break
		const rest = []
		for (const val of gen) {
			rest.push(val)
			break
		}
		assert.equal(rest.length, 1)
		assertClose(rest[0], -Math.PI / 2)
		assert.equal(chunksPulled, 2, 'third chunk must never be pulled')
	})

	test('supports infinite lazy generators with early break', () => {
		function* infiniteOscillator() {
			let k = 0
			while (true) {
				yield Math.sin((k * Math.PI) / 6)
				k++
			}
		}

		const taken = []
		for (const val of arcsinTypedLazy(infiniteOscillator())) {
			taken.push(val)
			if (taken.length === 4) break
		}

		assert.equal(taken.length, 4)
		assertClose(taken[0], 0)
		assertClose(taken[1], Math.PI / 6)
		assertClose(taken[2], Math.PI / 3)
		assertClose(taken[3], Math.PI / 2)
	})

	test('validates invalid top-level inputs eagerly', () => {
		const invalidInputs = [
			null,
			undefined,
			0.5,
			true,
			false,
			Symbol('x'),
			{},
			'0.5',
			new String('0.5'),
			new Int32Array([0, 1]),
			new Float32Array([0, 0.5]),
			new Uint8Array([0, 1]),
			new BigInt64Array([0n]),
			new DataView(new ArrayBuffer(8))
		]

		for (const bad of invalidInputs) {
			assert.throws(
				() => arcsinTypedLazy(bad),
				{ name: 'TypeError' },
				`expected TypeError for invalid input: ${String(bad)}`
			)
		}
	})

	test('validates invalid elements yielded from an iterable', () => {
		const badElements = ['0.5', null, undefined, {}, true, 1n, new Int32Array([0]), new Float32Array([0])]

		for (const bad of badElements) {
			const gen = arcsinTypedLazy([0, bad])
			assert.equal(gen.next().value, 0, 'valid preceding element should yield before error')
			assert.throws(() => gen.next(), { name: 'TypeError' })
		}
	})

	test('independent cross-checks: sin(arcsin(x)) == x, atan2 identity, symmetry, and Taylor series', () => {
		const samples = new Float64Array(41)
		for (let i = 0; i <= 40; i++) {
			samples[i] = -1 + (2 * i) / 40
		}

		const results = Float64Array.from(arcsinTypedLazy(samples))

		for (let i = 0; i < samples.length; i++) {
			const x = samples[i]
			const y = results[i]

			// 1. Inverse identity: sin(arcsin(x)) === x
			assertClose(Math.sin(y), x, 1e-14, `sin(arcsin(${x})) != ${x}`)

			// 2. Range check: arcsin(x) in [-pi/2, pi/2]
			assert.ok(y >= -Math.PI / 2 && y <= Math.PI / 2)

			// 3. Independent arctangent identity: arcsin(x) === atan2(x, sqrt(1 - x^2))
			const viaAtan2 = Math.atan2(x, Math.sqrt(Math.max(0, 1 - x * x)))
			assertClose(y, viaAtan2, 1e-14, `atan2 cross-check failed at x=${x}`)

			// 4. Complementary angle identity: arcsin(x) + arccos(x) === pi/2
			assertClose(y + Math.acos(x), Math.PI / 2, 1e-14, `acos cross-check failed at x=${x}`)

			// 5. Independent Taylor series cross-check on |x| <= 0.75
			if (Math.abs(x) <= 0.75) {
				assertClose(y, arcsinTaylor(x), 1e-12, `Taylor series cross-check failed at x=${x}`)
			}
		}

		// 6. Odd-function symmetry: arcsin(-x) === -arcsin(x)
		for (let i = 0; i < samples.length; i++) {
			const mirror = samples.length - 1 - i
			assertClose(results[i], -results[mirror], 1e-15)
		}
	})
})
