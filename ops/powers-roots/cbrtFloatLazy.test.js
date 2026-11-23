import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cbrtFloatLazy } from './cbrtFloatLazy.js'

/**
 * Independent cube root reference using log/exp seed followed by Halley's
 * method iterations for finite non-zero IEEE-754 float64 values.
 *
 * @param {number} x
 * @returns {number}
 */
function halleyCbrt(x) {
	if (x === 0 || !Number.isFinite(x)) return x
	const sign = x < 0 ? -1 : 1
	const ax = Math.abs(x)
	let y = Math.exp(Math.log(ax) / 3)
	for (let i = 0; i < 4; i += 1) {
		const y3 = y * y * y
		y = y * ((y3 + 2 * ax) / (2 * y3 + ax))
	}
	return sign * y
}

describe('cbrtFloatLazy', () => {
	describe('normal cases', () => {
		it('computes exact cube roots for positive and negative perfect cubes', () => {
			const inputs = [0, 1, 8, 27, 64, 125, 1000, -1, -8, -27, -64, -125, -1000]
			const expected = [0, 1, 2, 3, 4, 5, 10, -1, -2, -3, -4, -5, -10]
			const actual = [...cbrtFloatLazy(inputs)]
			assert.deepEqual(actual, expected)
		})

		it('computes cube roots for fractional and irrational-root numbers', () => {
			const inputs = [0.125, -0.125, 1 / 64, 2, -2, Math.PI]
			const actual = [...cbrtFloatLazy(inputs)]
			assert.equal(actual[0], 0.5)
			assert.equal(actual[1], -0.5)
			assert.equal(actual[2], 0.25)
			assert.ok(Math.abs(actual[3] - 1.2599210498948732) <= 1e-15)
			assert.ok(Math.abs(actual[4] + 1.2599210498948732) <= 1e-15)
			assert.ok(Math.abs(actual[5] - 1.4645918875615231) <= 1e-15)
		})

		it('handles empty iterables', () => {
			assert.deepEqual([...cbrtFloatLazy([])], [])
			function* empty() {}
			assert.deepEqual([...cbrtFloatLazy(empty())], [])
		})

		it('accepts diverse iterable types (Set, TypedArrays, custom iterables)', () => {
			assert.deepEqual([...cbrtFloatLazy(new Set([8, 27, 64]))], [2, 3, 4])
			assert.deepEqual(
				[...cbrtFloatLazy(new Float64Array([-8, 0, 27]))],
				[-2, 0, 3]
			)
			assert.deepEqual([...cbrtFloatLazy(new Int32Array([-27, 1, 64]))], [-3, 1, 4])

			const customIterable = {
				*[Symbol.iterator]() {
					yield 1
					yield 8
					yield 27
				},
			}
			assert.deepEqual([...cbrtFloatLazy(customIterable)], [1, 2, 3])
		})
	})

	describe('edge cases (IEEE-754 float64)', () => {
		it('preserves signed zeros (+0 and -0)', () => {
			const [posZero, negZero] = [...cbrtFloatLazy([0, -0])]
			assert.equal(Object.is(posZero, 0), true)
			assert.equal(Object.is(negZero, -0), true)
		})

		it('handles Infinity, -Infinity, and NaN', () => {
			const [posInf, negInf, nanVal] = [
				...cbrtFloatLazy([Infinity, -Infinity, NaN]),
			]
			assert.equal(posInf, Infinity)
			assert.equal(negInf, -Infinity)
			assert.equal(Number.isNaN(nanVal), true)
		})

		it('handles extreme magnitudes and subnormals without overflow/underflow', () => {
			const inputs = [
				Number.MAX_VALUE,
				-Number.MAX_VALUE,
				Number.MIN_VALUE,
				-Number.MIN_VALUE,
				Number.MAX_SAFE_INTEGER,
				Number.MIN_SAFE_INTEGER,
				Number.EPSILON,
			]
			const results = [...cbrtFloatLazy(inputs)]
			for (const r of results) {
				assert.equal(Number.isFinite(r), true)
				assert.notEqual(r, 0)
			}
			assert.equal(results[0], -results[1])
			assert.equal(results[2], -results[3])
			assert.equal(results[4], -results[5])
		})

		it('satisfies odd symmetry cbrt(-x) === -cbrt(x)', () => {
			const samples = [1e-300, 1e-100, 0.001, 0.5, 2, 17.3, 1e50, 1e300]
			const pos = [...cbrtFloatLazy(samples)]
			const neg = [...cbrtFloatLazy(samples.map((x) => -x))]
			for (let i = 0; i < samples.length; i += 1) {
				assert.equal(neg[i], -pos[i])
			}
		})
	})

	describe('true laziness and streaming semantics', () => {
		it('consumes infinite generators lazily without hanging', () => {
			function* infiniteCubes() {
				let n = 0
				while (true) {
					yield n * n * n
					n += 1
				}
			}

			const gen = cbrtFloatLazy(infiniteCubes())
			const firstSix = []
			for (let i = 0; i < 6; i += 1) {
				const step = gen.next()
				assert.equal(step.done, false)
				firstSix.push(step.value)
			}
			assert.deepEqual(firstSix, [0, 1, 2, 3, 4, 5])
		})

		it('pulls exactly one element per next() call and zero on initialization', () => {
			let pulled = 0
			function* trackedSource() {
				for (const v of [1, 8, 27, 64]) {
					pulled += 1
					yield v
				}
			}

			const gen = cbrtFloatLazy(trackedSource())
			assert.equal(pulled, 0)

			assert.deepEqual(gen.next(), { value: 1, done: false })
			assert.equal(pulled, 1)

			assert.deepEqual(gen.next(), { value: 2, done: false })
			assert.equal(pulled, 2)

			assert.deepEqual(gen.next(), { value: 3, done: false })
			assert.equal(pulled, 3)
		})

		it('closes underlying iterator on early termination (break / return)', () => {
			let closed = false
			function* cleanableInfinite() {
				let i = 1
				try {
					while (true) {
						yield i * i * i
						i += 1
					}
				} finally {
					closed = true
				}
			}

			const collected = []
			for (const root of cbrtFloatLazy(cleanableInfinite())) {
				collected.push(root)
				if (collected.length === 3) break
			}

			assert.deepEqual(collected, [1, 2, 3])
			assert.equal(closed, true)
		})

		it('defers element validation errors until that element is requested', () => {
			function* mixedStream() {
				yield 8
				yield 27
				yield 'not-a-number'
				yield 64
			}

			const gen = cbrtFloatLazy(mixedStream())
			assert.deepEqual(gen.next(), { value: 2, done: false })
			assert.deepEqual(gen.next(), { value: 3, done: false })
			assert.throws(() => gen.next(), {
				name: 'TypeError',
				message: /index 2/,
			})
		})
	})

	describe('input validation', () => {
		it('eagerly rejects null, undefined, primitives, strings, and non-iterables', () => {
			const invalidInputs = [
				null,
				undefined,
				27,
				NaN,
				true,
				false,
				'27',
				'',
				{},
				{ length: 2, 0: 1, 1: 8 },
				27n,
				Symbol('iter'),
				() => [8],
			]

			for (const bad of invalidInputs) {
				assert.throws(() => cbrtFloatLazy(bad), TypeError)
			}
		})

		it('rejects non-number elements during iteration', () => {
			const invalidElements = [
				'8',
				null,
				undefined,
				true,
				27n,
				{},
				[8],
				Symbol('x'),
				new Number(8),
			]

			for (const bad of invalidElements) {
				assert.throws(() => [...cbrtFloatLazy([bad])], TypeError)
			}

			assert.throws(
				() => [...cbrtFloatLazy(new BigInt64Array([8n, 27n]))],
				TypeError
			)
		})
	})

	describe('independent cross-checks', () => {
		it('cubing results reproduces original inputs within float64 precision', () => {
			const samples = [
				-1e100,
				-123456.789,
				-10,
				-3,
				-0.5,
				-1e-100,
				1e-100,
				0.000123,
				0.5,
				2,
				3,
				7,
				42.42,
				123456.789,
				1e100,
			]

			const roots = [...cbrtFloatLazy(samples)]
			for (let i = 0; i < samples.length; i += 1) {
				const x = samples[i]
				const y = roots[i]
				const cubed = y * y * y
				const relError = Math.abs(cubed - x) / Math.abs(x)
				assert.ok(
					relError <= 4 * Number.EPSILON,
					`Expected cubed root of ${x} to match within 4*EPSILON, got relError=${relError}`
				)
			}
		})

		it('matches independent Halley method reference across diverse float64 values', () => {
			const samples = [
				-1e150,
				-98765.4321,
				-Math.E,
				-0.1,
				-1e-150,
				1e-150,
				0.1,
				Math.SQRT2,
				Math.PI,
				98765.4321,
				1e150,
			]

			const roots = [...cbrtFloatLazy(samples)]
			for (let i = 0; i < samples.length; i += 1) {
				const expected = halleyCbrt(samples[i])
				const relError = Math.abs(roots[i] - expected) / Math.abs(expected)
				assert.ok(
					relError <= 2 * Number.EPSILON,
					`Mismatch at x=${samples[i]}: got ${roots[i]}, ref ${expected}, relError=${relError}`
				)
			}
		})
	})
})
