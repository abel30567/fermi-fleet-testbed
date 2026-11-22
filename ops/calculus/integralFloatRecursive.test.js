import { describe, it } from 'node:test'
import assert from 'node:assert'
import { integralFloatRecursive } from './integralFloatRecursive.js'

function assertClose(actual, expected, tol = 1e-9, message) {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		message ?? `Expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`,
	)
}

describe('integralFloatRecursive', () => {
	describe('normal cases', () => {
		it('integrates constant and low-degree polynomials accurately', () => {
			assertClose(integralFloatRecursive(() => 5, 2, 7), 25, 1e-12)
			assertClose(integralFloatRecursive((x) => 2 * x + 1, 0, 5), 30, 1e-12)
			assertClose(integralFloatRecursive((x) => x * x, 0, 3), 9, 1e-12)
			// ∫_0^4 (3x^3 - 2x^2 + x - 5) dx = [3/4 x^4 - 2/3 x^3 + 1/2 x^2 - 5x]_0^4
			const cubicExpected = (3 / 4) * 256 - (2 / 3) * 64 + 8 - 20
			assertClose(
				integralFloatRecursive((x) => 3 * x ** 3 - 2 * x ** 2 + x - 5, 0, 4),
				cubicExpected,
				1e-10,
			)
		})

		it('integrates higher-degree polynomials', () => {
			// ∫_-1^2 (x^5 - 3x^4 + 2x^2 - 1) dx
			const F = (x) => x ** 6 / 6 - (3 * x ** 5) / 5 + (2 * x ** 3) / 3 - x
			const expected = F(2) - F(-1)
			assertClose(
				integralFloatRecursive((x) => x ** 5 - 3 * x ** 4 + 2 * x ** 2 - 1, -1, 2),
				expected,
				1e-10,
			)
		})

		it('integrates trigonometric functions', () => {
			assertClose(integralFloatRecursive(Math.sin, 0, Math.PI), 2, 1e-10)
			assertClose(integralFloatRecursive(Math.cos, 0, Math.PI / 2), 1, 1e-10)
			assertClose(integralFloatRecursive((x) => Math.sin(x) ** 2, 0, Math.PI), Math.PI / 2, 1e-10)
		})

		it('integrates exponential and reciprocal functions', () => {
			assertClose(integralFloatRecursive(Math.exp, 0, 1), Math.E - 1, 1e-10)
			assertClose(integralFloatRecursive((x) => 1 / x, 1, Math.E), 1, 1e-10)
		})

		it('integrates Gaussian and rational functions', () => {
			// ∫_-5^5 exp(-x^2) dx = sqrt(pi) * erf(5) ≈ sqrt(pi) within 2e-12
			assertClose(
				integralFloatRecursive((x) => Math.exp(-(x * x)), -5, 5),
				Math.sqrt(Math.PI),
				1e-9,
			)
			// Reference value of ∫_0^1 exp(-x^2) dx = (sqrt(pi)/2) * erf(1)
			assertClose(
				integralFloatRecursive((x) => Math.exp(-(x * x)), 0, 1),
				0.7468241328124271,
				1e-10,
			)
			// ∫_0^1 1 / (1 + x^2) dx = pi / 4
			assertClose(integralFloatRecursive((x) => 1 / (1 + x * x), 0, 1), Math.PI / 4, 1e-10)
			// ∫_0^2 1 / (1 + x) dx = ln(3)
			assertClose(integralFloatRecursive((x) => 1 / (1 + x), 0, 2), Math.log(3), 1e-10)
		})
	})

	describe('edge cases', () => {
		it('returns positive zero when a === b', () => {
			for (const x of [0, -0, 3.5, -42.125]) {
				const res = integralFloatRecursive(Math.sin, x, x)
				assert.ok(Object.is(res, 0), `Expected +0 for a === b === ${x}, got ${res}`)
			}
		})

		it('negates the integral when bounds are reversed (a > b)', () => {
			const forward = integralFloatRecursive(Math.sin, 0, Math.PI)
			const backward = integralFloatRecursive(Math.sin, Math.PI, 0)
			assert.strictEqual(backward, -forward)
			assertClose(backward, -2, 1e-10)

			const expForward = integralFloatRecursive(Math.exp, -1, 2)
			const expBackward = integralFloatRecursive(Math.exp, 2, -1)
			assert.strictEqual(expBackward, -expForward)
		})

		it('handles oscillatory functions accurately', () => {
			// ∫_0^(2pi) sin(10x) dx = 0
			assertClose(integralFloatRecursive((x) => Math.sin(10 * x), 0, 2 * Math.PI), 0, 1e-9)

			// ∫_0^1 sin^2(4pi x) dx = 0.5 (tests that minDepth prevents zero-sampling aliasing)
			assertClose(
				integralFloatRecursive((x) => Math.sin(4 * Math.PI * x) ** 2, 0, 1),
				0.5,
				1e-10,
			)

			// ∫_0^pi sin(20x) * cos(3x) dx = 1/2 ∫_0^pi (sin(23x) + sin(17x)) dx = 1/23 + 1/17
			const expected = 1 / 23 + 1 / 17
			assertClose(
				integralFloatRecursive((x) => Math.sin(20 * x) * Math.cos(3 * x), 0, Math.PI),
				expected,
				1e-9,
			)
		})

		it('handles sharply peaked functions via adaptive refinement', () => {
			// Narrow Lorentzian centered at x = 0.3: ∫_-1^1 1 / (1 + 1000 (x - 0.3)^2) dx
			const k = Math.sqrt(1000)
			const lorentzianExpected = (Math.atan(k * 0.7) - Math.atan(-k * 1.3)) / k
			assertClose(
				integralFloatRecursive((x) => 1 / (1 + 1000 * (x - 0.3) ** 2), -1, 1),
				lorentzianExpected,
				1e-9,
			)

			// Narrow Gaussian centered at x = 0.37: ∫_0^1 exp(-500 (x - 0.37)^2) dx ≈ sqrt(pi / 500)
			assertClose(
				integralFloatRecursive((x) => Math.exp(-500 * (x - 0.37) ** 2), 0, 1),
				Math.sqrt(Math.PI / 500),
				1e-9,
			)
		})

		it('handles large-scale integrals without stalling on float64 roundoff', () => {
			// ∫_0^1000 x^3 dx = 1000^4 / 4 = 2.5e11
			const actual = integralFloatRecursive((x) => x ** 3, 0, 1000)
			const expected = 2.5e11
			assert.ok(Math.abs(actual - expected) / expected < 1e-14)
		})

		it('respects custom tolerance, maxDepth, and minDepth options', () => {
			// With maxDepth: 0, performs single Simpson rule on [0, pi] for sin(x): (pi/6)*(0 + 4*1 + 0) = 2pi/3
			const coarse = integralFloatRecursive(Math.sin, 0, Math.PI, { maxDepth: 0 })
			assertClose(coarse, (2 * Math.PI) / 3, 1e-15)

			// Tighter tolerance yields higher accuracy
			const tight = integralFloatRecursive((x) => Math.exp(x) * Math.cos(x), 0, Math.PI, {
				tolerance: 1e-13,
				maxDepth: 25,
				minDepth: 3,
			})
			const exact = (-Math.exp(Math.PI) - 1) / 2
			assertClose(tight, exact, 1e-12)
		})
	})

	describe('validation errors', () => {
		it('rejects invalid integrand function', () => {
			for (const bad of [null, undefined, 42, 'x => x', {}]) {
				assert.throws(() => integralFloatRecursive(bad, 0, 1), TypeError)
			}
		})

		it('rejects non-number or non-finite bounds', () => {
			assert.throws(() => integralFloatRecursive(Math.sin, '0', 1), TypeError)
			assert.throws(() => integralFloatRecursive(Math.sin, 0, '1'), TypeError)
			assert.throws(() => integralFloatRecursive(Math.sin, NaN, 1), RangeError)
			assert.throws(() => integralFloatRecursive(Math.sin, 0, Infinity), RangeError)
			assert.throws(() => integralFloatRecursive(Math.sin, -Infinity, 1), RangeError)
		})

		it('rejects invalid options', () => {
			assert.throws(() => integralFloatRecursive(Math.sin, 0, 1, null), TypeError)
			assert.throws(() => integralFloatRecursive(Math.sin, 0, 1, []), TypeError)
			assert.throws(() => integralFloatRecursive(Math.sin, 0, 1, 'opts'), TypeError)

			assert.throws(() => integralFloatRecursive(Math.sin, 0, 1, { tolerance: '1e-6' }), TypeError)
			assert.throws(() => integralFloatRecursive(Math.sin, 0, 1, { tolerance: 0 }), RangeError)
			assert.throws(() => integralFloatRecursive(Math.sin, 0, 1, { tolerance: -1e-6 }), RangeError)
			assert.throws(() => integralFloatRecursive(Math.sin, 0, 1, { tolerance: NaN }), RangeError)
			assert.throws(
				() => integralFloatRecursive(Math.sin, 0, 1, { tolerance: Infinity }),
				RangeError,
			)

			assert.throws(() => integralFloatRecursive(Math.sin, 0, 1, { maxDepth: '10' }), TypeError)
			assert.throws(() => integralFloatRecursive(Math.sin, 0, 1, { maxDepth: -1 }), RangeError)
			assert.throws(() => integralFloatRecursive(Math.sin, 0, 1, { maxDepth: 2.5 }), RangeError)
			assert.throws(
				() => integralFloatRecursive(Math.sin, 0, 1, { maxDepth: Infinity }),
				RangeError,
			)

			assert.throws(() => integralFloatRecursive(Math.sin, 0, 1, { minDepth: '2' }), TypeError)
			assert.throws(() => integralFloatRecursive(Math.sin, 0, 1, { minDepth: -1 }), RangeError)
			assert.throws(() => integralFloatRecursive(Math.sin, 0, 1, { minDepth: 1.5 }), RangeError)
			assert.throws(
				() => integralFloatRecursive(Math.sin, 0, 1, { maxDepth: 3, minDepth: 4 }),
				RangeError,
			)
		})

		it('rejects integrands returning non-number or non-finite values', () => {
			assert.throws(() => integralFloatRecursive(() => '1', 0, 1), TypeError)
			assert.throws(() => integralFloatRecursive(() => NaN, 0, 1), RangeError)
			assert.throws(() => integralFloatRecursive((x) => 1 / x, 0, 1), RangeError)
		})
	})

	describe('cross-checks and calculus identities', () => {
		it('matches analytical antiderivatives (Fundamental Theorem of Calculus)', () => {
			const cases = [
				{
					name: 'x * exp(x)',
					f: (x) => x * Math.exp(x),
					F: (x) => (x - 1) * Math.exp(x),
					a: -1.5,
					b: 2.25,
				},
				{
					name: '1 / (1 + x^2)',
					f: (x) => 1 / (1 + x * x),
					F: (x) => Math.atan(x),
					a: -3,
					b: 5,
				},
				{
					name: 'cos(x) * exp(sin(x))',
					f: (x) => Math.cos(x) * Math.exp(Math.sin(x)),
					F: (x) => Math.exp(Math.sin(x)),
					a: -0.7,
					b: 4.1,
				},
				{
					name: '1 / sqrt(1 + x^2)',
					f: (x) => 1 / Math.sqrt(1 + x * x),
					F: (x) => Math.asinh(x),
					a: -2,
					b: 6,
				},
			]

			for (const { name, f, F, a, b } of cases) {
				const numerical = integralFloatRecursive(f, a, b)
				const analytical = F(b) - F(a)
				assertClose(numerical, analytical, 1e-9, `FTC mismatch for ${name}`)
			}
		})

		it('satisfies interval additivity: ∫_a^c = ∫_a^b + ∫_b^c', () => {
			const f = (x) => Math.exp(-0.2 * x) * Math.sin(3 * x) + x * x

			// Standard ordering a < b < c
			const whole = integralFloatRecursive(f, -1, 4)
			const part1 = integralFloatRecursive(f, -1, 1.3)
			const part2 = integralFloatRecursive(f, 1.3, 4)
			assertClose(part1 + part2, whole, 1e-9)

			// Non-monotonic intermediate point b > c
			const ext1 = integralFloatRecursive(f, -1, 6.5)
			const ext2 = integralFloatRecursive(f, 6.5, 4)
			assertClose(ext1 + ext2, whole, 1e-9)
		})

		it('satisfies linearity: ∫ (αf + βg) = α∫f + β∫g', () => {
			const f = (x) => Math.sin(2 * x)
			const g = (x) => Math.exp(-x * x)
			const alpha = 3.25
			const beta = -1.75
			const a = -0.5
			const b = 2.5

			const combined = integralFloatRecursive((x) => alpha * f(x) + beta * g(x), a, b)
			const separate =
				alpha * integralFloatRecursive(f, a, b) + beta * integralFloatRecursive(g, a, b)
			assertClose(combined, separate, 1e-9)
		})
	})
})
