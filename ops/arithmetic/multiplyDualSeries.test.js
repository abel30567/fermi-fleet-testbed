import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyDualSeries } from './multiplyDualSeries.js'

describe('multiplyDualSeries', () => {
	it('multiplies basic positive dual numbers using the product rule', () => {
		const res = multiplyDualSeries({ v: 2, d: 3 }, { v: 4, d: 5 })
		assert.deepEqual(res, { v: 8, d: 22 })
	})

	it('handles negative values and derivatives', () => {
		const res = multiplyDualSeries({ v: -3, d: 2 }, { v: 5, d: -7 })
		assert.deepEqual(res, { v: -15, d: 31 })
	})

	it('handles floating-point operands accurately', () => {
		const res = multiplyDualSeries({ v: 1.5, d: -0.25 }, { v: 2.5, d: 4.0 })
		assert.ok(Math.abs(res.v - 3.75) < 1e-12)
		assert.ok(Math.abs(res.d - 5.375) < 1e-12)
	})

	it('satisfies nilpotency of the dual unit ε (ε² = 0)', () => {
		const eps = { v: 0, d: 1 }
		assert.deepEqual(multiplyDualSeries(eps, eps), { v: 0, d: 0 })
		assert.deepEqual(multiplyDualSeries({ v: 0, d: 7 }, { v: 0, d: -9 }), { v: 0, d: 0 })
	})

	it('preserves multiplicative identity { v: 1, d: 0 } and zero { v: 0, d: 0 }', () => {
		const one = { v: 1, d: 0 }
		const zero = { v: 0, d: 0 }
		const x = { v: -4.5, d: 1.25 }

		assert.deepEqual(multiplyDualSeries(x, one), x)
		assert.deepEqual(multiplyDualSeries(one, x), x)

		const zLeft = multiplyDualSeries(zero, x)
		const zRight = multiplyDualSeries(x, zero)
		assert.ok(Object.is(zLeft.v, 0) && Object.is(zLeft.d, 0))
		assert.ok(Object.is(zRight.v, 0) && Object.is(zRight.d, 0))
	})

	it('scales correctly by a constant dual number { v: c, d: 0 }', () => {
		const res = multiplyDualSeries({ v: 3, d: 0 }, { v: -2, d: 5 })
		assert.deepEqual(res, { v: -6, d: 15 })
	})

	it('does not mutate input dual numbers', () => {
		const a = Object.freeze({ v: 3, d: 4 })
		const b = Object.freeze({ v: 5, d: 6 })
		const res = multiplyDualSeries(a, b)
		assert.deepEqual(res, { v: 15, d: 38 })
		assert.notEqual(res, a)
		assert.notEqual(res, b)
	})

	it('validates input structure and throws TypeError / RangeError on invalid inputs', () => {
		const valid = { v: 1, d: 1 }

		for (const bad of [null, undefined, 42, 'dual', [], true]) {
			assert.throws(() => multiplyDualSeries(bad, valid), TypeError)
			assert.throws(() => multiplyDualSeries(valid, bad), TypeError)
		}

		for (const badField of [{ v: '1', d: 0 }, { v: 1, d: null }, { v: 1 }, { d: 1 }, {}]) {
			assert.throws(() => multiplyDualSeries(badField, valid), TypeError)
			assert.throws(() => multiplyDualSeries(valid, badField), TypeError)
		}

		for (const nonFinite of [
			{ v: NaN, d: 0 },
			{ v: 0, d: NaN },
			{ v: Infinity, d: 1 },
			{ v: 1, d: -Infinity },
		]) {
			assert.throws(() => multiplyDualSeries(nonFinite, valid), RangeError)
			assert.throws(() => multiplyDualSeries(valid, nonFinite), RangeError)
		}
	})

	it('cross-check: satisfies commutativity, associativity, and distributivity', () => {
		const a = { v: 2.3, d: -1.1 }
		const b = { v: -0.7, d: 3.4 }
		const c = { v: 4.2, d: 0.9 }

		// Commutativity: a * b == b * a
		const ab = multiplyDualSeries(a, b)
		const ba = multiplyDualSeries(b, a)
		assert.ok(Math.abs(ab.v - ba.v) < 1e-12)
		assert.ok(Math.abs(ab.d - ba.d) < 1e-12)

		// Associativity: (a * b) * c == a * (b * c)
		const ab_c = multiplyDualSeries(ab, c)
		const a_bc = multiplyDualSeries(a, multiplyDualSeries(b, c))
		assert.ok(Math.abs(ab_c.v - a_bc.v) < 1e-12)
		assert.ok(Math.abs(ab_c.d - a_bc.d) < 1e-12)

		// Distributivity: a * (b + c) == a * b + a * c
		const bPlusC = { v: b.v + c.v, d: b.d + c.d }
		const lhs = multiplyDualSeries(a, bPlusC)
		const ac = multiplyDualSeries(a, c)
		const rhs = { v: ab.v + ac.v, d: ab.d + ac.d }
		assert.ok(Math.abs(lhs.v - rhs.v) < 1e-12)
		assert.ok(Math.abs(lhs.d - rhs.d) < 1e-12)
	})

	it('cross-check: matches central finite-difference derivative of f(x) * g(x)', () => {
		const f = (x) => x ** 3 - 2 * x + 5
		const df = (x) => 3 * x ** 2 - 2
		const g = (x) => Math.sin(x) + 3
		const dg = (x) => Math.cos(x)
		const prod = (x) => f(x) * g(x)

		const h = 1e-6
		for (const x of [-2.5, -0.3, 0, 1.2, 3.7]) {
			const res = multiplyDualSeries({ v: f(x), d: df(x) }, { v: g(x), d: dg(x) })
			const expectedV = prod(x)
			const numericD = (prod(x + h) - prod(x - h)) / (2 * h)

			assert.ok(Math.abs(res.v - expectedV) < 1e-12, `value mismatch at x=${x}`)
			assert.ok(Math.abs(res.d - numericD) < 1e-7, `derivative mismatch at x=${x}`)
		}
	})

	it('cross-check: repeated multiplication computes d/dx(x^3) = 3x^2', () => {
		for (const xVal of [-3, -0.5, 0, 2, 4.25]) {
			const x = { v: xVal, d: 1 }
			const x2 = multiplyDualSeries(x, x)
			const x3 = multiplyDualSeries(x2, x)
			assert.ok(Math.abs(x3.v - xVal ** 3) < 1e-12)
			assert.ok(Math.abs(x3.d - 3 * xVal ** 2) < 1e-12)
		}
	})
})
