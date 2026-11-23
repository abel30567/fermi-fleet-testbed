import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tanTypedLazy } from './tanTypedLazy.js'

/**
 * Asserts two finite floating-point numbers are within `tol` of each other.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-12]
 */
function assertClose(actual, expected, tol = 1e-12) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`Expected ${actual} to be within ${tol} of ${expected} (diff: ${Math.abs(actual - expected)})`
	)
}

describe('tanTypedLazy', () => {
	test('computes element-wise tan over a Float64Array', () => {
		const input = new Float64Array([
			0,
			Math.PI / 6,
			Math.PI / 4,
			Math.PI / 3,
			1.0
		])
		const results = [...tanTypedLazy(input)]

		assert.equal(results.length, input.length)
		assert.equal(results[0], 0)
		assertClose(results[1], 1 / Math.sqrt(3))
		assertClose(results[2], 1)
		assertClose(results[3], Math.sqrt(3))
		assertClose(results[4], Math.tan(1.0))
	})

	test('handles edge cases: 0, -0, pi/4, negative angles, and pi multiples', () => {
		const input = new Float64Array([
			0,
			-0,
			Math.PI / 4,
			-Math.PI / 4,
			-Math.PI / 3,
			-Math.PI / 6,
			Math.PI,
			-Math.PI,
			-1.25
		])
		const results = [...tanTypedLazy(input)]

		assert.ok(Object.is(results[0], 0), 'tan(+0) should be +0')
		assert.ok(Object.is(results[1], -0), 'tan(-0) should be -0')
		assertClose(results[2], 1)
		assertClose(results[3], -1)
		assertClose(results[4], -Math.sqrt(3))
		assertClose(results[5], -1 / Math.sqrt(3))
		assertClose(results[6], 0)
		assertClose(results[7], 0)
		assertClose(results[8], -Math.tan(1.25))
	})

	test('handles IEEE 754 special values (NaN, Infinity, -Infinity)', () => {
		const input = new Float64Array([NaN, Infinity, -Infinity])
		const results = [...tanTypedLazy(input)]

		assert.equal(results.length, 3)
		assert.ok(Number.isNaN(results[0]))
		assert.ok(Number.isNaN(results[1]))
		assert.ok(Number.isNaN(results[2]))
	})

	test('handles empty Float64Array and Float64Array subarray views', () => {
		assert.deepEqual([...tanTypedLazy(new Float64Array(0))], [])

		const backing = new Float64Array([10, 0, Math.PI / 4, -Math.PI / 4, 20])
		const view = backing.subarray(1, 4)
		const results = [...tanTypedLazy(view)]

		assert.equal(results.length, 3)
		assert.equal(results[0], 0)
		assertClose(results[1], 1)
		assertClose(results[2], -1)
	})

	test('streams across an iterable of Float64Array chunks including empty chunks', () => {
		const chunks = [
			new Float64Array(0),
			new Float64Array([0, Math.PI / 4]),
			new Float64Array(0),
			new Float64Array([-Math.PI / 4])
		]
		const results = Float64Array.from(tanTypedLazy(chunks))

		assert.equal(results.length, 3)
		assert.equal(results[0], 0)
		assertClose(results[1], 1)
		assertClose(results[2], -1)
		assert.deepEqual([...tanTypedLazy([])], [])
	})

	test('consumes iterable sequences lazily on demand and supports infinite streams', () => {
		let chunksPulled = 0
		let cleanedUp = false

		function* infiniteChunks() {
			try {
				let step = 0
				while (true) {
					chunksPulled++
					yield new Float64Array([step * 0.1, (step + 0.5) * 0.1])
					step++
				}
			} finally {
				cleanedUp = true
			}
		}

		const gen = tanTypedLazy(infiniteChunks())
		assert.equal(chunksPulled, 0, 'should not pull any chunk before iteration begins')

		const first = gen.next()
		assert.equal(first.done, false)
		assert.equal(first.value, 0)
		assert.equal(chunksPulled, 1, 'should pull only the first chunk for first element')

		const second = gen.next()
		assert.equal(second.done, false)
		assertClose(second.value, Math.tan(0.05))
		assert.equal(chunksPulled, 1, 'should still only have pulled one chunk for second element')

		const third = gen.next()
		assert.equal(third.done, false)
		assertClose(third.value, Math.tan(0.1))
		assert.equal(chunksPulled, 2, 'should pull second chunk only after first chunk is exhausted')

		gen.return()
		assert.equal(cleanedUp, true, 'should close underlying source generator on early termination')
	})

	test('early break in for..of stops consuming source iterable and runs cleanup', () => {
		let chunksPulled = 0
		let closed = false

		function* source() {
			try {
				for (let i = 0; i < 100; i++) {
					chunksPulled++
					yield new Float64Array([0, Math.PI / 4])
				}
			} finally {
				closed = true
			}
		}

		const collected = []
		for (const val of tanTypedLazy(source())) {
			collected.push(val)
			if (collected.length === 3) break
		}

		assert.equal(collected.length, 3)
		assert.equal(chunksPulled, 2)
		assert.equal(closed, true)
	})

	test('rejects invalid top-level inputs synchronously with TypeError', () => {
		const invalidInputs = [
			null,
			undefined,
			0,
			42,
			true,
			false,
			'123',
			Symbol('x'),
			{},
			() => {},
			new ArrayBuffer(16),
			new DataView(new ArrayBuffer(16)),
			new Float32Array([0, 1]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1])
		]

		for (const invalid of invalidInputs) {
			assert.throws(
				() => tanTypedLazy(invalid),
				TypeError,
				`Expected TypeError for input: ${String(invalid)}`
			)
		}
	})

	test('validates chunk types lazily and throws TypeError on non-Float64Array chunks', () => {
		let pulled = 0
		function* badSequence() {
			pulled++
			yield new Float64Array([0])
			pulled++
			yield [Math.PI / 4]
		}

		const gen = tanTypedLazy(badSequence())
		assert.equal(pulled, 0, 'lazy validation must not pull chunks before iteration')

		assert.equal(gen.next().value, 0)
		assert.equal(pulled, 1)

		assert.throws(() => gen.next(), TypeError)
		assert.equal(pulled, 2)

		assert.throws(() => [...tanTypedLazy([1, 2, 3])], TypeError)
		assert.throws(() => [...tanTypedLazy([new Float32Array([0])])], TypeError)
	})

	test('independent cross-check against sin(x)/cos(x), odd symmetry, and Pythagorean identity', () => {
		const angles = new Float64Array([
			-1.4, -1.1, -0.75, -0.3, -0.05, 0, 0.05, 0.3, 0.75, 1.1, 1.4
		])
		const results = [...tanTypedLazy(angles)]
		const negResults = [...tanTypedLazy(angles.map((x) => -x))]

		for (let i = 0; i < angles.length; i++) {
			const x = angles[i]
			const tanVal = results[i]
			const sinOverCos = Math.sin(x) / Math.cos(x)

			assertClose(tanVal, sinOverCos, 1e-13)
			assertClose(negResults[i], -tanVal, 1e-15)

			// Pythagorean identity: 1 + tan^2(x) === 1 / cos^2(x)
			const lhs = 1 + tanVal * tanVal
			const rhs = 1 / (Math.cos(x) * Math.cos(x))
			assertClose(lhs, rhs, 1e-11)
		}
	})

	test('independent cross-check against Maclaurin series for small angles', () => {
		// tan(x) = x + x^3/3 + 2x^5/15 + 17x^7/315 + 62x^9/2835 + O(x^11)
		function tanMaclaurin(x) {
			const x2 = x * x
			const x3 = x * x2
			const x5 = x3 * x2
			const x7 = x5 * x2
			const x9 = x7 * x2
			return x + x3 / 3 + (2 * x5) / 15 + (17 * x7) / 315 + (62 * x9) / 2835
		}

		const smallAngles = new Float64Array([-0.2, -0.1, -0.01, 0, 0.01, 0.1, 0.2])
		const results = [...tanTypedLazy(smallAngles)]

		for (let i = 0; i < smallAngles.length; i++) {
			assertClose(results[i], tanMaclaurin(smallAngles[i]), 1e-9)
		}
	})
})
