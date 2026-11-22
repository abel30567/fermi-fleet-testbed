import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { powerDualIterative } from './powerDualIterative.js'

/**
 * Helper: assert two numbers are close within relative + absolute tolerance.
 */
function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected)
	const bound = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= bound,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${bound} of ${expected} (diff=${diff})`
	)
}

/**
 * Helper: dual multiplication for algebraic identity cross-checks.
 */
function dualMul(a, b) {
	return { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
}

/**
 * Helper: central finite difference approximation of f'(x).
 */
function centralDiff(f, x, h = 1e-6) {
	return (f(x + h) - f(x - h)) / (2 * h)
}

describe('powerDualIterative', () => {
	describe('integer exponents (iterative exponentiation by squaring)', () => {
		it('computes positive integer powers with scalar and dual exponents', () => {
			assert.deepStrictEqual(powerDualIterative({ v: 3, d: 1 }, 0), { v: 1, d: 0 })
			assert.deepStrictEqual(powerDualIterative({ v: 3, d: 2 }, 1), { v: 3, d: 2 })
			assert.deepStrictEqual(powerDualIterative({ v: 3, d: 1 }, 2), { v: 9, d: 6 })
			assert.deepStrictEqual(powerDualIterative({ v: 3, d: 2 }, 4), { v: 81, d: 4 * 27 * 2 })
			assert.deepStrictEqual(
				powerDualIterative({ v: 2, d: 3 }, { v: 5, d: 0 }),
				{ v: 32, d: 5 * 16 * 3 }
			)
		})

		it('preserves exactness for negative bases with even and odd integer exponents', () => {
			assert.deepStrictEqual(powerDualIterative({ v: -2, d: 3 }, 0), { v: 1, d: 0 })
			assert.deepStrictEqual(powerDualIterative({ v: -2, d: 3 }, 1), { v: -2, d: 3 })
			assert.deepStrictEqual(powerDualIterative({ v: -2, d: 3 }, 2), { v: 4, d: -12 })
			assert.deepStrictEqual(powerDualIterative({ v: -2, d: 3 }, 3), { v: -8, d: 36 })
			assert.deepStrictEqual(powerDualIterative({ v: -2, d: 3 }, -1), { v: -0.5, d: -0.75 })
			assert.deepStrictEqual(powerDualIterative({ v: -2, d: 3 }, -2), { v: 0.25, d: 0.75 })
			assert.deepStrictEqual(powerDualIterative({ v: -2, d: 3 }, -3), { v: -0.125, d: -0.5625 })
		})

		it('handles zero base for non-negative integer exponents', () => {
			assert.deepStrictEqual(powerDualIterative({ v: 0, d: 5 }, 0), { v: 1, d: 0 })
			assert.deepStrictEqual(powerDualIterative({ v: 0, d: 0 }, 0), { v: 1, d: 0 })
			assert.deepStrictEqual(powerDualIterative({ v: 0, d: 5 }, 1), { v: 0, d: 5 })
			assert.deepStrictEqual(powerDualIterative({ v: 0, d: 5 }, 2), { v: 0, d: 0 })
			assert.deepStrictEqual(powerDualIterative({ v: 0, d: 5 }, 7), { v: 0, d: 0 })
		})

		it('handles negative integer exponents with positive bases', () => {
			const r1 = powerDualIterative({ v: 4, d: 2 }, -2)
			assert.strictEqual(r1.v, 0.0625)
			assert.strictEqual(r1.d, -0.0625)

			const r2 = powerDualIterative({ v: 2, d: 1 }, -3)
			assert.strictEqual(r2.v, 0.125)
			assert.strictEqual(r2.d, -0.1875)
		})

		it('handles integer exponents larger than 2^31 without 32-bit truncation', () => {
			const bigEven = 5_000_000_000
			const bigOdd = 5_000_000_001
			assert.deepStrictEqual(powerDualIterative({ v: 1, d: 1 }, bigEven), {
				v: 1,
				d: bigEven,
			})
			assert.deepStrictEqual(powerDualIterative({ v: -1, d: 1 }, bigOdd), {
				v: -1,
				d: bigOdd,
			})
			assert.deepStrictEqual(powerDualIterative({ v: -1, d: 1 }, bigEven), {
				v: 1,
				d: -bigEven,
			})
		})

		it('keeps exact primal value when integer exponent has non-zero derivative', () => {
			// 2^x at x = 3: exact v = 8, d = 8 * ln(2)
			const r1 = powerDualIterative({ v: 2, d: 0 }, { v: 3, d: 1 })
			assert.strictEqual(r1.v, 8)
			assertClose(r1.d, 8 * Math.log(2), 1e-15, 0)

			// x^x at x = 3: exact v = 27, d = 27 * (1 + ln(3))
			const r2 = powerDualIterative({ v: 3, d: 1 }, { v: 3, d: 1 })
			assert.strictEqual(r2.v, 27)
			assertClose(r2.d, 27 * (1 + Math.log(3)), 1e-14, 0)

			// (1 + 2t)^(3 + 5t) at t = 0: v = 1, d = 6
			assert.deepStrictEqual(powerDualIterative({ v: 1, d: 2 }, { v: 3, d: 5 }), {
				v: 1,
				d: 6,
			})
		})
	})

	describe('non-integer and general dual exponents', () => {
		it('computes fractional powers x^p', () => {
			const sqrt4 = powerDualIterative({ v: 4, d: 1 }, 0.5)
			assert.strictEqual(sqrt4.v, 2)
			assert.strictEqual(sqrt4.d, 0.25)

			const invSqrt9 = powerDualIterative({ v: 9, d: 3 }, -0.5)
			assertClose(invSqrt9.v, 1 / 3, 1e-15, 0)
			assertClose(invSqrt9.d, -0.5 * (1 / 27) * 3, 1e-15, 0)

			const pow15 = powerDualIterative({ v: 4, d: 2 }, 1.5)
			assert.strictEqual(pow15.v, 8)
			assert.strictEqual(pow15.d, 1.5 * 2 * 2)
		})

		it('handles zero base with non-integer exponent > 1', () => {
			assert.deepStrictEqual(powerDualIterative({ v: 0, d: 3 }, 1.5), { v: 0, d: 0 })
			assert.deepStrictEqual(powerDualIterative({ v: 0, d: 0 }, { v: 2.5, d: 1 }), {
				v: 0,
				d: 0,
			})
			assert.deepStrictEqual(powerDualIterative({ v: 0, d: 4 }, { v: 1, d: 2 }), {
				v: 0,
				d: 4,
			})
		})

		it('normalizes -0 to +0 and does not mutate inputs', () => {
			const base = { v: -0, d: -0 }
			const exp = { v: -0, d: -0 }
			const res = powerDualIterative(base, exp)
			assert.ok(Object.is(res.v, 1))
			assert.ok(Object.is(res.d, 0))

			const base2 = { v: 2, d: 0 }
			const res2 = powerDualIterative(base2, -3)
			assert.ok(Object.is(res2.d, 0))
			assert.deepStrictEqual(base2, { v: 2, d: 0 })
		})
	})

	describe('input validation and domain errors', () => {
		it('throws TypeError for invalid base or exponent types', () => {
			assert.throws(() => powerDualIterative(null, 2), TypeError)
			assert.throws(() => powerDualIterative(undefined, 2), TypeError)
			assert.throws(() => powerDualIterative(2, 2), TypeError)
			assert.throws(() => powerDualIterative([2, 1], 2), TypeError)
			assert.throws(() => powerDualIterative({ v: '2', d: 1 }, 2), TypeError)
			assert.throws(() => powerDualIterative({ v: 2 }, 2), TypeError)

			assert.throws(() => powerDualIterative({ v: 2, d: 1 }, null), TypeError)
			assert.throws(() => powerDualIterative({ v: 2, d: 1 }, undefined), TypeError)
			assert.throws(() => powerDualIterative({ v: 2, d: 1 }, '2'), TypeError)
			assert.throws(() => powerDualIterative({ v: 2, d: 1 }, [2, 0]), TypeError)
			assert.throws(() => powerDualIterative({ v: 2, d: 1 }, { v: 2 }), TypeError)
		})

		it('throws RangeError for non-finite numbers', () => {
			assert.throws(() => powerDualIterative({ v: NaN, d: 1 }, 2), RangeError)
			assert.throws(() => powerDualIterative({ v: Infinity, d: 1 }, 2), RangeError)
			assert.throws(() => powerDualIterative({ v: 2, d: -Infinity }, 2), RangeError)
			assert.throws(() => powerDualIterative({ v: 2, d: 1 }, NaN), RangeError)
			assert.throws(() => powerDualIterative({ v: 2, d: 1 }, Infinity), RangeError)
			assert.throws(() => powerDualIterative({ v: 2, d: 1 }, -Infinity), RangeError)
			assert.throws(() => powerDualIterative({ v: 2, d: 1 }, { v: 2, d: NaN }), RangeError)
			assert.throws(
				() => powerDualIterative({ v: 2, d: 1 }, { v: Infinity, d: 0 }),
				RangeError
			)
		})

		it('throws RangeError for domain and undefined-derivative violations', () => {
			// Negative base with non-integer exponent
			assert.throws(() => powerDualIterative({ v: -2, d: 1 }, 0.5), RangeError)
			assert.throws(() => powerDualIterative({ v: -8, d: 0 }, 1 / 3), RangeError)
			assert.throws(() => powerDualIterative({ v: -4, d: 1 }, -1.5), RangeError)

			// Negative base with variable exponent (b.d !== 0)
			assert.throws(() => powerDualIterative({ v: -2, d: 0 }, { v: 3, d: 1 }), RangeError)
			assert.throws(() => powerDualIterative({ v: -2, d: 1 }, { v: 2, d: 1 }), RangeError)

			// Zero base with negative exponent
			assert.throws(() => powerDualIterative({ v: 0, d: 1 }, -1), RangeError)
			assert.throws(() => powerDualIterative({ v: 0, d: 0 }, -0.5), RangeError)
			assert.throws(() => powerDualIterative({ v: 0, d: 1 }, { v: -2, d: 0 }), RangeError)

			// Zero base with 0 < b.v < 1 (undefined/infinite derivative)
			assert.throws(() => powerDualIterative({ v: 0, d: 1 }, 0.5), RangeError)
			assert.throws(() => powerDualIterative({ v: 0, d: 0 }, 0.5), RangeError)
			assert.throws(() => powerDualIterative({ v: 0, d: 1 }, 0.99), RangeError)

			// Zero base with b.v === 0 and b.d !== 0 (e.g. x^x at x = 0)
			assert.throws(() => powerDualIterative({ v: 0, d: 1 }, { v: 0, d: 1 }), RangeError)
			assert.throws(() => powerDualIterative({ v: 0, d: 0 }, { v: 0, d: 1 }), RangeError)
		})

		it('throws RangeError on floating-point overflow', () => {
			assert.throws(() => powerDualIterative({ v: 10, d: 1 }, 400), RangeError)
			assert.throws(() => powerDualIterative({ v: 10, d: 0 }, 400), RangeError)
			assert.throws(() => powerDualIterative({ v: 10, d: 1 }, 400.5), RangeError)
		})
	})

	describe('cross-checks against central finite differences', () => {
		it('matches central finite differences for x^p (integer and non-integer p)', () => {
			const cases = [
				{ x: 2.3, p: 3 },
				{ x: -2.3, p: 3 },
				{ x: -1.7, p: -4 },
				{ x: 0.75, p: 0.5 },
				{ x: 3.1, p: -1.75 },
				{ x: 1.4, p: Math.PI },
				{ x: 5.0, p: 0 },
			]
			for (const { x, p } of cases) {
				const dual = powerDualIterative({ v: x, d: 1 }, p)
				const numDeriv = centralDiff((t) => Math.pow(t, p), x)
				assertClose(dual.v, Math.pow(x, p), 1e-13, 1e-13, `x^p value (${x}, ${p})`)
				assertClose(dual.d, numDeriv, 1e-7, 1e-7, `x^p deriv (${x}, ${p})`)
			}
		})

		it('matches central finite differences for a^x', () => {
			const cases = [
				{ a: 2, x: 3 },
				{ a: 2, x: -1.5 },
				{ a: 0.35, x: 2.4 },
				{ a: Math.E, x: 1.25 },
				{ a: 10, x: 0 },
				{ a: 1, x: 4.2 },
			]
			for (const { a, x } of cases) {
				const dual = powerDualIterative({ v: a, d: 0 }, { v: x, d: 1 })
				const numDeriv = centralDiff((t) => Math.pow(a, t), x)
				assertClose(dual.v, Math.pow(a, x), 1e-13, 1e-13, `a^x value (${a}, ${x})`)
				assertClose(dual.d, numDeriv, 1e-7, 1e-7, `a^x deriv (${a}, ${x})`)
			}
		})

		it('matches central finite differences for x^x', () => {
			const xs = [0.25, 0.5, 1, 1.5, 2, 2.75, 3, 4.2]
			for (const x of xs) {
				const dual = powerDualIterative({ v: x, d: 1 }, { v: x, d: 1 })
				const numDeriv = centralDiff((t) => Math.pow(t, t), x)
				assertClose(dual.v, Math.pow(x, x), 1e-13, 1e-13, `x^x value (${x})`)
				assertClose(dual.d, numDeriv, 1e-6, 1e-7, `x^x deriv (${x})`)
			}
		})

		it('matches central finite differences for composite dual expressions (2x + 0.5)^(x^2 - 1)', () => {
			const f = (x) => Math.pow(2 * x + 0.5, x * x - 1)
			for (const x of [0.5, 1.0, 1.35, 2.0]) {
				const base = { v: 2 * x + 0.5, d: 2 }
				const exp = { v: x * x - 1, d: 2 * x }
				const dual = powerDualIterative(base, exp)
				const numDeriv = centralDiff(f, x)
				assertClose(dual.v, f(x), 1e-13, 1e-13, `composite value (${x})`)
				assertClose(dual.d, numDeriv, 1e-6, 1e-7, `composite deriv (${x})`)
			}
		})
	})

	describe('algebraic dual identities', () => {
		it('satisfies a^(b + c) = a^b * a^c and (a^b)^c = a^(b * c)', () => {
			const a = { v: 2.3, d: 0.7 }
			const b = { v: 1.4, d: -0.3 }
			const c = { v: 0.8, d: 0.5 }

			// a^(b + c) === a^b * a^c
			const bPlusC = { v: b.v + c.v, d: b.d + c.d }
			const lhs1 = powerDualIterative(a, bPlusC)
			const rhs1 = dualMul(powerDualIterative(a, b), powerDualIterative(a, c))
			assertClose(lhs1.v, rhs1.v, 1e-13, 1e-13)
			assertClose(lhs1.d, rhs1.d, 1e-13, 1e-13)

			// (a^b)^c === a^(b * c)
			const lhs2 = powerDualIterative(powerDualIterative(a, b), c)
			const rhs2 = powerDualIterative(a, dualMul(b, c))
			assertClose(lhs2.v, rhs2.v, 1e-13, 1e-13)
			assertClose(lhs2.d, rhs2.d, 1e-13, 1e-13)

			// a^b * a^(-b) === { v: 1, d: 0 }
			const negB = { v: -b.v, d: -b.d }
			const prod = dualMul(powerDualIterative(a, b), powerDualIterative(a, negB))
			assertClose(prod.v, 1, 1e-13, 1e-13)
			assertClose(prod.d, 0, 1e-13, 1e-13)
		})
	})
})
