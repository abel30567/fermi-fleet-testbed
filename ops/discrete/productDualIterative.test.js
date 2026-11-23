import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { productDualIterative } from './productDualIterative.js'

describe('productDualIterative', () => {
	describe('normal cases', () => {
		it('multiplies two dual numbers using the product rule', () => {
			// (2 + 3ε)(5 + 7ε) = 10 + (2*7 + 3*5)ε = 10 + 29ε
			const res = productDualIterative([
				{ v: 2, d: 3 },
				{ v: 5, d: 7 },
			])
			assert.deepStrictEqual(res, { v: 10, d: 29 })
		})

		it('multiplies multiple dual numbers iteratively', () => {
			// f(x) = (x + 1)(2x - 3)(x^2 + 4) at x = 2
			// terms: (3, 1), (1, 2), (8, 4)
			// value = 3 * 1 * 8 = 24
			// deriv = 1*1*8 + 3*2*8 + 3*1*4 = 8 + 48 + 12 = 68
			const res = productDualIterative([
				{ v: 3, d: 1 },
				{ v: 1, d: 2 },
				{ v: 8, d: 4 },
			])
			assert.deepStrictEqual(res, { v: 24, d: 68 })
		})

		it('handles negative values and derivatives', () => {
			// (-3 + 2ε)(-4 - 5ε) = 12 + ((-3)*(-5) + 2*(-4))ε = 12 + 7ε
			const res = productDualIterative([
				{ v: -3, d: 2 },
				{ v: -4, d: -5 },
			])
			assert.deepStrictEqual(res, { v: 12, d: 7 })
		})

		it('accepts non-array iterables such as generators and Sets', () => {
			function* gen() {
				yield { v: 2, d: 1 }
				yield { v: 3, d: 4 }
				yield { v: 5, d: -1 }
			}
			// (2 + ε)(3 + 4ε) = (6 + 11ε)
			// (6 + 11ε)(5 - ε) = 30 + (-6 + 55)ε = 30 + 49ε
			assert.deepStrictEqual(productDualIterative(gen()), { v: 30, d: 49 })

			const set = new Set([
				{ v: 4, d: 1 },
				{ v: 0.5, d: -2 },
			])
			assert.deepStrictEqual(productDualIterative(set), { v: 2, d: -7.5 })
		})
	})

	describe('edge cases', () => {
		it('returns the multiplicative identity { v: 1, d: 0 } for an empty iterable', () => {
			assert.deepStrictEqual(productDualIterative([]), { v: 1, d: 0 })
		})

		it('returns a fresh copy for a single dual number', () => {
			const input = { v: 7.5, d: -2.25 }
			const res = productDualIterative([input])
			assert.deepStrictEqual(res, { v: 7.5, d: -2.25 })
			assert.notStrictEqual(res, input)
		})

		it('computes exact derivative when exactly one primal value is zero', () => {
			// f(x) = x(x - 1)(x + 2) at x = 0: f(0) = 0, f'(0) = -2
			const res = productDualIterative([
				{ v: 0, d: 1 },
				{ v: -1, d: 1 },
				{ v: 2, d: 1 },
			])
			assert.deepStrictEqual(res, { v: 0, d: -2 })
		})

		it('computes zero value and zero derivative when two or more primal values are zero', () => {
			// f(x) = x^2 * (x + 5) at x = 0: f(0) = 0, f'(0) = 0
			const res = productDualIterative([
				{ v: 0, d: 3 },
				{ v: 0, d: 4 },
				{ v: 5, d: 1 },
			])
			assert.deepStrictEqual(res, { v: 0, d: 0 })
		})

		it('produces zero derivative for constant terms (all d = 0)', () => {
			const res = productDualIterative([
				{ v: 2, d: 0 },
				{ v: -3, d: 0 },
				{ v: 4, d: 0 },
			])
			assert.deepStrictEqual(res, { v: -24, d: 0 })
		})

		it('normalizes negative zero to positive zero', () => {
			const res = productDualIterative([
				{ v: -2, d: 0 },
				{ v: 0, d: 0 },
			])
			assert.ok(Object.is(res.v, 0))
			assert.ok(Object.is(res.d, 0))
		})

		it('supports null-prototype dual objects', () => {
			const a = Object.assign(Object.create(null), { v: 3, d: 2 })
			const b = Object.assign(Object.create(null), { v: 4, d: -1 })
			assert.deepStrictEqual(productDualIterative([a, b]), { v: 12, d: 5 })
		})
	})

	describe('invalid input errors', () => {
		it('throws TypeError when terms is not a valid iterable', () => {
			for (const bad of [null, undefined, 42, true, {}, 'abc', new String('abc')]) {
				assert.throws(() => productDualIterative(bad), TypeError)
			}
		})

		it('throws TypeError when any element is not a dual number object', () => {
			for (const badElem of [null, undefined, 5, '1', [1, 2], true]) {
				assert.throws(() => productDualIterative([{ v: 1, d: 1 }, badElem]), TypeError)
			}
		})

		it('throws TypeError when v or d is missing or non-numeric', () => {
			for (const badElem of [
				{ v: 1 },
				{ d: 1 },
				{},
				{ v: '1', d: 0 },
				{ v: 1, d: '0' },
				{ v: 1, d: null },
				{ v: undefined, d: 1 },
			]) {
				assert.throws(() => productDualIterative([badElem]), TypeError)
			}
		})

		it('throws RangeError when v or d is NaN or infinite', () => {
			for (const badElem of [
				{ v: NaN, d: 0 },
				{ v: 1, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: 1, d: -Infinity },
			]) {
				assert.throws(() => productDualIterative([badElem]), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivative across smooth composite functions', () => {
			// F(x) = sin(x) * exp(0.5 * x) * (x^2 + 1) * cos(2 * x)
			const factors = [
				(x) => ({ v: Math.sin(x), d: Math.cos(x) }),
				(x) => ({ v: Math.exp(0.5 * x), d: 0.5 * Math.exp(0.5 * x) }),
				(x) => ({ v: x * x + 1, d: 2 * x }),
				(x) => ({ v: Math.cos(2 * x), d: -2 * Math.sin(2 * x) }),
			]
			const evalF = (x) => factors.reduce((acc, fn) => acc * fn(x).v, 1)

			const h = 1e-6
			for (const x of [-1.25, 0, 0.7, 2.3]) {
				const dual = productDualIterative(factors.map((fn) => fn(x)))
				const expectedV = evalF(x)
				const fdDeriv = (evalF(x + h) - evalF(x - h)) / (2 * h)

				assert.ok(
					Math.abs(dual.v - expectedV) < 1e-12,
					`value mismatch at x=${x}: got ${dual.v}, expected ${expectedV}`,
				)
				assert.ok(
					Math.abs(dual.d - fdDeriv) < 1e-7,
					`derivative mismatch at x=${x}: got ${dual.d}, finite-diff ${fdDeriv}`,
				)
			}
		})

		it('satisfies the logarithmic derivative identity for non-zero primal terms', () => {
			const terms = [
				{ v: 1.5, d: -0.4 },
				{ v: -2.25, d: 1.1 },
				{ v: 3.75, d: 0.8 },
				{ v: 0.6, d: -1.5 },
				{ v: -0.9, d: 0.25 },
			]
			const res = productDualIterative(terms)
			const expectedV = terms.reduce((acc, t) => acc * t.v, 1)
			const expectedD = expectedV * terms.reduce((acc, t) => acc + t.d / t.v, 0)

			assert.ok(Math.abs(res.v - expectedV) < 1e-12)
			assert.ok(Math.abs(res.d - expectedD) < 1e-12)
		})

		it('satisfies the power rule d/dx (x^n) = n * x^(n-1)', () => {
			const x = 1.7
			const n = 7
			const terms = Array.from({ length: n }, () => ({ v: x, d: 1 }))
			const res = productDualIterative(terms)

			assert.ok(Math.abs(res.v - x ** n) < 1e-12)
			assert.ok(Math.abs(res.d - n * x ** (n - 1)) < 1e-11)
		})
	})
})
