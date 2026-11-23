import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arccosFloatLazy } from './arccosFloatLazy.js'

const EPS = 1e-15

function assertClose(actual, expected, tol = EPS, message) {
	assert.equal(typeof actual, 'number')
	assert.ok(
		Math.abs(actual - expected) <= tol,
		message ??
			`Expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

describe('arccosFloatLazy', () => {
	describe('normal cases', () => {
		test('computes exact and standard analytical values in [-1, 1]', () => {
			const inputs = [
				1,
				Math.SQRT2 / 2,
				0.5,
				0,
				-0.5,
				-Math.SQRT2 / 2,
				-1,
			]
			const expected = [
				0,
				Math.PI / 4,
				Math.PI / 3,
				Math.PI / 2,
				(2 * Math.PI) / 3,
				(3 * Math.PI) / 4,
				Math.PI,
			]

			const results = [...arccosFloatLazy(inputs)]
			assert.equal(results.length, expected.length)
			for (let i = 0; i < expected.length; i++) {
				assertClose(results[i], expected[i], 1e-15)
			}
		})

		test('computes pi/6 and 5*pi/6 from +/- sqrt(3)/2', () => {
			const halfSqrt3 = Math.sqrt(3) / 2
			const [a, b] = [...arccosFloatLazy([halfSqrt3, -halfSqrt3])]
			assertClose(a, Math.PI / 6, 1e-15)
			assertClose(b, (5 * Math.PI) / 6, 1e-15)
		})

		test('supports Float64Array, Set, Map values, and custom iterables', () => {
			const typed = new Float64Array([1, 0, -1])
			assert.deepEqual([...arccosFloatLazy(typed)], [0, Math.PI / 2, Math.PI])

			const set = new Set([0, 1])
			assert.deepEqual([...arccosFloatLazy(set)], [Math.PI / 2, 0])

			const map = new Map([
				['a', -1],
				['b', 0],
			])
			assert.deepEqual([...arccosFloatLazy(map.values())], [Math.PI, Math.PI / 2])

			const customIterable = {
				*[Symbol.iterator]() {
					yield 0.5
					yield -0.5
				},
			}
			const customOut = [...arccosFloatLazy(customIterable)]
			assertClose(customOut[0], Math.PI / 3, 1e-15)
			assertClose(customOut[1], (2 * Math.PI) / 3, 1e-15)
		})
	})

	describe('edge cases', () => {
		test('handles empty iterables', () => {
			const gen = arccosFloatLazy([])
			assert.deepEqual(gen.next(), { value: undefined, done: true })
			assert.deepEqual([...arccosFloatLazy(new Float64Array(0))], [])
		})

		test('handles +0 and -0 identically and returns +0 for arccos(1)', () => {
			const [posZero, negZero, one] = [...arccosFloatLazy([0, -0, 1])]
			assert.equal(posZero, Math.PI / 2)
			assert.equal(negZero, Math.PI / 2)
			assert.ok(Object.is(one, +0))
		})

		test('handles subnormals and boundary-adjacent IEEE-754 float64 values', () => {
			const nearOne = 1 - Number.EPSILON / 2
			const nearNegOne = -1 + Number.EPSILON / 2
			const inputs = [
				Number.MIN_VALUE,
				-Number.MIN_VALUE,
				nearOne,
				nearNegOne,
			]
			const [subPos, subNeg, hi, lo] = [...arccosFloatLazy(inputs)]

			assert.equal(subPos, Math.PI / 2)
			assert.equal(subNeg, Math.PI / 2)
			assert.ok(hi > 0 && hi < 1e-7)
			assert.ok(lo < Math.PI && Math.PI - lo < 1e-7)
		})

		test('result is strictly monotonically decreasing on [-1, 1]', () => {
			const steps = 100
			const xs = Array.from({ length: steps + 1 }, (_, i) => -1 + (2 * i) / steps)
			const ys = [...arccosFloatLazy(xs)]
			for (let i = 1; i < ys.length; i++) {
				assert.ok(
					ys[i] < ys[i - 1],
					`Expected strictly decreasing: ys[${i}]=${ys[i]} < ys[${i - 1}]=${ys[i - 1]}`
				)
			}
		})
	})

	describe('input validation', () => {
		test('synchronously throws TypeError for non-iterable or string inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				0,
				0.5,
				true,
				false,
				Symbol('x'),
				1n,
				{},
				{ length: 1, 0: 0 },
				'0',
				'',
				new String('0'),
			]
			for (const bad of invalidInputs) {
				assert.throws(
					() => arccosFloatLazy(bad),
					{ name: 'TypeError' },
					`Expected TypeError for ${String(bad)}`
				)
			}
		})

		test('lazily throws TypeError for non-number elements', () => {
			const invalidElements = ['0.5', null, undefined, true, {}, [], 0n, Symbol('n')]
			for (const bad of invalidElements) {
				const gen = arccosFloatLazy([0, bad, 1])
				// First valid element succeeds before encountering invalid element
				assert.deepEqual(gen.next(), { value: Math.PI / 2, done: false })
				assert.throws(() => gen.next(), { name: 'TypeError' })
			}
		})

		test('lazily throws RangeError for out-of-domain and non-finite numbers', () => {
			const outOfDomain = [
				1.0000000000000002,
				-1.0000000000000002,
				2,
				-2,
				Infinity,
				-Infinity,
				NaN,
			]
			for (const bad of outOfDomain) {
				const gen = arccosFloatLazy([1, bad, 0])
				assert.deepEqual(gen.next(), { value: 0, done: false })
				assert.throws(() => gen.next(), { name: 'RangeError' })
			}
		})
	})

	describe('lazy streaming behavior', () => {
		test('does not pull from source until next() is invoked and pulls strictly one element per step', () => {
			let pulled = 0
			function* trackedSource() {
				const data = [1, 0, -1, 0.5]
				for (const v of data) {
					pulled += 1
					yield v
				}
			}

			const stream = arccosFloatLazy(trackedSource())
			assert.equal(pulled, 0, 'Nothing should be pulled before first next()')

			const first = stream.next()
			assert.equal(pulled, 1)
			assert.deepEqual(first, { value: 0, done: false })

			const second = stream.next()
			assert.equal(pulled, 2)
			assert.deepEqual(second, { value: Math.PI / 2, done: false })
		})

		test('supports infinite iterables without buffering or hanging', () => {
			function* infiniteCosines() {
				let n = 0
				while (true) {
					yield Math.cos(n * 0.1)
					n += 1
				}
			}

			const stream = arccosFloatLazy(infiniteCosines())
			const firstFive = []
			for (const val of stream) {
				firstFive.push(val)
				if (firstFive.length === 5) break
			}

			assert.equal(firstFive.length, 5)
			for (let i = 0; i < 5; i++) {
				assertClose(firstFive[i], i * 0.1, 1e-14)
			}
		})

		test('closes upstream iterator cleanly on early termination and on validation error', () => {
			let closedOnBreak = false
			function* closableSource() {
				try {
					yield 1
					yield 0
					yield -1
				} finally {
					closedOnBreak = true
				}
			}

			for (const val of arccosFloatLazy(closableSource())) {
				assert.equal(val, 0)
				break
			}
			assert.equal(closedOnBreak, true)

			let closedOnError = false
			function* erroringSource() {
				try {
					yield 0
					yield 2 // out of domain -> RangeError
					yield 1
				} finally {
					closedOnError = true
				}
			}

			const gen = arccosFloatLazy(erroringSource())
			assert.equal(gen.next().value, Math.PI / 2)
			assert.throws(() => gen.next(), { name: 'RangeError' })
			assert.equal(closedOnError, true)
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('cross-check against half-angle atan2 identity: 2 * atan2(sqrt(1 - x), sqrt(1 + x))', () => {
			// Independent formula well-conditioned across all of [-1, 1] including endpoints
			const independentArccos = (x) =>
				2 * Math.atan2(Math.sqrt(1 - x), Math.sqrt(1 + x))

			const samples = []
			for (let i = -200; i <= 200; i++) {
				samples.push(i / 200)
			}

			let idx = 0
			for (const actual of arccosFloatLazy(samples)) {
				const x = samples[idx++]
				assertClose(actual, independentArccos(x), 1e-14)
			}
		})

		test('cross-check against cos(arccos(x)) = x and symmetry arccos(x) + arccos(-x) = pi', () => {
			const samples = [-1, -0.9999, -0.75, -0.25, -1e-8, 0, 1e-8, 0.25, 0.75, 0.9999, 1]
			const pos = [...arccosFloatLazy(samples)]
			const neg = [...arccosFloatLazy(samples.map((x) => -x))]

			for (let i = 0; i < samples.length; i++) {
				assertClose(Math.cos(pos[i]), samples[i], 1e-14)
				assertClose(pos[i] + neg[i], Math.PI, 1e-14)
			}
		})

		test('cross-check against truncated Maclaurin series near 0', () => {
			// arccos(x) = pi/2 - sum_{k=0}^{N} ((2k)! / (4^k * (k!)^2 * (2k+1))) * x^(2k+1)
			const maclaurinArccos = (x, terms = 12) => {
				let sum = 0
				let coeff = 1 // k = 0: 1
				let xPow = x
				for (let k = 0; k < terms; k++) {
					sum += (coeff / (2 * k + 1)) * xPow
					coeff *= (2 * k + 1) / (2 * k + 2)
					xPow *= x * x
				}
				return Math.PI / 2 - sum
			}

			const nearZero = [-0.2, -0.1, -0.05, -0.001, 0, 0.001, 0.05, 0.1, 0.2]
			const actual = [...arccosFloatLazy(nearZero)]
			for (let i = 0; i < nearZero.length; i++) {
				assertClose(actual[i], maclaurinArccos(nearZero[i]), 1e-15)
			}
		})
	})
})
