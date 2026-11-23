import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyDualIterative } from './multiplyDualIterative.js'

describe('multiplyDualIterative', () => {
	describe('normal cases', () => {
		it('multiplies two dual numbers using the product rule', () => {
			const res = multiplyDualIterative({ v: 2, d: 3 }, { v: 4, d: 5 })
			// v = 2 * 4 = 8, d = 2 * 5 + 3 * 4 = 22
			assert.deepStrictEqual(res, { v: 8, d: 22 })
		})

		it('handles negative and fractional values', () => {
			const res = multiplyDualIterative({ v: -1.5, d: 0.5 }, { v: 2, d: -4 })
			// v = -3, d = (-1.5)*(-4) + 0.5*2 = 6 + 1 = 7
			assert.deepStrictEqual(res, { v: -3, d: 7 })
		})

		it('multiplies three or more variadic dual numbers iteratively', () => {
			// (2 + 1ε)(3 + 2ε)(5 + 4ε)
			// v = 30
			// d = 1*3*5 + 2*2*5 + 2*3*4 = 15 + 20 + 24 = 59
			const res = multiplyDualIterative(
				{ v: 2, d: 1 },
				{ v: 3, d: 2 },
				{ v: 5, d: 4 },
			)
			assert.deepStrictEqual(res, { v: 30, d: 59 })
		})

		it('accepts an array of dual numbers', () => {
			const factors = [
				{ v: 2, d: 1 },
				{ v: 3, d: 2 },
				{ v: 5, d: 4 },
			]
			assert.deepStrictEqual(multiplyDualIterative(factors), { v: 30, d: 59 })
		})

		it('returns a fresh copy for a single dual number without mutating inputs', () => {
			const input = { v: 7, d: -2, extra: 'ignored' }
			const res = multiplyDualIterative(input)
			assert.deepStrictEqual(res, { v: 7, d: -2 })
			assert.notStrictEqual(res, input)
			assert.deepStrictEqual(input, { v: 7, d: -2, extra: 'ignored' })
		})

		it('computes power rule x^n via repeated multiplication', () => {
			const x = 3
			const n = 5
			const factors = Array.from({ length: n }, () => ({ v: x, d: 1 }))
			const res = multiplyDualIterative(factors)
			assert.deepStrictEqual(res, { v: x ** n, d: n * x ** (n - 1) })
		})
	})

	describe('edge cases', () => {
		it('returns the multiplicative identity { v: 1, d: 0 } for an empty array', () => {
			assert.deepStrictEqual(multiplyDualIterative([]), { v: 1, d: 0 })
		})

		it('preserves any dual number when multiplied by identity { v: 1, d: 0 }', () => {
			const a = { v: -11.25, d: 6.75 }
			const id = { v: 1, d: 0 }
			assert.deepStrictEqual(multiplyDualIterative(a, id), a)
			assert.deepStrictEqual(multiplyDualIterative(id, a), a)
		})

		it('handles zero dual number { v: 0, d: 0 }', () => {
			assert.deepStrictEqual(
				multiplyDualIterative({ v: 0, d: 0 }, { v: 9, d: 4 }),
				{ v: 0, d: 0 },
			)
		})

		it('handles zero primal value with non-zero derivative accurately', () => {
			// (0 + 5ε)(3 + 7ε) = 0 + 15ε
			assert.deepStrictEqual(
				multiplyDualIterative({ v: 0, d: 5 }, { v: 3, d: 7 }),
				{ v: 0, d: 15 },
			)
		})

		it('satisfies ε² = 0 when two factors have zero primal value', () => {
			// (0 + 3ε)(0 + 4ε) = 0 + 0ε
			assert.deepStrictEqual(
				multiplyDualIterative({ v: 0, d: 3 }, { v: 0, d: 4 }),
				{ v: 0, d: 0 },
			)
		})

		it('normalizes -0 to +0 in both value and derivative', () => {
			const res = multiplyDualIterative({ v: -0, d: 0 }, { v: 5, d: -0 })
			assert.ok(Object.is(res.v, 0))
			assert.ok(Object.is(res.d, 0))
		})

		it('is commutative and associative over exact integers', () => {
			const a = { v: 3, d: -2 }
			const b = { v: -5, d: 7 }
			const c = { v: 11, d: 4 }

			assert.deepStrictEqual(
				multiplyDualIterative(a, b),
				multiplyDualIterative(b, a),
			)
			assert.deepStrictEqual(
				multiplyDualIterative(multiplyDualIterative(a, b), c),
				multiplyDualIterative(a, multiplyDualIterative(b, c)),
			)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when called with no arguments', () => {
			assert.throws(() => multiplyDualIterative(), TypeError)
		})

		it('throws TypeError for non-object or null factors', () => {
			for (const bad of [null, undefined, 42, 'dual', true, Symbol('x')]) {
				assert.throws(() => multiplyDualIterative(bad), TypeError)
				assert.throws(() => multiplyDualIterative({ v: 1, d: 0 }, bad), TypeError)
				assert.throws(() => multiplyDualIterative([{ v: 1, d: 0 }, bad]), TypeError)
			}
		})

		it('throws TypeError for missing or non-numeric v or d properties', () => {
			const invalid = [
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 1, d: '0' },
				{ v: null, d: 0 },
				{ v: 1, d: undefined },
			]
			for (const bad of invalid) {
				assert.throws(() => multiplyDualIterative(bad), TypeError)
			}
		})

		it('throws TypeError for nested arrays or array passed alongside other arguments', () => {
			assert.throws(() => multiplyDualIterative([[{ v: 1, d: 0 }]]), TypeError)
			assert.throws(
				() => multiplyDualIterative([{ v: 1, d: 0 }], { v: 2, d: 1 }),
				TypeError,
			)
		})

		it('throws RangeError for NaN or infinite v or d values', () => {
			const nonFinite = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: 1, d: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFinite) {
				assert.throws(() => multiplyDualIterative(bad), RangeError)
				assert.throws(() => multiplyDualIterative({ v: 2, d: 1 }, bad), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivatives for composite products', () => {
			// f(x) = sin(x) * exp(x) * (x^2 + 1) * (3x - 2)
			const evalScalar = (x) =>
				Math.sin(x) * Math.exp(x) * (x * x + 1) * (3 * x - 2)

			const evalDual = (x) =>
				multiplyDualIterative(
					{ v: Math.sin(x), d: Math.cos(x) },
					{ v: Math.exp(x), d: Math.exp(x) },
					{ v: x * x + 1, d: 2 * x },
					{ v: 3 * x - 2, d: 3 },
				)

			const h = 1e-6
			for (const x of [-1.25, 0, 0.4, 1.7]) {
				const { v, d } = evalDual(x)
				const expectedV = evalScalar(x)
				const approxD = (evalScalar(x + h) - evalScalar(x - h)) / (2 * h)

				assert.ok(
					Math.abs(v - expectedV) < 1e-12,
					`value mismatch at x=${x}: got ${v}, expected ${expectedV}`,
				)
				const tol = Math.max(1e-7, Math.abs(approxD) * 1e-7)
				assert.ok(
					Math.abs(d - approxD) < tol,
					`derivative mismatch at x=${x}: got ${d}, finite-diff ${approxD}`,
				)
			}
		})

		it('matches direct leave-one-out product rule formula for many factors', () => {
			const factors = [
				{ v: 1.2, d: -0.5 },
				{ v: -2.5, d: 1.3 },
				{ v: 0, d: 4.0 },
				{ v: 3.1, d: 0.7 },
				{ v: -0.8, d: 2.2 },
				{ v: 1.5, d: -1.1 },
			]

			const res = multiplyDualIterative(factors)

			const directV = factors.reduce((acc, f) => acc * f.v, 1)
			let directD = 0
			for (let i = 0; i < factors.length; i++) {
				let term = factors[i].d
				for (let j = 0; j < factors.length; j++) {
					if (j !== i) term *= factors[j].v
				}
				directD += term
			}

			assert.ok(Math.abs(res.v - directV) < 1e-12)
			assert.ok(Math.abs(res.d - directD) < 1e-12)
		})
	})
})
