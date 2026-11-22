import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { divideDualIterative } from './divideDualIterative.js'

/**
 * Helper: dual number multiplication `(x.v + x.dε)(y.v + y.dε)`
 * used for independent algebraic cross-checks.
 */
function mulDual(x, y) {
	return {
		v: x.v * y.v,
		d: x.v * y.d + x.d * y.v,
	}
}

/**
 * Helper: asserts two numbers are close within absolute + relative tolerance.
 */
function assertClose(actual, expected, tol = 1e-12, label = '') {
	const scale = Math.max(1, Math.abs(expected))
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol * scale,
		`${label}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
	)
}

describe('divideDualIterative', () => {
	describe('basic binary division', () => {
		it('applies the quotient rule accurately on integer dual numbers', () => {
			// (6 + 2ε) / (2 + 1ε) = 3 + ((2*2 - 6*1) / 4)ε = 3 - 0.5ε
			const res = divideDualIterative({ v: 6, d: 2 }, { v: 2, d: 1 })
			assert.deepStrictEqual(res, { v: 3, d: -0.5 })
		})

		it('handles constant dual numbers (zero derivatives)', () => {
			const res = divideDualIterative({ v: 15, d: 0 }, { v: 4, d: 0 })
			assert.deepStrictEqual(res, { v: 3.75, d: 0 })
		})

		it('handles division by a constant dual number', () => {
			// (a.v + a.dε) / (c + 0ε) = a.v/c + (a.d/c)ε
			const res = divideDualIterative({ v: 10, d: -6 }, { v: 2, d: 0 })
			assert.deepStrictEqual(res, { v: 5, d: -3 })
		})

		it('computes reciprocal derivative d/dx (1/x) = -1/x^2', () => {
			for (const x of [-4, -0.5, 0.25, 2, 5]) {
				const res = divideDualIterative({ v: 1, d: 0 }, { v: x, d: 1 })
				assertClose(res.v, 1 / x, 1e-14, `1/${x} value: `)
				assertClose(res.d, -1 / (x * x), 1e-14, `1/${x} derivative: `)
			}
		})

		it('returns { v: 1, d: 0 } when dividing a dual number by itself', () => {
			for (const a of [
				{ v: 7, d: 3 },
				{ v: -2.5, d: 9.1 },
				{ v: 49, d: 49 },
			]) {
				const res = divideDualIterative(a, a)
				assert.deepStrictEqual(res, { v: 1, d: 0 })
			}
		})

		it('handles zero numerator and normalizes -0 to 0', () => {
			const res1 = divideDualIterative({ v: 0, d: 6 }, { v: -3, d: 4 })
			assert.ok(Object.is(res1.v, 0), 'v should be +0, not -0')
			assert.strictEqual(res1.d, -2)

			const res2 = divideDualIterative({ v: 0, d: 0 }, { v: -5, d: 2 })
			assert.ok(Object.is(res2.v, 0), 'v should be +0')
			assert.ok(Object.is(res2.d, 0), 'd should be +0')
		})

		it('does not mutate input dual objects', () => {
			const a = Object.freeze({ v: 12, d: 5 })
			const b = Object.freeze({ v: 3, d: -2 })
			const c = Object.freeze({ v: 2, d: 1 })
			const res = divideDualIterative(a, b, c)
			assert.deepStrictEqual(a, { v: 12, d: 5 })
			assert.deepStrictEqual(b, { v: 3, d: -2 })
			assert.deepStrictEqual(c, { v: 2, d: 1 })
			assert.strictEqual(res.v, 2)
		})
	})

	describe('multi-argument iterative division', () => {
		it('folds 3 dual numbers left-associatively: ((a / b) / c)', () => {
			const a = { v: 24, d: 5 }
			const b = { v: 3, d: 1 }
			const c = { v: 2, d: -1 }

			const chained = divideDualIterative(a, b, c)
			const nested = divideDualIterative(divideDualIterative(a, b), c)
			assert.deepStrictEqual(chained, nested)
		})

		it('matches a / (b * c * d) for 4 arguments', () => {
			const a = { v: 120, d: 17 }
			const b = { v: 2, d: 0.5 }
			const c = { v: -3, d: 1.25 }
			const d = { v: 4, d: -0.75 }

			const iterative = divideDualIterative(a, b, c, d)
			const combinedDivisor = mulDual(mulDual(b, c), d)
			const expected = divideDualIterative(a, combinedDivisor)

			assertClose(iterative.v, expected.v, 1e-13, '4-arg value: ')
			assertClose(iterative.d, expected.d, 1e-13, '4-arg derivative: ')
		})
	})

	describe('numerical edge cases', () => {
		it('handles very large divisor where b.v * b.v overflows IEEE-754', () => {
			// b.v = 1e200 => b.v * b.v = Infinity, yet exact quotient & derivative are finite
			const a = { v: 2e200, d: 3e200 }
			const b = { v: 1e200, d: 1e200 }
			// v = 2, d = (3e200 - 2*1e200) / 1e200 = 1
			const res = divideDualIterative(a, b)
			assertClose(res.v, 2, 1e-12, 'large divisor v: ')
			assertClose(res.d, 1, 1e-12, 'large divisor d: ')
		})

		it('handles very small divisor where b.v * b.v underflows to 0', () => {
			// b.v = 1e-200 => b.v * b.v = 0, yet exact quotient & derivative are finite
			const a = { v: 6e-200, d: 5e-200 }
			const b = { v: 2e-200, d: 1e-200 }
			// v = 3, d = (5e-200 - 3*1e-200) / 2e-200 = 1
			const res = divideDualIterative(a, b)
			assertClose(res.v, 3, 1e-12, 'small divisor v: ')
			assertClose(res.d, 1, 1e-12, 'small divisor d: ')
		})

		it('throws RangeError when the resulting quotient overflows to Infinity', () => {
			assert.throws(
				() => divideDualIterative({ v: 1e308, d: 0 }, { v: 1e-10, d: 0 }),
				RangeError
			)
		})
	})

	describe('input validation', () => {
		it('throws RangeError when fewer than 2 arguments are provided', () => {
			assert.throws(() => divideDualIterative(), RangeError)
			assert.throws(() => divideDualIterative({ v: 1, d: 1 }), RangeError)
		})

		it('throws TypeError for non-object or array arguments', () => {
			const invalidInputs = [null, undefined, 42, '1', true, [1, 2]]
			for (const bad of invalidInputs) {
				assert.throws(
					() => divideDualIterative(bad, { v: 1, d: 0 }),
					TypeError
				)
				assert.throws(
					() => divideDualIterative({ v: 1, d: 0 }, bad),
					TypeError
				)
			}
		})

		it('throws TypeError when v or d is missing or not a number', () => {
			const badObjects = [
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 1, d: '0' },
				{ v: 1n, d: 0 },
				{ v: null, d: 0 },
				{ v: 1, d: undefined },
			]
			for (const bad of badObjects) {
				assert.throws(
					() => divideDualIterative(bad, { v: 2, d: 1 }),
					TypeError
				)
				assert.throws(
					() => divideDualIterative({ v: 2, d: 1 }, bad),
					TypeError
				)
			}
		})

		it('throws RangeError for NaN, Infinity, or -Infinity components', () => {
			const nonFinite = [NaN, Infinity, -Infinity]
			for (const badVal of nonFinite) {
				assert.throws(
					() => divideDualIterative({ v: badVal, d: 1 }, { v: 2, d: 1 }),
					RangeError
				)
				assert.throws(
					() => divideDualIterative({ v: 1, d: badVal }, { v: 2, d: 1 }),
					RangeError
				)
				assert.throws(
					() => divideDualIterative({ v: 1, d: 1 }, { v: badVal, d: 1 }),
					RangeError
				)
				assert.throws(
					() => divideDualIterative({ v: 1, d: 1 }, { v: 2, d: badVal }),
					RangeError
				)
			}
		})

		it('throws RangeError on division by zero (including -0 and later arguments)', () => {
			assert.throws(
				() => divideDualIterative({ v: 1, d: 1 }, { v: 0, d: 1 }),
				RangeError
			)
			assert.throws(
				() => divideDualIterative({ v: 1, d: 1 }, { v: -0, d: 0 }),
				RangeError
			)
			assert.throws(
				() =>
					divideDualIterative(
						{ v: 10, d: 1 },
						{ v: 2, d: 0 },
						{ v: 0, d: 5 }
					),
				RangeError
			)
		})
	})

	describe('cross-check: central finite differences on rational functions', () => {
		const h = 1e-6

		it('matches central finite differences for polynomial rational f(x) / g(x)', () => {
			// f(x) = x^3 - 2x + 5, f'(x) = 3x^2 - 2
			// g(x) = x^2 + 1,      g'(x) = 2x
			const f = (x) => x ** 3 - 2 * x + 5
			const df = (x) => 3 * x ** 2 - 2
			const g = (x) => x ** 2 + 1
			const dg = (x) => 2 * x
			const q = (x) => f(x) / g(x)

			for (const x of [-3.5, -1, 0, 0.75, 2.25, 5]) {
				const dual = divideDualIterative(
					{ v: f(x), d: df(x) },
					{ v: g(x), d: dg(x) }
				)
				const centralDiff = (q(x + h) - q(x - h)) / (2 * h)

				assertClose(dual.v, q(x), 1e-14, `poly q(${x}) value: `)
				assertClose(dual.d, centralDiff, 1e-8, `poly q'(${x}) vs finite diff: `)
			}
		})

		it('matches central finite differences for transcendental quotient (sin(x) + 2x) / (exp(x) + x^2 + 1)', () => {
			const f = (x) => Math.sin(x) + 2 * x
			const df = (x) => Math.cos(x) + 2
			const g = (x) => Math.exp(x) + x * x + 1
			const dg = (x) => Math.exp(x) + 2 * x
			const q = (x) => f(x) / g(x)

			for (const x of [-2, -0.5, 0, 0.8, 1.7, 3]) {
				const dual = divideDualIterative(
					{ v: f(x), d: df(x) },
					{ v: g(x), d: dg(x) }
				)
				const centralDiff = (q(x + h) - q(x - h)) / (2 * h)

				assertClose(dual.v, q(x), 1e-14, `transcendental q(${x}) value: `)
				assertClose(
					dual.d,
					centralDiff,
					1e-8,
					`transcendental q'(${x}) vs finite diff: `
				)
			}
		})

		it('matches central finite differences for 3-factor rational f(x) / g(x) / k(x)', () => {
			const f = (x) => x ** 4 + 3 * x + 1
			const df = (x) => 4 * x ** 3 + 3
			const g = (x) => x ** 2 + 2
			const dg = (x) => 2 * x
			const k = (x) => x + 5
			const dk = () => 1
			const q = (x) => f(x) / g(x) / k(x)

			for (const x of [-2.5, -0.3, 0, 1.4, 3.2]) {
				const dual = divideDualIterative(
					{ v: f(x), d: df(x) },
					{ v: g(x), d: dg(x) },
					{ v: k(x), d: dk(x) }
				)
				const centralDiff = (q(x + h) - q(x - h)) / (2 * h)

				assertClose(dual.v, q(x), 1e-14, `3-factor q(${x}) value: `)
				assertClose(
					dual.d,
					centralDiff,
					1e-8,
					`3-factor q'(${x}) vs finite diff: `
				)
			}
		})
	})

	describe('cross-check: algebraic inverse identity (a / b) * b == a', () => {
		it('recovers a from (a / b) * b across diverse dual pairs', () => {
			const pairs = [
				[
					{ v: 7, d: 3 },
					{ v: 2, d: 5 },
				],
				[
					{ v: -13.5, d: 4.2 },
					{ v: 3.1, d: -7.8 },
				],
				[
					{ v: 0, d: 9.5 },
					{ v: -4.25, d: 1.75 },
				],
				[
					{ v: 1e-5, d: -2e-4 },
					{ v: 3e3, d: 5e2 },
				],
				[
					{ v: Math.PI, d: Math.E },
					{ v: -Math.SQRT2, d: Math.LN10 },
				],
			]

			for (const [a, b] of pairs) {
				const q = divideDualIterative(a, b)
				const recovered = mulDual(q, b)
				assertClose(recovered.v, a.v, 1e-12, '(a/b)*b value: ')
				assertClose(recovered.d, a.d, 1e-12, '(a/b)*b derivative: ')
			}
		})

		it('recovers a from ((a / b) / c) * c * b == a for 3-argument chains', () => {
			const triples = [
				[
					{ v: 11, d: -4 },
					{ v: 3, d: 2 },
					{ v: -5, d: 7 },
				],
				[
					{ v: 0.75, d: 1.25 },
					{ v: -0.4, d: 0.9 },
					{ v: 2.6, d: -1.1 },
				],
			]

			for (const [a, b, c] of triples) {
				const q = divideDualIterative(a, b, c)
				const recovered = mulDual(mulDual(q, c), b)
				assertClose(recovered.v, a.v, 1e-12, '((a/b)/c)*c*b value: ')
				assertClose(recovered.d, a.d, 1e-12, '((a/b)/c)*c*b derivative: ')
			}
		})
	})
})
