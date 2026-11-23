import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cbrtTypedLazy } from './cbrtTypedLazy.js'

/**
 * Independent Newton-Raphson cube root solver (no Math.cbrt).
 * Solves y^3 - x = 0 via y_{n+1} = (2 * y_n + x / (y_n * y_n)) / 3.
 */
function newtonCbrt(x) {
	if (x === 0 || !Number.isFinite(x)) return x
	const sign = x < 0 ? -1 : 1
	const a = Math.abs(x)
	// Initial guess from Math.exp(Math.log(a) / 3)
	let y = Math.exp(Math.log(a) / 3)
	for (let i = 0; i < 10; i++) {
		y = (2 * y + a / (y * y)) / 3
	}
	return sign * y
}

function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-15) {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(Math.abs(actual), Math.abs(expected), 1)
	assert.ok(
		diff <= Math.max(absTol, relTol * scale),
		`Expected ${actual} to be within relTol=${relTol} of ${expected} (diff=${diff})`,
	)
}

describe('cbrtTypedLazy', () => {
	describe('normal cases', () => {
		it('computes element-wise cube roots for a Float64Array of perfect cubes', () => {
			const input = new Float64Array([1, 8, 27, 64, 125, 1000])
			const result = [...cbrtTypedLazy(input)]
			assert.deepEqual(result, [1, 2, 3, 4, 5, 10])
		})

		it('computes cube roots for fractional and non-perfect cubes', () => {
			const input = new Float64Array([0.125, 0.001, 2, 3, 10])
			const result = Float64Array.from(cbrtTypedLazy(input))
			assert.equal(result.length, input.length)
			assertClose(result[0], 0.5)
			assertClose(result[1], 0.1)
			assertClose(result[2], 1.2599210498948732)
			assertClose(result[3], 1.4422495703074083)
			assertClose(result[4], 2.154434690031884)
		})

		it('does not mutate the input Float64Array', () => {
			const input = new Float64Array([8, -27, 64])
			const snapshot = new Float64Array(input)
			const out = [...cbrtTypedLazy(input)]
			assert.deepEqual(out, [2, -3, 4])
			assert.deepEqual(input, snapshot)
		})

		it('handles Float64Array subarrays with non-zero byteOffset', () => {
			const backing = new Float64Array([999, 8, -27, 64, 999])
			const view = backing.subarray(1, 4)
			assert.equal(view.byteOffset, 8)
			assert.deepEqual([...cbrtTypedLazy(view)], [2, -3, 4])
		})

		it('streams across an iterable of Float64Array chunks', () => {
			const chunks = [
				new Float64Array([1, 8]),
				new Float64Array([27]),
				new Float64Array([64, 125]),
			]
			assert.deepEqual([...cbrtTypedLazy(chunks)], [1, 2, 3, 4, 5])
		})
	})

	describe('edge cases', () => {
		it('handles negative numbers accurately', () => {
			const input = new Float64Array([-1, -8, -27, -64, -0.125, -1000])
			const result = [...cbrtTypedLazy(input)]
			assert.deepEqual(result, [-1, -2, -3, -4, -0.5, -10])
		})

		it('preserves signed zero (+0 and -0)', () => {
			const input = new Float64Array([0, -0])
			const [posZero, negZero] = [...cbrtTypedLazy(input)]
			assert.ok(Object.is(posZero, 0), 'expected +0')
			assert.ok(Object.is(negZero, -0), 'expected -0')
		})

		it('handles empty Float64Array and empty chunk sequences', () => {
			assert.deepEqual([...cbrtTypedLazy(new Float64Array(0))], [])
			assert.deepEqual([...cbrtTypedLazy([])], [])
			assert.deepEqual(
				[
					...cbrtTypedLazy([
						new Float64Array(0),
						new Float64Array([8]),
						new Float64Array(0),
						new Float64Array([-27]),
						new Float64Array(0),
					]),
				],
				[2, -3],
			)
		})

		it('handles Infinity, -Infinity, and NaN', () => {
			const input = new Float64Array([Infinity, -Infinity, Number.NaN])
			const [posInf, negInf, nanVal] = [...cbrtTypedLazy(input)]
			assert.equal(posInf, Infinity)
			assert.equal(negInf, -Infinity)
			assert.ok(Number.isNaN(nanVal))
		})

		it('handles extreme magnitudes without overflow or underflow', () => {
			const input = new Float64Array([
				Number.MAX_VALUE,
				-Number.MAX_VALUE,
				Number.MIN_VALUE,
				-Number.MIN_VALUE,
				Number.EPSILON,
			])
			const results = [...cbrtTypedLazy(input)]
			for (const r of results) {
				assert.ok(Number.isFinite(r) && r !== 0)
			}
			assert.ok(results[0] > 0 && results[1] === -results[0])
			assert.ok(results[2] > 0 && results[3] === -results[2])
		})
	})

	describe('lazy and streaming behavior', () => {
		it('returns a generator that is its own iterator', () => {
			const gen = cbrtTypedLazy(new Float64Array([8, 27]))
			assert.equal(typeof gen.next, 'function')
			assert.equal(typeof gen.return, 'function')
			assert.equal(typeof gen.throw, 'function')
			assert.equal(gen[Symbol.iterator](), gen)
			assert.deepEqual(gen.next(), { value: 2, done: false })
			assert.deepEqual(gen.next(), { value: 3, done: false })
			assert.deepEqual(gen.next(), { value: undefined, done: true })
		})

		it('consumes chunk iterables lazily one chunk at a time', () => {
			let chunksPulled = 0
			function* source() {
				chunksPulled++
				yield new Float64Array([8, 27])
				chunksPulled++
				yield new Float64Array([-64, 125])
				chunksPulled++
				yield new Float64Array([1000])
			}

			const stream = cbrtTypedLazy(source())
			// Constructing the stream must not pull any chunks yet.
			assert.equal(chunksPulled, 0)

			// Pulling the first element pulls only chunk 1.
			assert.deepEqual(stream.next(), { value: 2, done: false })
			assert.equal(chunksPulled, 1)

			// Pulling the second element still comes from chunk 1.
			assert.deepEqual(stream.next(), { value: 3, done: false })
			assert.equal(chunksPulled, 1)

			// Pulling the third element pulls chunk 2, not chunk 3.
			assert.deepEqual(stream.next(), { value: -4, done: false })
			assert.equal(chunksPulled, 2)

			// Closing early never pulls chunk 3.
			stream.return()
			assert.equal(chunksPulled, 2)
		})

		it('supports infinite chunk generators and cleans up on early break', () => {
			let finalized = false
			function* infiniteCubes() {
				let n = 1
				try {
					while (true) {
						yield new Float64Array([n ** 3, (n + 1) ** 3])
						n += 2
					}
				} finally {
					finalized = true
				}
			}

			const taken = []
			for (const value of cbrtTypedLazy(infiniteCubes())) {
				taken.push(value)
				if (taken.length === 5) break
			}

			assert.deepEqual(taken, [1, 2, 3, 4, 5])
			assert.equal(finalized, true)
		})
	})

	describe('invalid input validation', () => {
		it('eagerly rejects null, undefined, primitives, and non-iterables', () => {
			const invalidInputs = [
				undefined,
				null,
				42,
				Number.NaN,
				'123',
				true,
				false,
				Symbol('x'),
				10n,
				{},
				{ length: 2, 0: 8, 1: 27 },
				() => {},
			]
			for (const bad of invalidInputs) {
				assert.throws(() => cbrtTypedLazy(bad), TypeError)
			}
		})

		it('eagerly rejects non-Float64Array typed arrays, DataView, and ArrayBuffer', () => {
			const invalidBuffers = [
				new Float32Array([8, 27]),
				new Int32Array([8, 27]),
				new Uint8Array([8, 27]),
				new BigInt64Array([8n, 27n]),
				new DataView(new ArrayBuffer(16)),
				new ArrayBuffer(16),
			]
			for (const bad of invalidBuffers) {
				assert.throws(() => cbrtTypedLazy(bad), TypeError)
			}
		})

		it('rejects non-Float64Array chunks when iterating a sequence', () => {
			assert.throws(() => [...cbrtTypedLazy([8, 27])], TypeError)
			assert.throws(
				() => [...cbrtTypedLazy([new Float64Array([8]), new Float32Array([27])])],
				TypeError,
			)

			// Yields valid chunks before throwing on a subsequent invalid chunk
			function* badStream() {
				yield new Float64Array([8, -27])
				yield [64]
			}
			const gen = cbrtTypedLazy(badStream())
			assert.deepEqual(gen.next(), { value: 2, done: false })
			assert.deepEqual(gen.next(), { value: -3, done: false })
			assert.throws(() => gen.next(), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches independent Newton-Raphson solver across positive and negative values', () => {
			const samples = new Float64Array([
				-1e12, -1234.5678, -99.5, -2, -0.5, -1e-9, -0, 0, 1e-9, 0.5, 2, 7.25,
				99.5, 1234.5678, 1e12,
			])
			const results = [...cbrtTypedLazy(samples)]
			for (let i = 0; i < samples.length; i++) {
				const expected = newtonCbrt(samples[i])
				assertClose(results[i], expected, 1e-14)
			}
		})

		it('satisfies cube inversion (cbrt(x)^3 ≈ x) and odd symmetry (cbrt(-x) === -cbrt(x))', () => {
			const values = new Float64Array([
				0.000123, 0.25, 1.5, 3.141592653589793, 42, 1e6, 9.87654321e15,
			])
			const negated = Float64Array.from(values, (v) => -v)

			const posRoots = [...cbrtTypedLazy(values)]
			const negRoots = [...cbrtTypedLazy(negated)]

			for (let i = 0; i < values.length; i++) {
				const reconstructed = posRoots[i] ** 3
				assertClose(reconstructed, values[i], 1e-13)
				assert.equal(negRoots[i], -posRoots[i])
			}
		})

		it('satisfies multiplicative identity cbrt(a * b) ≈ cbrt(a) * cbrt(b)', () => {
			const a = new Float64Array([2, -3, 5.5, -0.25, 12])
			const b = new Float64Array([7, 4, -2.5, -8, 0.5])
			const prod = Float64Array.from(a, (v, i) => v * b[i])

			const ra = [...cbrtTypedLazy(a)]
			const rb = [...cbrtTypedLazy(b)]
			const rProd = [...cbrtTypedLazy(prod)]

			for (let i = 0; i < a.length; i++) {
				assertClose(rProd[i], ra[i] * rb[i], 1e-14)
			}
		})
	})
})
