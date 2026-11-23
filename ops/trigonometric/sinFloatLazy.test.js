import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sinFloatLazy } from './sinFloatLazy.js'

/**
 * Independent Maclaurin/Taylor series approximation of sin(x) for cross-checking
 * without calling Math.sin. Reduces x into [-pi, pi] before summing terms.
 *
 * @param {number} x
 * @returns {number}
 */
function taylorSin(x) {
	const TWO_PI = 2 * Math.PI
	// Range reduction into [-pi, pi]
	let r = x % TWO_PI
	if (r > Math.PI) r -= TWO_PI
	if (r < -Math.PI) r += TWO_PI

	let term = r
	let sum = r
	const r2 = r * r
	for (let k = 1; k <= 16; k += 1) {
		term = (-term * r2) / ((2 * k) * (2 * k + 1))
		sum += term
	}
	return sum
}

describe('sinFloatLazy', () => {
	describe('normal cases', () => {
		it('computes sine for standard angles in an array', () => {
			const inputs = [
				0,
				Math.PI / 6,
				Math.PI / 4,
				Math.PI / 3,
				Math.PI / 2,
				Math.PI,
				(3 * Math.PI) / 2,
				2 * Math.PI,
				-Math.PI / 2,
				-Math.PI / 6,
			]
			const expected = [
				0,
				0.5,
				Math.SQRT1_2,
				Math.sqrt(3) / 2,
				1,
				0,
				-1,
				0,
				-1,
				-0.5,
			]

			const results = [...sinFloatLazy(inputs)]
			assert.equal(results.length, expected.length)
			for (let i = 0; i < expected.length; i += 1) {
				assert.ok(
					Math.abs(results[i] - expected[i]) < 1e-15,
					`index ${i}: expected ~${expected[i]}, got ${results[i]}`
				)
			}
		})

		it('accepts diverse iterable types (Float64Array, Int32Array, Set, Generator, custom iterable)', () => {
			const f64 = new Float64Array([0, Math.PI / 2, -Math.PI / 2])
			assert.deepEqual([...sinFloatLazy(f64)], [0, 1, -1])

			const i32 = new Int32Array([0, 1, -1])
			assert.deepEqual([...sinFloatLazy(i32)], [0, Math.sin(1), Math.sin(-1)])

			const set = new Set([0, Math.PI / 2])
			assert.deepEqual([...sinFloatLazy(set)], [0, 1])

			function* gen() {
				yield 0
				yield Math.PI / 2
			}
			assert.deepEqual([...sinFloatLazy(gen())], [0, 1])

			const customIterable = {
				[Symbol.iterator]() {
					const items = [0, 0.5, 1]
					let i = 0
					return {
						next() {
							return i < items.length
								? { value: items[i++], done: false }
								: { value: undefined, done: true }
						},
					}
				},
			}
			assert.deepEqual(
				[...sinFloatLazy(customIterable)],
				[0, Math.sin(0.5), Math.sin(1)]
			)
		})

		it('handles empty iterables cleanly', () => {
			assert.deepEqual([...sinFloatLazy([])], [])
			function* empty() {}
			assert.deepEqual([...sinFloatLazy(empty())], [])
		})
	})

	describe('edge cases (IEEE-754 float64)', () => {
		it('preserves signed zero (+0 and -0)', () => {
			const [posZero, negZero] = [...sinFloatLazy([+0, -0])]
			assert.ok(Object.is(posZero, +0), 'sin(+0) must be +0')
			assert.ok(Object.is(negZero, -0), 'sin(-0) must be -0')
		})

		it('handles subnormal and tiny values accurately (sin(x) === x)', () => {
			const tiny = [Number.MIN_VALUE, -Number.MIN_VALUE, 1e-300, -1e-300, 1e-16]
			const results = [...sinFloatLazy(tiny)]
			for (let i = 0; i < tiny.length; i += 1) {
				assert.ok(
					Object.is(results[i], tiny[i]),
					`expected sin(${tiny[i]}) to equal ${tiny[i]}, got ${results[i]}`
				)
			}
		})

		it('handles non-finite IEEE-754 values (NaN, Infinity, -Infinity)', () => {
			const results = [...sinFloatLazy([NaN, Infinity, -Infinity])]
			assert.equal(results.length, 3)
			for (const r of results) {
				assert.ok(Number.isNaN(r), `expected NaN, got ${r}`)
			}
		})

		it('handles very large finite float64 values within [-1, 1]', () => {
			const large = [1e6, -1e6, 1e12, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE]
			const results = [...sinFloatLazy(large)]
			assert.equal(results.length, large.length)
			for (const r of results) {
				assert.ok(Number.isFinite(r), `expected finite result, got ${r}`)
				assert.ok(r >= -1 && r <= 1, `expected result in [-1, 1], got ${r}`)
			}
		})
	})

	describe('input validation', () => {
		it('throws TypeError eagerly for non-iterable or string outer inputs', () => {
			const invalidOuter = [
				null,
				undefined,
				42,
				NaN,
				true,
				false,
				10n,
				Symbol('x'),
				'123',
				'',
				{},
				{ [Symbol.iterator]: 123 },
			]

			for (const bad of invalidOuter) {
				assert.throws(
					() => sinFloatLazy(bad),
					TypeError,
					`expected TypeError for outer input ${String(bad)}`
				)
			}
		})

		it('throws TypeError lazily when encountering a non-number element', () => {
			const invalidElements = ['0', '1.5', null, undefined, true, 1n, {}, [], Symbol('s')]

			for (const bad of invalidElements) {
				const gen = sinFloatLazy([0, bad, 1])
				const first = gen.next()
				assert.equal(first.done, false)
				assert.equal(first.value, 0)
				assert.throws(
					() => gen.next(),
					TypeError,
					`expected TypeError for element ${String(bad)}`
				)
			}
		})
	})

	describe('lazy streaming behavior', () => {
		it('does not pull from source until .next() is called and pulls strictly one element per step', () => {
			let pulled = 0
			let iteratorCreated = false
			const source = {
				[Symbol.iterator]() {
					iteratorCreated = true
					const values = [0, Math.PI / 6, Math.PI / 2, Math.PI]
					let i = 0
					return {
						next() {
							if (i < values.length) {
								pulled += 1
								return { value: values[i++], done: false }
							}
							return { value: undefined, done: true }
						},
					}
				},
			}

			const stream = sinFloatLazy(source)
			assert.equal(iteratorCreated, false, 'iterator should not be opened eagerly')
			assert.equal(pulled, 0, 'no elements should be pulled before first .next()')

			const step1 = stream.next()
			assert.equal(pulled, 1)
			assert.equal(step1.value, 0)
			assert.equal(step1.done, false)

			const step2 = stream.next()
			assert.equal(pulled, 2)
			assert.ok(Math.abs(step2.value - 0.5) < 1e-15)
			assert.equal(step2.done, false)
		})

		it('supports infinite generators without hanging or buffering all values', () => {
			function* infiniteAngles() {
				let n = 0
				while (true) {
					yield (n * Math.PI) / 2
					n += 1
				}
			}

			const taken = []
			for (const val of sinFloatLazy(infiniteAngles())) {
				taken.push(val)
				if (taken.length === 5) break
			}

			const expected = [0, 1, 0, -1, 0]
			assert.equal(taken.length, 5)
			for (let i = 0; i < expected.length; i += 1) {
				assert.ok(Math.abs(taken[i] - expected[i]) < 1e-15)
			}
		})

		it('propagates early termination cleanup to underlying generator', () => {
			let cleanedUp = false
			let produced = 0
			function* trackedSource() {
				try {
					while (true) {
						produced += 1
						yield produced * 0.25
					}
				} finally {
					cleanedUp = true
				}
			}

			const results = []
			for (const val of sinFloatLazy(trackedSource())) {
				results.push(val)
				if (results.length === 3) break
			}

			assert.equal(results.length, 3)
			assert.equal(produced, 3)
			assert.equal(cleanedUp, true, 'source generator finally block should execute on early break')
		})

		it('returns a standard iterable generator that composes lazily', () => {
			const gen = sinFloatLazy([0, 1])
			assert.equal(gen[Symbol.iterator](), gen)

			const composed = [...sinFloatLazy(sinFloatLazy([0, Math.PI / 2]))]
			assert.equal(composed[0], 0)
			assert.ok(Math.abs(composed[1] - Math.sin(1)) < 1e-15)
		})
	})

	describe('independent cross-checks', () => {
		it('agrees with an independent Taylor series implementation across [-2pi, 2pi]', () => {
			const samples = []
			for (let i = -40; i <= 40; i += 1) {
				samples.push((i / 40) * 2 * Math.PI)
			}

			const actual = [...sinFloatLazy(samples)]
			for (let i = 0; i < samples.length; i += 1) {
				const ref = taylorSin(samples[i])
				assert.ok(
					Math.abs(actual[i] - ref) < 1e-14,
					`at x=${samples[i]}: sinFloatLazy=${actual[i]}, taylorSin=${ref}`
				)
			}
		})

		it('satisfies trigonometric identities (triple-angle, odd symmetry, Pythagorean)', () => {
			const xs = [-2.7, -1.234, -0.5, 0.123, 0.789, 1.5, 2.9]
			const sinX = [...sinFloatLazy(xs)]
			const sinNegX = [...sinFloatLazy(xs.map((x) => -x))]
			const sin3X = [...sinFloatLazy(xs.map((x) => 3 * x))]

			for (let i = 0; i < xs.length; i += 1) {
				// Odd function identity: sin(-x) === -sin(x)
				assert.equal(sinNegX[i], -sinX[i])

				// Triple-angle identity: sin(3x) = 3*sin(x) - 4*sin^3(x)
				const rhs = 3 * sinX[i] - 4 * sinX[i] ** 3
				assert.ok(
					Math.abs(sin3X[i] - rhs) < 1e-14,
					`triple-angle mismatch at x=${xs[i]}: ${sin3X[i]} vs ${rhs}`
				)

				// Pythagorean identity: sin^2(x) + cos^2(x) = 1
				const pyth = sinX[i] ** 2 + Math.cos(xs[i]) ** 2
				assert.ok(
					Math.abs(pyth - 1) < 1e-15,
					`Pythagorean identity mismatch at x=${xs[i]}: ${pyth}`
				)
			}
		})
	})
})
