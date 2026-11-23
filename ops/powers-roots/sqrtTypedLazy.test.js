import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtTypedLazy } from './sqrtTypedLazy.js'

/**
 * Independent square-root reference using Newton-Raphson (Babylonian) iteration.
 *
 * @param {number} x
 * @returns {number}
 */
function newtonSqrt(x) {
	if (Number.isNaN(x) || x < 0) return Number.NaN
	if (x === 0 || !Number.isFinite(x)) return x
	// Rescale using exact powers of 2 so v lies in [0.25, 4) with zero rounding error
	let scale = 1
	let v = x
	while (v >= 4) {
		v *= 0.25
		scale *= 2
	}
	while (v < 0.25) {
		v *= 4
		scale *= 0.5
	}
	let guess = 1
	for (let i = 0; i < 64; i++) {
		const next = 0.5 * (guess + v / guess)
		if (next === guess) break
		guess = next
	}
	return guess * scale
}

describe('sqrtTypedLazy', () => {
	describe('normal cases', () => {
		test('computes element-wise square roots for a Float64Array of perfect squares', () => {
			const input = new Float64Array([0, 1, 4, 9, 16, 25, 144, 10000])
			const result = [...sqrtTypedLazy(input)]
			assert.deepEqual(result, [0, 1, 2, 3, 4, 5, 12, 100])
		})

		test('computes element-wise square roots for non-integer and fractional values', () => {
			const input = new Float64Array([0.25, 0.0625, 2.25, 2, 3, 0.5])
			const result = Float64Array.from(sqrtTypedLazy(input))
			assert.equal(result[0], 0.5)
			assert.equal(result[1], 0.25)
			assert.equal(result[2], 1.5)
			assert.ok(Math.abs(result[3] - Math.SQRT2) <= Number.EPSILON)
			assert.ok(Math.abs(result[4] - 1.7320508075688772) <= Number.EPSILON)
			assert.ok(Math.abs(result[5] - Math.SQRT1_2) <= Number.EPSILON)
		})

		test('handles an iterable sequence of Float64Array chunks', () => {
			const chunks = [
				new Float64Array([1, 4]),
				new Float64Array([9, 16, 25]),
				new Float64Array([36]),
			]
			const result = [...sqrtTypedLazy(chunks)]
			assert.deepEqual(result, [1, 2, 3, 4, 5, 6])
		})

		test('respects Float64Array subarray views with non-zero byteOffset', () => {
			const backing = new Float64Array([100, 4, 9, 16, 200])
			const view = backing.subarray(1, 4)
			assert.deepEqual([...sqrtTypedLazy(view)], [2, 3, 4])
		})

		test('does not mutate the input Float64Array', () => {
			const input = new Float64Array([4, 9, 16, 25])
			const snapshot = Float64Array.from(input)
			assert.deepEqual([...sqrtTypedLazy(input)], [2, 3, 4, 5])
			assert.deepEqual(input, snapshot)
		})
	})

	describe('edge cases', () => {
		test('handles empty Float64Array, empty iterable, and empty chunks', () => {
			assert.deepEqual([...sqrtTypedLazy(new Float64Array(0))], [])
			assert.deepEqual([...sqrtTypedLazy([])], [])
			assert.deepEqual(
				[
					...sqrtTypedLazy([
						new Float64Array(0),
						new Float64Array([4]),
						new Float64Array(0),
						new Float64Array([9]),
						new Float64Array(0),
					]),
				],
				[2, 3],
			)
		})

		test('preserves signed zeros (+0 and -0)', () => {
			const input = new Float64Array([0, -0])
			const [posZero, negZero] = [...sqrtTypedLazy(input)]
			assert.ok(Object.is(posZero, 0))
			assert.ok(Object.is(negZero, -0))
		})

		test('returns NaN for negative numbers and -Infinity by default (IEEE 754)', () => {
			const input = new Float64Array([
				-1,
				-4,
				-0.0001,
				-Number.MAX_VALUE,
				-Infinity,
			])
			const results = [...sqrtTypedLazy(input)]
			assert.equal(results.length, 5)
			for (const value of results) {
				assert.ok(Number.isNaN(value), `expected NaN, got ${value}`)
			}
		})

		test('throws RangeError on negative values when strict mode is enabled', () => {
			const input = new Float64Array([4, -0, 9, -1, 16])
			const gen = sqrtTypedLazy(input, { strict: true })
			assert.equal(gen.next().value, 2)
			assert.ok(Object.is(gen.next().value, -0))
			assert.equal(gen.next().value, 3)
			assert.throws(() => gen.next(), RangeError)

			assert.throws(
				() => [...sqrtTypedLazy(new Float64Array([-Infinity]), { strict: true })],
				RangeError,
			)
		})

		test('handles +Infinity, NaN, subnormals, and extreme finite values', () => {
			const input = new Float64Array([
				Infinity,
				NaN,
				Number.MIN_VALUE,
				1e-300,
				Number.MAX_VALUE,
				Number.EPSILON,
			])
			const [inf, nan, minVal, tiny, maxVal, eps] = [...sqrtTypedLazy(input)]
			assert.equal(inf, Infinity)
			assert.ok(Number.isNaN(nan))
			assert.ok(Number.isFinite(minVal) && minVal > 0)
			assert.ok(Math.abs(tiny - 1e-150) <= 1e-164)
			assert.ok(Number.isFinite(maxVal) && maxVal > 1e153)
			assert.ok(Math.abs(eps * eps - Number.EPSILON) <= Number.EPSILON * 1e-15)
		})
	})

	describe('lazy and streaming behavior', () => {
		test('returns a proper Generator object and does not pull chunks before iteration', () => {
			let chunksPulled = 0
			function* source() {
				chunksPulled++
				yield new Float64Array([4, 9])
				chunksPulled++
				yield new Float64Array([16, 25])
				chunksPulled++
				yield new Float64Array([36])
			}

			const gen = sqrtTypedLazy(source())
			assert.equal(typeof gen.next, 'function')
			assert.equal(typeof gen.return, 'function')
			assert.equal(typeof gen.throw, 'function')
			assert.equal(gen[Symbol.iterator](), gen)
			assert.equal(chunksPulled, 0)

			assert.deepEqual(gen.next(), { value: 2, done: false })
			assert.equal(chunksPulled, 1)
			assert.deepEqual(gen.next(), { value: 3, done: false })
			assert.equal(chunksPulled, 1)

			assert.deepEqual(gen.next(), { value: 4, done: false })
			assert.equal(chunksPulled, 2)
			assert.deepEqual(gen.next(), { value: 5, done: false })
			assert.equal(chunksPulled, 2)

			assert.deepEqual(gen.next(), { value: 6, done: false })
			assert.equal(chunksPulled, 3)
			assert.deepEqual(gen.next(), { value: undefined, done: true })
		})

		test('closes upstream generator on early termination without pulling remaining chunks', () => {
			let chunksPulled = 0
			let closed = false

			function* source() {
				try {
					chunksPulled++
					yield new Float64Array([1, 4, 9])
					chunksPulled++
					yield new Float64Array([16, 25])
					chunksPulled++
					yield new Float64Array([36, 49])
				} finally {
					closed = true
				}
			}

			const taken = []
			for (const val of sqrtTypedLazy(source())) {
				taken.push(val)
				if (taken.length === 2) break
			}

			assert.deepEqual(taken, [1, 2])
			assert.equal(chunksPulled, 1)
			assert.equal(closed, true)
		})

		test('supports infinite streams of Float64Array chunks lazily', () => {
			function* infiniteSquares() {
				let n = 1
				while (true) {
					yield new Float64Array([n * n, (n + 1) * (n + 1)])
					n += 2
				}
			}

			const out = []
			for (const val of sqrtTypedLazy(infiniteSquares())) {
				out.push(val)
				if (out.length === 7) break
			}
			assert.deepEqual(out, [1, 2, 3, 4, 5, 6, 7])
		})

		test('computes elements lazily on a single Float64Array (strict error not triggered until reached)', () => {
			const input = new Float64Array([4, 9, -1, 16])
			const gen = sqrtTypedLazy(input, { strict: true })
			assert.equal(gen.next().value, 2)
			assert.equal(gen.next().value, 3)
			// Stopping early avoids ever evaluating the negative element
			assert.deepEqual(gen.return(), { value: undefined, done: true })
		})
	})

	describe('input validation', () => {
		test('rejects non-Float64Array non-iterable and forbidden inputs eagerly', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				true,
				'1234',
				{},
				() => {},
				new ArrayBuffer(16),
				new Float32Array([4, 9]),
				new Int32Array([4, 9]),
				new Uint8Array([4, 9]),
				new DataView(new ArrayBuffer(16)),
			]

			for (const bad of invalidInputs) {
				assert.throws(() => sqrtTypedLazy(bad), TypeError)
			}
		})

		test('rejects invalid options eagerly', () => {
			const validInput = new Float64Array([4, 9])
			for (const badOptions of [null, [], 'strict', 123, true]) {
				assert.throws(() => sqrtTypedLazy(validInput, badOptions), TypeError)
			}
			for (const badStrict of ['true', 1, null, {}]) {
				assert.throws(
					() => sqrtTypedLazy(validInput, { strict: badStrict }),
					TypeError,
				)
			}
		})

		test('rejects non-Float64Array chunks in an iterable lazily when encountered', () => {
			assert.throws(() => [...sqrtTypedLazy([4, 9])], TypeError)
			assert.throws(
				() => [...sqrtTypedLazy([new Float32Array([4, 9])])],
				TypeError,
			)

			// Valid first chunk yields before invalid second chunk is pulled
			function* mixedStream() {
				yield new Float64Array([4, 9])
				yield [16, 25]
			}
			const gen = sqrtTypedLazy(mixedStream())
			assert.equal(gen.next().value, 2)
			assert.equal(gen.next().value, 3)
			assert.throws(() => gen.next(), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		test('matches Newton-Raphson iteration and inverse squaring property across magnitudes', () => {
			const values = new Float64Array([
				0,
				Number.MIN_VALUE,
				1e-200,
				1e-50,
				1e-12,
				0.000123456789,
				0.5,
				1,
				2,
				3,
				Math.PI,
				Math.E,
				10,
				123456.789,
				1e20,
				1e100,
				1e200,
				Number.MAX_VALUE,
			])

			const results = [...sqrtTypedLazy(values)]
			assert.equal(results.length, values.length)

			for (let i = 0; i < values.length; i++) {
				const x = values[i]
				const actual = results[i]
				const expectedNewton = newtonSqrt(x)

				if (x === 0) {
					assert.equal(actual, 0)
					continue
				}

				const relErrNewton =
					Math.abs(actual - expectedNewton) / expectedNewton
				assert.ok(
					relErrNewton <= 4 * Number.EPSILON,
					`Newton mismatch at x=${x}: actual=${actual}, newton=${expectedNewton}, relErr=${relErrNewton}`,
				)

				// Independent identity: actual^2 ~= x (for values where squaring doesn't underflow to 0)
				if (x > 1e-300) {
					const relErrSquare = Math.abs(actual * actual - x) / x
					assert.ok(
						relErrSquare <= 4 * Number.EPSILON,
						`Squaring mismatch at x=${x}: actual^2=${actual * actual}, relErr=${relErrSquare}`,
					)
				}

				// Independent identity: exp(0.5 * ln(x)) ~= sqrt(x)
				// Condition number of exp(y) is |y|, so relative error scales with |0.5 * ln(x)| * EPSILON
				const expectedExpLog = Math.exp(0.5 * Math.log(x))
				const relErrExpLog = Math.abs(actual - expectedExpLog) / actual
				const expLogTol = Math.max(1e-14, Math.abs(Math.log(x)) * Number.EPSILON)
				assert.ok(
					relErrExpLog <= expLogTol,
					`exp(0.5*ln(x)) mismatch at x=${x}: actual=${actual}, expLog=${expectedExpLog}, relErr=${relErrExpLog}`,
				)
			}
		})
	})
})
