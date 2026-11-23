import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeTypedLazy } from './magnitudeTypedLazy.js'

/**
 * Helper to assert two numbers are within a relative tolerance.
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-12]
 */
function assertApproxEqual(actual, expected, relTol = 1e-12) {
	if (expected === 0) {
		assert.equal(actual, 0)
		return
	}
	const relErr = Math.abs(actual - expected) / Math.abs(expected)
	assert.ok(
		relErr <= relTol,
		`Expected ${actual} to be within relative tolerance ${relTol} of ${expected} (relErr=${relErr})`
	)
}

describe('magnitudeTypedLazy', () => {
	describe('normal cases', () => {
		test('computes exact magnitudes for Pythagorean triples and standard vectors', () => {
			assert.equal(magnitudeTypedLazy(new Float64Array([3, 4])), 5)
			assert.equal(magnitudeTypedLazy(new Float64Array([5, 12])), 13)
			assert.equal(magnitudeTypedLazy(new Float64Array([3, 4, 12])), 13)
			assert.equal(magnitudeTypedLazy(new Float64Array([1, 2, 2])), 3)
		})

		test('handles single-element and negative-component vectors', () => {
			assert.equal(magnitudeTypedLazy(new Float64Array([7])), 7)
			assert.equal(magnitudeTypedLazy(new Float64Array([-7])), 7)
			assert.equal(magnitudeTypedLazy(new Float64Array([-3, -4])), 5)
			assert.equal(magnitudeTypedLazy(new Float64Array([-1, 2, -2])), 3)
		})

		test('handles fractional values and Float64Array subarray views', () => {
			assertApproxEqual(
				magnitudeTypedLazy(new Float64Array([1, 1])),
				Math.SQRT2
			)
			assert.equal(
				magnitudeTypedLazy(new Float64Array([0.5, 0.5, 0.5, 0.5])),
				1
			)

			const backing = new Float64Array([99, 3, 4, 99])
			const view = backing.subarray(1, 3)
			assert.equal(magnitudeTypedLazy(view), 5)
		})
	})

	describe('edge cases', () => {
		test('returns 0 for empty Float64Array and empty iterables', () => {
			assert.equal(magnitudeTypedLazy(new Float64Array(0)), 0)
			assert.equal(magnitudeTypedLazy([]), 0)
			assert.equal(
				magnitudeTypedLazy(
					(function* () {
						// empty generator
					})()
				),
				0
			)
			assert.equal(
				magnitudeTypedLazy([new Float64Array(0), new Float64Array(0)]),
				0
			)
		})

		test('returns positive 0 for zero vectors including -0', () => {
			const res = magnitudeTypedLazy(new Float64Array([0, -0, 0, -0]))
			assert.ok(Object.is(res, 0))
		})

		test('avoids overflow on very large magnitudes', () => {
			const huge = new Float64Array([1e200, 1e200])
			// Verify naive squaring would overflow
			assert.equal(huge[0] * huge[0], Infinity)
			assertApproxEqual(magnitudeTypedLazy(huge), Math.SQRT2 * 1e200)

			const scaledTriple = new Float64Array([3e307, 4e307])
			assertApproxEqual(magnitudeTypedLazy(scaledTriple), 5e307)

			const nearMax = new Float64Array([1e308, 1e308])
			assertApproxEqual(magnitudeTypedLazy(nearMax), Math.SQRT2 * 1e308)
		})

		test('avoids underflow on very small and subnormal magnitudes', () => {
			const tiny = new Float64Array([1e-200, 1e-200])
			// Verify naive squaring would underflow to 0
			assert.equal(tiny[0] * tiny[0], 0)
			assertApproxEqual(magnitudeTypedLazy(tiny), Math.SQRT2 * 1e-200)

			const tinyTriple = new Float64Array([3e-300, 4e-300])
			assertApproxEqual(magnitudeTypedLazy(tinyTriple), 5e-300)

			const subnormal = new Float64Array([1e-320, 1e-320])
			assertApproxEqual(
				magnitudeTypedLazy(subnormal),
				Math.SQRT2 * 1e-320,
				1e-3
			)
		})

		test('handles extreme dynamic range in both orders', () => {
			assert.equal(
				magnitudeTypedLazy(new Float64Array([1e-200, 1e200])),
				1e200
			)
			assert.equal(
				magnitudeTypedLazy(new Float64Array([1e200, 1e-200])),
				1e200
			)
		})

		test('handles IEEE 754 Infinity and NaN matching Math.hypot', () => {
			assert.equal(
				magnitudeTypedLazy(new Float64Array([Infinity, 3, 4])),
				Infinity
			)
			assert.equal(
				magnitudeTypedLazy(new Float64Array([3, -Infinity, 4])),
				Infinity
			)
			assert.equal(
				magnitudeTypedLazy(new Float64Array([NaN, Infinity])),
				Infinity
			)
			assert.equal(
				magnitudeTypedLazy(new Float64Array([Infinity, NaN])),
				Infinity
			)
			assert.ok(Number.isNaN(magnitudeTypedLazy(new Float64Array([3, NaN, 4]))))
		})
	})

	describe('lazy and streaming behavior', () => {
		test('consumes a generator of Float64Array chunks including empty chunks', () => {
			function* chunkStream() {
				yield new Float64Array([3])
				yield new Float64Array(0)
				yield new Float64Array([4, 0])
				yield new Float64Array([12])
			}

			assert.equal(magnitudeTypedLazy(chunkStream()), 13)
		})

		test('consumes a custom iterable lazily without materializing upfront', () => {
			let chunksPulled = 0
			const customIterable = {
				[Symbol.iterator]() {
					const chunks = [
						new Float64Array([3, 4]),
						new Float64Array([12]),
						new Float64Array([84])
					]
					let idx = 0
					return {
						next() {
							if (idx < chunks.length) {
								chunksPulled++
								return { value: chunks[idx++], done: false }
							}
							return { value: undefined, done: true }
						}
					}
				}
			}

			// sqrt(3^2 + 4^2 + 12^2 + 84^2) = sqrt(169 + 7056) = sqrt(7225) = 85
			assert.equal(magnitudeTypedLazy(customIterable), 85)
			assert.equal(chunksPulled, 3)
		})

		test('stops pulling from generator immediately upon encountering an invalid chunk', () => {
			let pulled = 0
			function* failingStream() {
				pulled++
				yield new Float64Array([3, 4])
				pulled++
				yield /** @type {any} */ ([12]) // invalid: plain Array, not Float64Array
				pulled++
				yield new Float64Array([100])
				pulled++
				yield new Float64Array([200])
			}

			assert.throws(
				() => magnitudeTypedLazy(failingStream()),
				{
					name: 'TypeError',
					message: /Float64Array/
				}
			)
			// Proves lazy consumption: chunks 3 and 4 were never pulled
			assert.equal(pulled, 2)
		})

		test('streams a large virtual sequence of 1,000,000 elements in constant buffer space', () => {
			const chunkCount = 1000
			const chunkSize = 1000
			let yieldedChunks = 0

			function* largeStream() {
				// Reuse a single Float64Array buffer to demonstrate streaming semantics
				const buf = new Float64Array(chunkSize)
				buf.fill(1)
				for (let c = 0; c < chunkCount; c++) {
					yieldedChunks++
					yield buf
				}
			}

			// sqrt(1_000_000 * 1^2) = 1000
			assertApproxEqual(magnitudeTypedLazy(largeStream()), 1000)
			assert.equal(yieldedChunks, chunkCount)
		})
	})

	describe('invalid input validation', () => {
		test('rejects null, undefined, primitives, and plain non-iterable objects', () => {
			const invalidInputs = [
				undefined,
				null,
				42,
				NaN,
				'34',
				'',
				true,
				false,
				Symbol('vec'),
				10n,
				{},
				{ length: 2, 0: 3, 1: 4 },
				() => new Float64Array([3, 4])
			]

			for (const bad of invalidInputs) {
				assert.throws(
					() => magnitudeTypedLazy(/** @type {any} */ (bad)),
					{ name: 'TypeError' },
					`Expected TypeError for input: ${String(bad)}`
				)
			}
		})

		test('rejects plain JS arrays of numbers and non-Float64Array TypedArrays/views', () => {
			const invalidArrayLikes = [
				[3, 4],
				new Float32Array([3, 4]),
				new Int32Array([3, 4]),
				new Uint8Array([3, 4]),
				new BigInt64Array([3n, 4n]),
				new DataView(new ArrayBuffer(16))
			]

			for (const bad of invalidArrayLikes) {
				assert.throws(
					() => magnitudeTypedLazy(/** @type {any} */ (bad)),
					{ name: 'TypeError' }
				)
			}
		})

		test('rejects iterables yielding non-Float64Array elements', () => {
			const badStreams = [
				[new Float64Array([3]), new Float32Array([4])],
				[new Float64Array([3]), null],
				[new Float64Array([3]), 4],
				[new Float64Array([3]), '4'],
				[new Float64Array([3]), {}],
				new Map([['a', new Float64Array([3])]])
			]

			for (const bad of badStreams) {
				assert.throws(
					() => magnitudeTypedLazy(/** @type {any} */ (bad)),
					{ name: 'TypeError' }
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches Math.hypot across deterministic pseudo-random vectors and chunkings', () => {
			// Deterministic LCG PRNG
			let seed = 0x12345678
			function nextFloat() {
				seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
				return (seed / 0x100000000) * 2 - 1 // [-1, 1)
			}

			const scales = [1e-150, 1e-5, 1, 1e5, 1e150]
			const lengths = [1, 2, 7, 31, 128]

			for (const scale of scales) {
				for (const len of lengths) {
					const arr = new Float64Array(len)
					for (let i = 0; i < len; i++) {
						arr[i] = nextFloat() * scale
					}

					const expected = Math.hypot(...arr)
					const directResult = magnitudeTypedLazy(arr)
					assertApproxEqual(directResult, expected, 1e-14)

					// Also cross-check chunked lazy generator stream against direct result
					function* splitIntoChunks(vec, step) {
						for (let offset = 0; offset < vec.length; offset += step) {
							yield vec.subarray(offset, Math.min(offset + step, vec.length))
						}
					}

					const streamedResult = magnitudeTypedLazy(splitIntoChunks(arr, 5))
					assertApproxEqual(streamedResult, expected, 1e-14)
					assert.equal(streamedResult, directResult)
				}
			}
		})

		test('satisfies norm homogeneity and orthogonal Pythagorean identity', () => {
			const v = new Float64Array([2.5, -6, 1.25, 4.75])
			const alpha = -3.5
			const scaled = new Float64Array(v.length)
			for (let i = 0; i < v.length; i++) {
				scaled[i] = alpha * v[i]
			}
			// ||alpha * v|| == |alpha| * ||v||
			assertApproxEqual(
				magnitudeTypedLazy(scaled),
				Math.abs(alpha) * magnitudeTypedLazy(v),
				1e-14
			)

			// Orthogonal vectors u and w: u · w = 0 => ||u + w||^2 == ||u||^2 + ||w||^2
			const u = new Float64Array([3, 4, 0, 0])
			const w = new Float64Array([0, 0, 5, 12])
			const sum = new Float64Array([3, 4, 5, 12])
			const normU = magnitudeTypedLazy(u)
			const normW = magnitudeTypedLazy(w)
			const normSum = magnitudeTypedLazy(sum)
			assertApproxEqual(normSum * normSum, normU * normU + normW * normW, 1e-14)
		})
	})
})
