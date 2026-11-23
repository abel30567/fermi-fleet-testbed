import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { addDualSeries } from './addDualSeries.js'

describe('addDualSeries', () => {
	test('adds two positive dual numbers', () => {
		const res = addDualSeries({ v: 2, d: 3 }, { v: 5, d: 7 })
		assert.deepStrictEqual(res, { v: 7, d: 10 })
	})

	test('adds negative and mixed-sign dual numbers', () => {
		const res = addDualSeries({ v: -4.5, d: 1.25 }, { v: 2.5, d: -3.75 })
		assert.deepStrictEqual(res, { v: -2, d: -2.5 })
	})

	test('handles additive identity { v: 0, d: 0 }', () => {
		const a = { v: 42, d: -1.5 }
		const zero = { v: 0, d: 0 }
		assert.deepStrictEqual(addDualSeries(a, zero), a)
		assert.deepStrictEqual(addDualSeries(zero, a), a)
	})

	test('handles additive inverse and normalizes -0 to +0', () => {
		const res = addDualSeries({ v: 3.5, d: -2.25 }, { v: -3.5, d: 2.25 })
		assert.deepStrictEqual(res, { v: 0, d: 0 })
		assert.equal(Object.is(res.v, 0), true)
		assert.equal(Object.is(res.d, 0), true)

		const negZero = addDualSeries({ v: -0, d: -0 }, { v: -0, d: -0 })
		assert.equal(Object.is(negZero.v, 0), true)
		assert.equal(Object.is(negZero.d, 0), true)
	})

	test('handles pure constants (d = 0) and pure duals (v = 0)', () => {
		assert.deepStrictEqual(addDualSeries({ v: 10, d: 0 }, { v: 0, d: 4 }), { v: 10, d: 4 })
		assert.deepStrictEqual(addDualSeries({ v: 0, d: 3 }, { v: 0, d: -8 }), { v: 0, d: -5 })
	})

	test('handles very small subnormal and large finite values without overflow', () => {
		const tiny = addDualSeries(
			{ v: Number.MIN_VALUE, d: Number.MIN_VALUE },
			{ v: Number.MIN_VALUE, d: 0 },
		)
		assert.equal(tiny.v, 2 * Number.MIN_VALUE)
		assert.equal(tiny.d, Number.MIN_VALUE)

		const large = addDualSeries(
			{ v: Number.MAX_VALUE / 2, d: -Number.MAX_VALUE / 2 },
			{ v: Number.MAX_VALUE / 4, d: Number.MAX_VALUE / 4 },
		)
		assert.equal(Number.isFinite(large.v), true)
		assert.equal(Number.isFinite(large.d), true)
	})

	test('does not mutate input objects and ignores extra properties', () => {
		const a = { v: 1, d: 2, tag: 'a' }
		const b = { v: 3, d: 4, tag: 'b' }
		const res = addDualSeries(a, b)
		assert.deepStrictEqual(res, { v: 4, d: 6 })
		assert.deepStrictEqual(a, { v: 1, d: 2, tag: 'a' })
		assert.deepStrictEqual(b, { v: 3, d: 4, tag: 'b' })
		assert.notEqual(res, a)
		assert.notEqual(res, b)
	})

	test('validates input types and rejects malformed inputs', () => {
		const valid = { v: 1, d: 1 }
		const badObjects = [null, undefined, 42, '1+1e', true, [1, 2], () => {}]

		for (const bad of badObjects) {
			assert.throws(() => addDualSeries(bad, valid), TypeError)
			assert.throws(() => addDualSeries(valid, bad), TypeError)
		}

		const badProps = [
			{ v: 1 },
			{ d: 1 },
			{},
			{ v: '1', d: 2 },
			{ v: 1, d: '2' },
			{ v: null, d: 2 },
			{ v: 1, d: undefined },
		]

		for (const bad of badProps) {
			assert.throws(() => addDualSeries(bad, valid), TypeError)
			assert.throws(() => addDualSeries(valid, bad), TypeError)
		}
	})

	test('validates finite components and rejects overflow', () => {
		const valid = { v: 1, d: 1 }
		const nonFinite = [
			{ v: Number.NaN, d: 0 },
			{ v: 0, d: Number.NaN },
			{ v: Number.POSITIVE_INFINITY, d: 0 },
			{ v: 0, d: Number.NEGATIVE_INFINITY },
		]

		for (const bad of nonFinite) {
			assert.throws(() => addDualSeries(bad, valid), RangeError)
			assert.throws(() => addDualSeries(valid, bad), RangeError)
		}

		assert.throws(
			() => addDualSeries({ v: Number.MAX_VALUE, d: 0 }, { v: Number.MAX_VALUE, d: 0 }),
			RangeError,
		)
		assert.throws(
			() => addDualSeries({ v: 0, d: -Number.MAX_VALUE }, { v: 0, d: -Number.MAX_VALUE }),
			RangeError,
		)
	})

	test('satisfies algebraic laws (commutativity and associativity)', () => {
		const a = { v: 1.25, d: -3.5 }
		const b = { v: -7.5, d: 2.125 }
		const c = { v: 4.75, d: 0.875 }

		assert.deepStrictEqual(addDualSeries(a, b), addDualSeries(b, a))
		assert.deepStrictEqual(
			addDualSeries(addDualSeries(a, b), c),
			addDualSeries(a, addDualSeries(b, c)),
		)
	})

	test('cross-check: matches finite-difference derivative of f(t) = g(t) + h(t)', () => {
		const g = (t) => t * t * t - 2 * t + 5
		const dg = (t) => 3 * t * t - 2
		const h = (t) => Math.sin(t) + Math.exp(0.5 * t)
		const dh = (t) => Math.cos(t) + 0.5 * Math.exp(0.5 * t)
		const eps = 1e-6

		for (const t of [-2.3, -0.5, 0, 1.1, 3.7]) {
			const res = addDualSeries({ v: g(t), d: dg(t) }, { v: h(t), d: dh(t) })
			const expectedV = g(t) + h(t)
			const numericD = ((g(t + eps) + h(t + eps)) - (g(t - eps) + h(t - eps))) / (2 * eps)

			assert.ok(Math.abs(res.v - expectedV) < 1e-12, `value mismatch at t=${t}`)
			assert.ok(Math.abs(res.d - numericD) < 1e-7, `derivative mismatch at t=${t}`)
		}
	})

	test('cross-check: matches 2x2 upper-triangular matrix representation of dual numbers', () => {
		const toMatrix = ({ v, d }) => [
			[v, d],
			[0, v],
		]
		const addMatrix = (A, B) => [
			[A[0][0] + B[0][0], A[0][1] + B[0][1]],
			[A[1][0] + B[1][0], A[1][1] + B[1][1]],
		]

		const pairs = [
			[{ v: 3, d: -2 }, { v: 8, d: 5 }],
			[{ v: -1.5, d: 4.25 }, { v: 6.75, d: -9.5 }],
			[{ v: 0, d: 1 }, { v: 1, d: 0 }],
		]

		for (const [a, b] of pairs) {
			const sumDual = addDualSeries(a, b)
			const sumMat = addMatrix(toMatrix(a), toMatrix(b))
			assert.deepStrictEqual(toMatrix(sumDual), sumMat)
		}
	})
})
