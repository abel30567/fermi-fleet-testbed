import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cosFloatLazy } from './cosFloatLazy.js'

const EPS = 1e-12

/**
 * Independent cosine approximation using range reduction to [-pi, pi]
 * followed by a Maclaurin series expansion:
 *   cos(x) = sum_{k=0}^{n} (-1)^k * x^(2k) / (2k)!
 */
function taylorCos(x, terms = 18) {
	const twoPi = 2 * Math.PI
	let r = x % twoPi
	if (r > Math.PI) r -= twoPi
	if (r < -Math.PI) r += twoPi

	let sum = 1
	let term = 1
	const r2 = r * r
	for (let k = 1; k < terms; k++) {
		term *= -r2 / ((2 * k - 1) * (2 * k))
		sum += term
	}
	return sum
}

describe('cosFloatLazy', () => {
	describe('normal cases', () => {
		test('computes cosine at standard angles', () => {
			const inputs = [
				0,
				Math.PI / 6,
				Math.PI / 4,
				Math.PI / 3,
				Math.PI / 2,
				Math.PI,
				(3 * Math.PI) / 2,
				2 * Math.PI,
			]
			const expected = [
				1,
				Math.sqrt(3) / 2,
				Math.SQRT1_2,
				0.5,
				0,
				-1,
				0,
				1,
			]

			const actual = [...cosFloatLazy(inputs)]
			assert.equal(actual.length, expected.length)
			for (let i = 0; i < expected.length; i++) {
				assert.ok(
					Math.abs(actual[i] - expected[i]) < EPS,
					`index ${i}: expected ~${expected[i]}, got ${actual[i]}`
				)
			}
		})

		test('supports various iterable types (Float64Array, Set, generator, custom iterable)', () => {
			const typed = new Float64Array([0, Math.PI])
			assert.deepEqual([...cosFloatLazy(typed)], [1, -1])

			const set = new Set([0, Math.PI])
			assert.deepEqual([...cosFloatLazy(set)], [1, -1])

			function* gen() {
				yield 0
				yield Math.PI
			}
			assert.deepEqual([...cosFloatLazy(gen())], [1, -1])

			const customIterable = {
				*[Symbol.iterator]() {
					yield 0
					yield -Math.PI
				},
			}
			assert.deepEqual([...cosFloatLazy(customIterable)], [1, -1])
		})

		test('handles negative angles and satisfies even-function symmetry cos(-x) === cos(x)', () => {
			const angles = [0.1, 0.75, 1.5, 2.3, 4.2, 10.5, 100.25]
			const pos = [...cosFloatLazy(angles)]
			const neg = [...cosFloatLazy(angles.map((x) => -x))]
			assert.deepEqual(pos, neg)
		})
	})

	describe('edge cases', () => {
		test('empty iterable yields nothing', () => {
			assert.deepEqual([...cosFloatLazy([])], [])
		})

		test('handles +0 and -0 identically (cos(±0) === 1)', () => {
			const result = [...cosFloatLazy([0, -0])]
			assert.equal(result.length, 2)
			assert.ok(Object.is(result[0], 1))
			assert.ok(Object.is(result[1], 1))
		})

		test('handles IEEE-754 special float64 values (NaN, Infinity, -Infinity)', () => {
			const result = [...cosFloatLazy([NaN, Infinity, -Infinity])]
			assert.equal(result.length, 3)
			assert.ok(Number.isNaN(result[0]))
			assert.ok(Number.isNaN(result[1]))
			assert.ok(Number.isNaN(result[2]))
		})

		test('handles subnormals, tiny values, and very large finite float64 values', () => {
			const inputs = [
				Number.MIN_VALUE,
				-Number.MIN_VALUE,
				Number.EPSILON,
				1e15,
				Number.MAX_VALUE,
				-Number.MAX_VALUE,
			]
			const results = [...cosFloatLazy(inputs)]
			assert.equal(results.length, inputs.length)
			assert.equal(results[0], 1)
			assert.equal(results[1], 1)
			assert.equal(results[2], 1)
			for (let i = 0; i < inputs.length; i++) {
				assert.ok(Number.isFinite(results[i]))
				assert.ok(results[i] >= -1 && results[i] <= 1)
				assert.equal(results[i], Math.cos(inputs[i]))
			}
		})
	})

	describe('input validation', () => {
		test('eagerly throws TypeError for non-iterable or string inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				42,
				true,
				false,
				123n,
				Symbol('x'),
				{},
				{ length: 2 },
				'0123',
				'',
			]
			for (const bad of invalidInputs) {
				assert.throws(() => cosFloatLazy(bad), {
					name: 'TypeError',
				})
			}
		})

		test('throws TypeError when an iterable yields a non-number element', () => {
			const badElements = [
				'0',
				null,
				undefined,
				true,
				1n,
				{},
				[],
				Symbol('rad'),
			]
			for (const bad of badElements) {
				assert.throws(() => [...cosFloatLazy([0, bad])], {
					name: 'TypeError',
				})
			}
		})
	})

	describe('lazy streaming behavior', () => {
		test('returns an iterable iterator (generator)', () => {
			const stream = cosFloatLazy([0, Math.PI])
			assert.equal(typeof stream.next, 'function')
			assert.equal(typeof stream.return, 'function')
			assert.equal(stream[Symbol.iterator](), stream)
		})

		test('does not pull from source until next() is called, and pulls strictly on demand', () => {
			let pulled = 0
			function* source() {
				for (const v of [0, Math.PI / 2, Math.PI, 2 * Math.PI]) {
					pulled++
					yield v
				}
			}

			const stream = cosFloatLazy(source())
			assert.equal(pulled, 0)

			const first = stream.next()
			assert.equal(pulled, 1)
			assert.deepEqual(first, { value: 1, done: false })

			const second = stream.next()
			assert.equal(pulled, 2)
			assert.ok(Math.abs(second.value) < EPS)
			assert.equal(second.done, false)

			const third = stream.next()
			assert.equal(pulled, 3)
			assert.deepEqual(third, { value: -1, done: false })
		})

		test('consumes infinite sequences lazily without hanging', () => {
			function* infiniteAngles() {
				let k = 0
				while (true) {
					yield k * Math.PI
					k++
				}
			}

			const stream = cosFloatLazy(infiniteAngles())
			const firstFive = []
			for (let i = 0; i < 5; i++) {
				firstFive.push(stream.next().value)
			}
			assert.deepEqual(firstFive, [1, -1, 1, -1, 1])
		})

		test('closes upstream generator on early termination', () => {
			let closed = false
			function* trackedSource() {
				try {
					let i = 0
					while (true) {
						yield i * Math.PI
						i++
					}
				} finally {
					closed = true
				}
			}

			const collected = []
			for (const c of cosFloatLazy(trackedSource())) {
				collected.push(c)
				if (collected.length === 3) break
			}

			assert.deepEqual(collected, [1, -1, 1])
			assert.equal(closed, true)
		})

		test('validates elements lazily so stopping before an invalid element succeeds', () => {
			function* mixedSource() {
				yield 0
				yield Math.PI
				yield 'not-a-number'
			}

			const stream = cosFloatLazy(mixedSource())
			assert.equal(stream.next().value, 1)
			assert.equal(stream.next().value, -1)
			assert.throws(() => stream.next(), { name: 'TypeError' })
		})
	})

	describe('independent cross-checks', () => {
		test('matches independent Maclaurin/Taylor series cosine across [-20, 20]', () => {
			const samples = []
			for (let x = -20; x <= 20; x += 0.37) {
				samples.push(x)
			}

			const results = [...cosFloatLazy(samples)]
			for (let i = 0; i < samples.length; i++) {
				const ref = taylorCos(samples[i])
				assert.ok(
					Math.abs(results[i] - ref) < 1e-13,
					`x=${samples[i]}: cosFloatLazy=${results[i]}, taylorCos=${ref}`
				)
			}
		})

		test('satisfies Pythagorean identity cos^2(x) + sin^2(x) = 1 and double-angle identity cos(2x) = 2cos^2(x) - 1', () => {
			const angles = [-7.3, -2.5, -0.4, 0, 0.4, 1.234567, 3.7, 9.81]
			const cosX = [...cosFloatLazy(angles)]
			const cos2X = [...cosFloatLazy(angles.map((x) => 2 * x))]

			for (let i = 0; i < angles.length; i++) {
				const sinX = Math.sin(angles[i])
				const pythagorean = cosX[i] * cosX[i] + sinX * sinX
				assert.ok(
					Math.abs(pythagorean - 1) < 1e-15,
					`Pythagorean failed for x=${angles[i]}: ${pythagorean}`
				)

				const doubleAngle = 2 * cosX[i] * cosX[i] - 1
				assert.ok(
					Math.abs(cos2X[i] - doubleAngle) < 1e-14,
					`Double-angle failed for x=${angles[i]}: ${cos2X[i]} vs ${doubleAngle}`
				)
			}
		})
	})
})
