import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cosTypedLazy } from './cosTypedLazy.js'

const EPSILON = 1e-12

function assertClose(actual, expected, tol = EPSILON, message) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		message ?? `expected ${actual} to be within ${tol} of ${expected}`,
	)
}

/**
 * Independent reference implementation of cos(x) using a Maclaurin series
 * after range reduction into [-pi, pi]. Uses only basic arithmetic (+, -, *, /).
 */
function taylorCos(x) {
	const TWO_PI = 2 * Math.PI
	let r = ((x + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI
	let term = 1
	let sum = 1
	const r2 = r * r
	for (let k = 1; k <= 16; k++) {
		term *= -r2 / ((2 * k - 1) * (2 * k))
		sum += term
	}
	return sum
}

describe('cosTypedLazy', () => {
	test('computes cosine element-wise over a Float64Array (normal cases)', () => {
		const input = new Float64Array([0, Math.PI / 6, Math.PI / 4, Math.PI / 3])
		const results = [...cosTypedLazy(input)]
		assert.equal(results.length, 4)
		assertClose(results[0], 1)
		assertClose(results[1], Math.sqrt(3) / 2)
		assertClose(results[2], Math.SQRT1_2)
		assertClose(results[3], 0.5)
	})

	test('handles key trigonometric edge cases: 0, -0, pi/2, pi, 3pi/2, 2pi, and negative angles', () => {
		const angles = new Float64Array([
			0,
			-0,
			Math.PI / 2,
			-Math.PI / 2,
			Math.PI,
			-Math.PI,
			(3 * Math.PI) / 2,
			2 * Math.PI,
			-2 * Math.PI,
			-Math.PI / 3,
		])
		const expected = [1, 1, 0, 0, -1, -1, 0, 1, 1, 0.5]
		const results = [...cosTypedLazy(angles)]
		assert.equal(results.length, expected.length)
		for (let i = 0; i < expected.length; i++) {
			assertClose(results[i], expected[i], 1e-14, `mismatch at index ${i}`)
		}
	})

	test('handles empty Float64Array and empty iterable of chunks', () => {
		assert.deepEqual([...cosTypedLazy(new Float64Array(0))], [])
		assert.deepEqual([...cosTypedLazy([])], [])

		function* emptyChunks() {
			yield new Float64Array(0)
			yield new Float64Array(0)
		}
		assert.deepEqual([...cosTypedLazy(emptyChunks())], [])
	})

	test('streams element-wise over an iterable of Float64Array chunks', () => {
		function* chunkGen() {
			yield new Float64Array([0, Math.PI / 2])
			yield new Float64Array(0)
			yield new Float64Array([Math.PI, -Math.PI / 3])
		}
		const results = [...cosTypedLazy(chunkGen())]
		assert.equal(results.length, 4)
		assertClose(results[0], 1)
		assertClose(results[1], 0)
		assertClose(results[2], -1)
		assertClose(results[3], 0.5)
	})

	test('consumes chunk iterables lazily and does not pull unneeded chunks', () => {
		let chunksPulled = 0
		let cleanedUp = false

		function* trackedChunks() {
			try {
				chunksPulled++
				yield new Float64Array([0, Math.PI])
				chunksPulled++
				yield new Float64Array([Math.PI / 2, Math.PI / 3])
				chunksPulled++
				yield new Float64Array([2 * Math.PI])
			} finally {
				cleanedUp = true
			}
		}

		const gen = cosTypedLazy(trackedChunks())
		assert.equal(chunksPulled, 0, 'should not pull any chunk before first .next()')

		const first = gen.next()
		assert.equal(first.done, false)
		assertClose(first.value, 1)
		assert.equal(chunksPulled, 1, 'should pull only first chunk for element 0')

		const second = gen.next()
		assert.equal(second.done, false)
		assertClose(second.value, -1)
		assert.equal(chunksPulled, 1, 'should still only have pulled first chunk for element 1')

		// Stop early without pulling chunks 2 or 3
		gen.return()
		assert.equal(chunksPulled, 1, 'should never pull remaining chunks after early close')
		assert.equal(cleanedUp, true, 'should run upstream generator finally block on early close')
	})

	test('supports streaming from an infinite generator of Float64Array chunks', () => {
		function* infiniteChunks() {
			let n = 0
			while (true) {
				yield new Float64Array([n * Math.PI, (n + 0.5) * Math.PI])
				n++
			}
		}

		const gen = cosTypedLazy(infiniteChunks())
		const taken = []
		for (const val of gen) {
			taken.push(val)
			if (taken.length === 6) break
		}

		const expected = [1, 0, -1, 0, 1, 0]
		assert.equal(taken.length, expected.length)
		for (let i = 0; i < expected.length; i++) {
			assertClose(taken[i], expected[i])
		}
	})

	test('returns a standard generator/iterator and can be materialized with Float64Array.from', () => {
		const input = new Float64Array([0, Math.PI, 2 * Math.PI])
		const gen = cosTypedLazy(input)
		assert.equal(typeof gen.next, 'function')
		assert.equal(typeof gen[Symbol.iterator], 'function')
		assert.equal(gen[Symbol.iterator](), gen)

		const out = Float64Array.from(gen)
		assert.ok(out instanceof Float64Array)
		assert.equal(out.length, 3)
		assertClose(out[0], 1)
		assertClose(out[1], -1)
		assertClose(out[2], 1)
	})

	test('rejects invalid top-level inputs synchronously with TypeError', () => {
		const invalidInputs = [
			null,
			undefined,
			42,
			true,
			'0.5',
			{},
			new Int32Array([0, 1]),
			new Float32Array([0, 1]),
			new Uint8Array([0, 1]),
			new DataView(new ArrayBuffer(8)),
		]
		for (const bad of invalidInputs) {
			assert.throws(() => cosTypedLazy(bad), TypeError)
		}
	})

	test('rejects invalid chunk types inside an iterable with TypeError', () => {
		assert.throws(() => [...cosTypedLazy([0, 1])], TypeError)
		assert.throws(() => [...cosTypedLazy([new Float32Array([0])])], TypeError)
		assert.throws(
			() => [...cosTypedLazy([new Float64Array([0]), 'not-a-typed-array'])],
			TypeError,
		)
	})

	test('rejects non-finite elements (NaN, Infinity, -Infinity) lazily with RangeError', () => {
		for (const badVal of [NaN, Infinity, -Infinity]) {
			const arr = new Float64Array([0, badVal, Math.PI])
			const gen = cosTypedLazy(arr)
			const first = gen.next()
			assert.equal(first.done, false)
			assertClose(first.value, 1)
			assert.throws(() => gen.next(), RangeError)
		}

		function* badChunkStream() {
			yield new Float64Array([0])
			yield new Float64Array([NaN])
		}
		const gen = cosTypedLazy(badChunkStream())
		assertClose(gen.next().value, 1)
		assert.throws(() => gen.next(), RangeError)
	})

	test('independent cross-check against Maclaurin series and trigonometric identities', () => {
		const angles = new Float64Array([
			-5.7,
			-3.14159,
			-1.2345,
			-0.5,
			-1e-7,
			0,
			1e-7,
			0.37,
			1.1,
			2.45,
			4.8,
			10.25,
		])
		const results = [...cosTypedLazy(angles)]
		const negResults = [...cosTypedLazy(Float64Array.from(angles, (x) => -x))]
		const doubleResults = [...cosTypedLazy(Float64Array.from(angles, (x) => 2 * x))]

		for (let i = 0; i < angles.length; i++) {
			const x = angles[i]
			const c = results[i]

			// 1. Cross-check against independent Maclaurin series
			assertClose(c, taylorCos(x), 1e-12, `Maclaurin mismatch at x=${x}`)

			// 2. Even function identity: cos(-x) === cos(x)
			assert.equal(negResults[i], c, `evenness mismatch at x=${x}`)

			// 3. Pythagorean identity: cos^2(x) + sin^2(x) = 1
			const s = Math.sin(x)
			assertClose(c * c + s * s, 1, 1e-14, `Pythagorean identity mismatch at x=${x}`)

			// 4. Double-angle identity: cos(2x) = 2*cos^2(x) - 1
			assertClose(doubleResults[i], 2 * c * c - 1, 1e-13, `double-angle mismatch at x=${x}`)
		}
	})
})
