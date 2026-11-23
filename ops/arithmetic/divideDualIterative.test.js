import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideDualIterative } from './divideDualIterative.js'

/**
 * Helper: exact dual multiplication for independent algebraic round-trip checks.
 * (a.v + a.d·ε)(b.v + b.d·ε) = (a.v·b.v) + (a.v·b.d + a.d·b.v)·ε
 */
function multiplyDual(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	}
}

/**
 * Helper: asserts two floating-point numbers are within `tol`.
 */
function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`,
	)
}

describe('divideDualIterative', () => {
	describe('normal cases', () => {
		test('divides two dual numbers using the quotient rule', () => {
			// u(x) = x^2 + 1 at x=3 -> {v: 10, d: 6}
			// w(x) = 2x - 1  at x=3 -> {v: 5, d: 2}
			// (u/w)(3) = 2, (u/w)'(3) = (6*5 - 10*2) / 25 = 0.4
			const res = divideDualIterative({ v: 10, d: 6 }, { v: 5, d: 2 })
			assert.deepStrictEqual(res, { v: 2, d: 0.4 })
		})

		test('handles negative primal and derivative values', () => {
			// a = -6 + 4ε, b = 3 - 2ε
			// v = -2, d = (4*3 - (-6)*(-2)) / 9 = (12 - 12) / 9 = 0
			const res1 = divideDualIterative({ v: -6, d: 4 }, { v: 3, d: -2 })
			assert.deepStrictEqual(res1, { v: -2, d: 0 })

			// a = -9 - 3ε, b = -3 + 1ε
			// v = 3, d = ((-3)*(-3) - (-9)*1) / 9 = (9 + 9) / 9 = 2
			const res2 = divideDualIterative({ v: -9, d: -3 }, { v: -3, d: 1 })
			assert.deepStrictEqual(res2, { v: 3, d: 2 })
		})

		test('supports iterative left-associative division with 3+ dual numbers', () => {
			// u(x) = x^3 at x=2 -> {v: 8, d: 12}
			// w(x) = x + 2 at x=2 -> {v: 4, d: 1}
			// z(x) = 3x - 4 at x=2 -> {v: 2, d: 3}
			// ((u / w) / z)(2) = 1, derivative = -0.25
			const res = divideDualIterative(
				{ v: 8, d: 12 },
				{ v: 4, d: 1 },
				{ v: 2, d: 3 },
			)
			assert.deepStrictEqual(res, { v: 1, d: -0.25 })
		})

		test('does not mutate input dual objects', () => {
			const a = { v: 10, d: 6 }
			const b = { v: 5, d: 2 }
			const c = { v: 2, d: 1 }
			const res = divideDualIterative(a, b, c)
			assert.deepStrictEqual(a, { v: 10, d: 6 })
			assert.deepStrictEqual(b, { v: 5, d: 2 })
			assert.deepStrictEqual(c, { v: 2, d: 1 })
			assert.notEqual(res, a)
			assert.notEqual(res, b)
		})
	})

	describe('edge cases', () => {
		test('dividing by a constant dual { v: c, d: 0 } scales both v and d', () => {
			const res = divideDualIterative({ v: 12, d: -8 }, { v: 4, d: 0 })
			assert.deepStrictEqual(res, { v: 3, d: -2 })
		})

		test('dividing a constant dual by a variable dual gives -c*b.d / b.v^2', () => {
			// d/dx (6 / (2x)) at x=1 -> b = {v: 2, d: 2} -> v=3, d=-6*2/4 = -3
			const res = divideDualIterative({ v: 6, d: 0 }, { v: 2, d: 2 })
			assert.deepStrictEqual(res, { v: 3, d: -3 })
		})

		test('dividing a dual number by itself yields { v: 1, d: 0 }', () => {
			const x = { v: -7.5, d: 4.25 }
			const res = divideDualIterative(x, x)
			assert.deepStrictEqual(res, { v: 1, d: 0 })
		})

		test('zero dividend with zero derivative returns positive zeros (no -0)', () => {
			const res = divideDualIterative({ v: 0, d: 0 }, { v: -5, d: 3 })
			assert.deepStrictEqual(res, { v: 0, d: 0 })
			assert.ok(Object.is(res.v, 0))
			assert.ok(Object.is(res.d, 0))
		})

		test('zero primal dividend with non-zero derivative computes a.d / b.v', () => {
			// u(x) = x at x=0 -> {v: 0, d: 1}, w(x) = x + 4 at x=0 -> {v: 4, d: 1}
			const res = divideDualIterative({ v: 0, d: 1 }, { v: 4, d: 1 })
			assert.deepStrictEqual(res, { v: 0, d: 0.25 })
		})

		test('avoids premature overflow/underflow in b.v^2 for extreme scales', () => {
			// Naive b.v * b.v overflows to Infinity when b.v = 1e200
			const large = divideDualIterative({ v: 2e200, d: 3 }, { v: 1e200, d: 1 })
			assertClose(large.v, 2, 1e-12, 'large.v')
			assertClose(large.d, 1e-200, 1e-212, 'large.d')

			// Naive b.v * b.v underflows to 0 when b.v = 1e-200
			const small = divideDualIterative(
				{ v: 2e-200, d: 3e-200 },
				{ v: 1e-200, d: 1e-200 },
			)
			assertClose(small.v, 2, 1e-12, 'small.v')
			assertClose(small.d, 1, 1e-12, 'small.d')
		})
	})

	describe('input validation errors', () => {
		test('throws TypeError when arguments are missing or non-objects', () => {
			assert.throws(() => divideDualIterative(), TypeError)
			assert.throws(() => divideDualIterative({ v: 1, d: 0 }), TypeError)
			assert.throws(() => divideDualIterative(null, { v: 1, d: 0 }), TypeError)
			assert.throws(() => divideDualIterative({ v: 1, d: 0 }, null), TypeError)
			assert.throws(() => divideDualIterative(4, { v: 2, d: 0 }), TypeError)
			assert.throws(() => divideDualIterative([1, 2], { v: 2, d: 0 }), TypeError)
			assert.throws(
				() => divideDualIterative({ v: 4, d: 1 }, { v: 2, d: 0 }, 'bad'),
				TypeError,
			)
		})

		test('throws TypeError for missing, non-numeric, NaN, or Infinite components', () => {
			assert.throws(() => divideDualIterative({ v: 1 }, { v: 2, d: 0 }), TypeError)
			assert.throws(() => divideDualIterative({ d: 1 }, { v: 2, d: 0 }), TypeError)
			assert.throws(
				() => divideDualIterative({ v: '1', d: 0 }, { v: 2, d: 0 }),
				TypeError,
			)
			assert.throws(
				() => divideDualIterative({ v: Number.NaN, d: 0 }, { v: 2, d: 0 }),
				TypeError,
			)
			assert.throws(
				() => divideDualIterative({ v: 1, d: Infinity }, { v: 2, d: 0 }),
				TypeError,
			)
			assert.throws(
				() => divideDualIterative({ v: 1, d: 0 }, { v: 2, d: -Infinity }),
				TypeError,
			)
		})

		test('throws RangeError on division by zero (+0 or -0) in any divisor', () => {
			assert.throws(
				() => divideDualIterative({ v: 1, d: 2 }, { v: 0, d: 1 }),
				RangeError,
			)
			assert.throws(
				() => divideDualIterative({ v: 1, d: 2 }, { v: -0, d: 5 }),
				RangeError,
			)
			assert.throws(
				() =>
					divideDualIterative(
						{ v: 10, d: 2 },
						{ v: 2, d: 1 },
						{ v: 0, d: 3 },
					),
				RangeError,
			)
		})

		test('throws RangeError when the quotient overflows to non-finite', () => {
			assert.throws(
				() => divideDualIterative({ v: 1e308, d: 1 }, { v: 1e-308, d: 0 }),
				RangeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		test('matches central finite-difference derivatives for transcendental and rational functions', () => {
			const h = 1e-6

			// 1) tan(x) = sin(x) / cos(x), derivative = sec^2(x)
			for (const x of [-0.9, -0.3, 0.4, 1.1]) {
				const num = { v: Math.sin(x), d: Math.cos(x) }
				const den = { v: Math.cos(x), d: -Math.sin(x) }
				const dual = divideDualIterative(num, den)

				const f = (t) => Math.sin(t) / Math.cos(t)
				const fd = (f(x + h) - f(x - h)) / (2 * h)
				const exactDeriv = 1 / (Math.cos(x) * Math.cos(x))

				assertClose(dual.v, Math.tan(x), 1e-12, `tan(${x}) value`)
				assertClose(dual.d, exactDeriv, 1e-12, `tan(${x}) exact deriv`)
				assertClose(dual.d, fd, 1e-7, `tan(${x}) finite diff`)
			}

			// 2) f(x) = exp(x) / (x^2 + 1) / (2x + 5) (3-operand iterative division)
			for (const x of [-1.2, 0, 0.75, 2.1]) {
				const a = { v: Math.exp(x), d: Math.exp(x) }
				const b = { v: x * x + 1, d: 2 * x }
				const c = { v: 2 * x + 5, d: 2 }
				const dual = divideDualIterative(a, b, c)

				const f = (t) => Math.exp(t) / (t * t + 1) / (2 * t + 5)
				const fd = (f(x + h) - f(x - h)) / (2 * h)

				assertClose(dual.v, f(x), 1e-12, `chained(${x}) value`)
				assertClose(dual.d, fd, 1e-7, `chained(${x}) finite diff`)
			}
		})

		test('satisfies algebraic round-trip: (a / b) * b === a', () => {
			const pairs = [
				[
					{ v: 3.5, d: -1.25 },
					{ v: 2.2, d: 0.75 },
				],
				[
					{ v: -14.7, d: 8.3 },
					{ v: -3.1, d: -4.6 },
				],
				[
					{ v: 0.004, d: 9.1 },
					{ v: 7.3, d: -0.02 },
				],
			]

			for (const [a, b] of pairs) {
				const q = divideDualIterative(a, b)
				const reconstructed = multiplyDual(q, b)
				assertClose(reconstructed.v, a.v, 1e-12, 'round-trip v')
				assertClose(reconstructed.d, a.d, 1e-12, 'round-trip d')
			}
		})
	})
})
