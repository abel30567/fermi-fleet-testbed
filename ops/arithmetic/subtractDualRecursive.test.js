import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { subtractDualRecursive } from './subtractDualRecursive.js'

describe('subtractDualRecursive', () => {
	describe('binary subtraction (normal cases)', () => {
		test('subtracts two positive dual numbers', () => {
			const res = subtractDualRecursive({ v: 10, d: 4 }, { v: 3, d: 1.5 })
			assert.deepEqual(res, { v: 7, d: 2.5 })
		})

		test('subtracts floating-point dual numbers accurately', () => {
			const res = subtractDualRecursive({ v: 5.75, d: -2.25 }, { v: 1.25, d: 3.5 })
			assert.deepEqual(res, { v: 4.5, d: -5.75 })
		})

		test('does not mutate input dual objects and returns a new object', () => {
			const a = { v: 8, d: 3 }
			const b = { v: 2, d: 1 }
			const res = subtractDualRecursive(a, b)
			assert.deepEqual(a, { v: 8, d: 3 })
			assert.deepEqual(b, { v: 2, d: 1 })
			assert.notEqual(res, a)
			assert.notEqual(res, b)
		})

		test('ignores extra enumerable properties on input objects and returns only { v, d }', () => {
			const res = subtractDualRecursive({ v: 9, d: 5, label: 'a' }, { v: 4, d: 2, extra: true })
			assert.deepEqual(res, { v: 5, d: 3 })
			assert.deepEqual(Object.keys(res).sort(), ['d', 'v'])
		})
	})

	describe('variadic / chained subtraction', () => {
		test('subtracts three dual numbers: a - b - c', () => {
			const res = subtractDualRecursive({ v: 20, d: 10 }, { v: 5, d: 3 }, { v: 4, d: 2 })
			assert.deepEqual(res, { v: 11, d: 5 })
		})

		test('subtracts four dual numbers with mixed signs', () => {
			const res = subtractDualRecursive(
				{ v: 10, d: -1 },
				{ v: 3, d: 2 },
				{ v: -4, d: -5 },
				{ v: 6, d: 1 }
			)
			assert.deepEqual(res, { v: 5, d: 1 })
		})

		test('handles many subtrahends via divide-and-conquer tree', () => {
			const minuend = { v: 1000, d: 500 }
			const subtrahends = Array.from({ length: 128 }, (_, i) => ({
				v: (i % 7) - 3,
				d: (i % 5) - 2
			}))
			const expectedV = minuend.v - subtrahends.reduce((acc, s) => acc + s.v, 0)
			const expectedD = minuend.d - subtrahends.reduce((acc, s) => acc + s.d, 0)

			const res = subtractDualRecursive(minuend, ...subtrahends)
			assert.deepEqual(res, { v: expectedV, d: expectedD })
		})
	})

	describe('edge cases', () => {
		test('zeros: subtracting zero and subtracting from zero', () => {
			const zero = { v: 0, d: 0 }
			const a = { v: 4.25, d: -1.75 }

			assert.deepEqual(subtractDualRecursive(a, zero), { v: 4.25, d: -1.75 })
			assert.deepEqual(subtractDualRecursive(zero, a), { v: -4.25, d: 1.75 })
			assert.deepEqual(subtractDualRecursive(zero, zero), { v: 0, d: 0 })
		})

		test('normalizes negative zero (-0) to positive zero (0)', () => {
			const res = subtractDualRecursive({ v: -0, d: -0 }, { v: 0, d: 0 })
			assert.equal(Object.is(res.v, 0), true)
			assert.equal(Object.is(res.d, 0), true)
		})

		test('negatives: subtracting negative values and derivatives', () => {
			const res = subtractDualRecursive({ v: -5, d: -3 }, { v: -8, d: -10 })
			assert.deepEqual(res, { v: 3, d: 7 })
		})

		test('self-subtraction yields zero dual number', () => {
			const samples = [
				{ v: 0, d: 0 },
				{ v: 42, d: -7 },
				{ v: -3.14159, d: 2.71828 }
			]
			for (const a of samples) {
				const res = subtractDualRecursive(a, a)
				assert.equal(Object.is(res.v, 0), true)
				assert.equal(Object.is(res.d, 0), true)
			}
		})

		test('triple self-subtraction (a - a - a) yields negation (-a)', () => {
			const a = { v: 7.5, d: -2.5 }
			assert.deepEqual(subtractDualRecursive(a, a, a), { v: -7.5, d: 2.5 })
		})

		test('anticommutativity: sub(a, b) equals negation of sub(b, a)', () => {
			const a = { v: 13.5, d: -4.25 }
			const b = { v: -6.25, d: 9.75 }
			const ab = subtractDualRecursive(a, b)
			const ba = subtractDualRecursive(b, a)
			assert.deepEqual(ab, { v: -ba.v, d: -ba.d })
		})
	})

	describe('input validation', () => {
		test('throws TypeError when fewer than 2 arguments are provided', () => {
			assert.throws(() => subtractDualRecursive(), TypeError)
			assert.throws(() => subtractDualRecursive({ v: 1, d: 0 }), TypeError)
		})

		test('throws TypeError for non-object or array arguments', () => {
			const invalidArgs = [null, undefined, 42, 'dual', true, [1, 2], () => {}]
			for (const bad of invalidArgs) {
				assert.throws(() => subtractDualRecursive(bad, { v: 1, d: 1 }), TypeError)
				assert.throws(() => subtractDualRecursive({ v: 1, d: 1 }, bad), TypeError)
				assert.throws(() => subtractDualRecursive({ v: 1, d: 1 }, { v: 2, d: 2 }, bad), TypeError)
			}
		})

		test('throws TypeError when v or d is missing or not a number', () => {
			const badObjects = [
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 1, d: '0' },
				{ v: null, d: 0 },
				{ v: 1, d: undefined },
				{ v: true, d: 0 }
			]
			for (const bad of badObjects) {
				assert.throws(() => subtractDualRecursive(bad, { v: 1, d: 0 }), TypeError)
				assert.throws(() => subtractDualRecursive({ v: 1, d: 0 }, bad), TypeError)
			}
		})

		test('throws RangeError for non-finite v or d values (NaN, Infinity, -Infinity)', () => {
			const nonFinite = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: 1, d: Number.NEGATIVE_INFINITY }
			]
			for (const bad of nonFinite) {
				assert.throws(() => subtractDualRecursive(bad, { v: 1, d: 0 }), RangeError)
				assert.throws(() => subtractDualRecursive({ v: 1, d: 0 }, bad), RangeError)
				assert.throws(() => subtractDualRecursive({ v: 1, d: 0 }, { v: 2, d: 1 }, bad), RangeError)
			}
		})
	})

	describe('finite-difference cross-checks', () => {
		test('matches independent central finite differences for f(x) = g(x) - h(x)', () => {
			const g = (x) => Math.sin(x) * x * x
			const gPrime = (x) => 2 * x * Math.sin(x) + x * x * Math.cos(x)

			const h = (x) => Math.exp(0.5 * x) + Math.cos(x)
			const hPrime = (x) => 0.5 * Math.exp(0.5 * x) - Math.sin(x)

			const f = (x) => g(x) - h(x)
			const eps = 1e-6

			const xs = [-2.5, -0.75, 0, 0.5, 1.8, 3.2]
			for (const x of xs) {
				const dualG = { v: g(x), d: gPrime(x) }
				const dualH = { v: h(x), d: hPrime(x) }
				const result = subtractDualRecursive(dualG, dualH)

				const expectedVal = f(x)
				const centralDiff = (f(x + eps) - f(x - eps)) / (2 * eps)

				assert.ok(
					Math.abs(result.v - expectedVal) < 1e-12,
					`value mismatch at x=${x}: got ${result.v}, expected ${expectedVal}`
				)
				assert.ok(
					Math.abs(result.d - centralDiff) < 1e-7,
					`derivative mismatch at x=${x}: got ${result.d}, centralDiff ${centralDiff}`
				)
			}
		})

		test('matches central finite differences for chained variadic f(x) = g0(x) - g1(x) - g2(x) - g3(x)', () => {
			const terms = [
				{ fn: (x) => x * x * x, dfn: (x) => 3 * x * x },
				{ fn: (x) => Math.sin(2 * x), dfn: (x) => 2 * Math.cos(2 * x) },
				{ fn: (x) => Math.log(x * x + 1), dfn: (x) => (2 * x) / (x * x + 1) },
				{ fn: (x) => Math.exp(-0.25 * x), dfn: (x) => -0.25 * Math.exp(-0.25 * x) }
			]
			const f = (x) => terms[0].fn(x) - terms[1].fn(x) - terms[2].fn(x) - terms[3].fn(x)
			const eps = 1e-6

			for (const x of [-1.5, 0.25, 2.1]) {
				const duals = terms.map(({ fn, dfn }) => ({ v: fn(x), d: dfn(x) }))
				const result = subtractDualRecursive(...duals)
				const centralDiff = (f(x + eps) - f(x - eps)) / (2 * eps)

				assert.ok(Math.abs(result.v - f(x)) < 1e-12)
				assert.ok(Math.abs(result.d - centralDiff) < 1e-7)
			}
		})
	})
})
