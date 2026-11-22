import { describe, test } from 'node:test'
import assert from 'node:assert'
import { laplaceTransformFloatIterative } from './laplaceTransformFloatIterative.js'

function assertClose(actual, expected, tolerance = 1e-6, message = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tolerance,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tolerance} of ${expected} (diff=${diff})`,
	)
}

describe('laplaceTransformFloatIterative', () => {
	describe('fundamental transforms and edge cases', () => {
		test('constant function f(t) = 1 -> 1 / s', () => {
			for (const s of [0.5, 1, 2, 5, 10]) {
				const actual = laplaceTransformFloatIterative(() => 1, s)
				assertClose(actual, 1 / s, 1e-8, `f(t)=1 at s=${s}`)
			}
		})

		test('ramp function f(t) = t -> 1 / s^2', () => {
			for (const s of [0.5, 1, 2, 4]) {
				const actual = laplaceTransformFloatIterative((t) => t, s)
				assertClose(actual, 1 / (s * s), 1e-7, `f(t)=t at s=${s}`)
			}
		})

		test('exponential function f(t) = e^(a*t) -> 1 / (s - a) for s > a', () => {
			const cases = [
				{ a: -2, s: 1 },
				{ a: -0.5, s: 0.5 },
				{ a: 1, s: 2.5 },
				{ a: 1.5, s: 3 },
			]
			for (const { a, s } of cases) {
				const actual = laplaceTransformFloatIterative((t) => Math.exp(a * t), s)
				assertClose(actual, 1 / (s - a), 1e-7, `f(t)=e^(${a}t) at s=${s}`)
			}
		})

		test('sine function f(t) = sin(ω*t) -> ω / (s^2 + ω^2)', () => {
			const cases = [
				{ omega: 1, s: 1 },
				{ omega: 3, s: 2 },
				{ omega: 5, s: 1.5 },
			]
			for (const { omega, s } of cases) {
				const actual = laplaceTransformFloatIterative((t) => Math.sin(omega * t), s)
				const expected = omega / (s * s + omega * omega)
				assertClose(actual, expected, 1e-7, `sin(${omega}t) at s=${s}`)
			}
		})

		test('cosine function f(t) = cos(ω*t) -> s / (s^2 + ω^2)', () => {
			const cases = [
				{ omega: 1, s: 1 },
				{ omega: 3, s: 2 },
				{ omega: 5, s: 1.5 },
			]
			for (const { omega, s } of cases) {
				const actual = laplaceTransformFloatIterative((t) => Math.cos(omega * t), s)
				const expected = s / (s * s + omega * omega)
				assertClose(actual, expected, 1e-7, `cos(${omega}t) at s=${s}`)
			}
		})

		test('zero function returns positive 0 (never -0)', () => {
			const result = laplaceTransformFloatIterative(() => 0, 2)
			assert.strictEqual(Object.is(result, 0), true)

			const negZeroResult = laplaceTransformFloatIterative(() => -0, 2)
			assert.strictEqual(Object.is(negZeroResult, 0), true)
		})

		test('convergent transforms at s = 0 and negative s', () => {
			// f(t) = e^(-3t) has region of convergence s > -3
			const atZero = laplaceTransformFloatIterative((t) => Math.exp(-3 * t), 0)
			assertClose(atZero, 1 / 3, 1e-8, 'e^(-3t) at s=0')

			const atNegative = laplaceTransformFloatIterative((t) => Math.exp(-3 * t), -1)
			assertClose(atNegative, 1 / 2, 1e-8, 'e^(-3t) at s=-1')

			// Compactly supported unit pulse f(t) = 1 on [0, 2]: ∫_0^2 e^t dt = e^2 - 1 at s = -1
			const pulse = (t) => (t <= 2 ? 1 : 0)
			const pulseAtNeg = laplaceTransformFloatIterative(pulse, -1, 2, 1000)
			assertClose(pulseAtNeg, Math.exp(2) - 1, 1e-10, 'unit pulse on [0,2] at s=-1')

			// Continuous compactly supported bump f(t) = t*(2-t) on [0, 2], 0 elsewhere:
			// At s = -1: ∫_0^2 (2t - t^2) e^t dt = [(-t^2 + 4t - 4) e^t]_0^2 = 4.
			// Also verifies zero-valued tail does not produce 0 * Infinity = NaN when s < 0.
			const bump = (t) => (t <= 2 ? t * (2 - t) : 0)
			const bumpAtNeg = laplaceTransformFloatIterative(bump, -1, 50, 20000)
			assertClose(bumpAtNeg, 4, 1e-5, 'compactly supported bump at s=-1')
		})

		test('handles odd and small step counts accurately (steps = 1, 3, 5, 3001)', () => {
			// Linear function at s = 0 over [0, 2]: ∫_0^2 (3t + 1) dt = 8 (exact for trapezoidal steps=1)
			assertClose(
				laplaceTransformFloatIterative((t) => 3 * t + 1, 0, 2, 1),
				8,
				1e-12,
				'steps=1 trapezoidal',
			)

			// Cubic polynomial at s = 0 over [0, 2]: ∫_0^2 t^3 dt = 4 (exact for Simpson 3/8 and 1/3+3/8)
			assertClose(
				laplaceTransformFloatIterative((t) => t ** 3, 0, 2, 3),
				4,
				1e-12,
				'steps=3 Simpson 3/8',
			)
			assertClose(
				laplaceTransformFloatIterative((t) => t ** 3, 0, 2, 5),
				4,
				1e-12,
				'steps=5 Simpson 1/3 + 3/8',
			)

			// Odd step count on standard Laplace transform
			assertClose(
				laplaceTransformFloatIterative((t) => Math.exp(-t), 2, 30, 3001),
				1 / 3,
				1e-8,
				'steps=3001 odd Simpson',
			)
		})

		test('accuracy improves with higher upperLimit and steps', () => {
			const exact = 1 / 1.5
			const coarse = laplaceTransformFloatIterative(() => 1, 1.5, 5, 10)
			const fine = laplaceTransformFloatIterative(() => 1, 1.5, 40, 2000)
			assert.ok(
				Math.abs(fine - exact) < Math.abs(coarse - exact),
				`expected fine error (${Math.abs(fine - exact)}) < coarse error (${Math.abs(coarse - exact)})`,
			)
		})
	})

	describe('closed-form Laplace table and algebraic property cross-checks', () => {
		test('cross-check against standard closed-form Laplace transform table', () => {
			const table = [
				{
					name: 't^2 -> 2! / s^3',
					f: (t) => t * t,
					s: 2,
					closedForm: (s) => 2 / s ** 3,
				},
				{
					name: 't^3 -> 3! / s^4',
					f: (t) => t ** 3,
					s: 2.5,
					closedForm: (s) => 6 / s ** 4,
				},
				{
					name: 't * e^(-a*t) -> 1 / (s + a)^2',
					f: (t) => t * Math.exp(-1.5 * t),
					s: 2,
					closedForm: (s) => 1 / (s + 1.5) ** 2,
				},
				{
					name: 'e^(-a*t) * sin(ω*t) -> ω / ((s + a)^2 + ω^2)',
					f: (t) => Math.exp(-0.75 * t) * Math.sin(4 * t),
					s: 1.25,
					closedForm: (s) => 4 / ((s + 0.75) ** 2 + 16),
				},
				{
					name: 'e^(-a*t) * cos(ω*t) -> (s + a) / ((s + a)^2 + ω^2)',
					f: (t) => Math.exp(-0.75 * t) * Math.cos(4 * t),
					s: 1.25,
					closedForm: (s) => (s + 0.75) / ((s + 0.75) ** 2 + 16),
				},
				{
					name: 'sinh(a*t) -> a / (s^2 - a^2)',
					f: (t) => Math.sinh(0.5 * t),
					s: 2,
					closedForm: (s) => 0.5 / (s * s - 0.25),
				},
				{
					name: 'cosh(a*t) -> s / (s^2 - a^2)',
					f: (t) => Math.cosh(0.5 * t),
					s: 2,
					closedForm: (s) => s / (s * s - 0.25),
				},
			]

			for (const entry of table) {
				const numerical = laplaceTransformFloatIterative(entry.f, entry.s, 60, 20000)
				const exact = entry.closedForm(entry.s)
				assertClose(numerical, exact, 1e-7, entry.name)
			}
		})

		test('linearity: L{a*f + b*g}(s) = a*L{f}(s) + b*L{g}(s)', () => {
			const f = (t) => Math.sin(2 * t)
			const g = (t) => Math.exp(-0.5 * t) * t
			const a = 3.5
			const b = -2.25
			const s = 2.5

			const lhs = laplaceTransformFloatIterative((t) => a * f(t) + b * g(t), s, 50, 10000)
			const rhs =
				a * laplaceTransformFloatIterative(f, s, 50, 10000) +
				b * laplaceTransformFloatIterative(g, s, 50, 10000)

			assertClose(lhs, rhs, 1e-12, 'linearity identity')

			const exact = a * (2 / (s * s + 4)) + b * (1 / (s + 0.5) ** 2)
			assertClose(lhs, exact, 1e-7, 'linearity against closed form')
		})

		test('frequency shift: L{e^(a*t) * f(t)}(s) = L{f}(s - a)', () => {
			const f = (t) => Math.cos(3 * t)
			const a = 0.8
			const s = 2.5

			const shifted = laplaceTransformFloatIterative((t) => Math.exp(a * t) * f(t), s, 50, 20000)
			const unshifted = laplaceTransformFloatIterative(f, s - a, 50, 20000)
			assertClose(shifted, unshifted, 1e-8, 'frequency shift identity')
		})

		test('time scaling: L{f(c*t)}(s) = (1/c) * L{f}(s/c) for c > 0', () => {
			const f = (t) => Math.sin(t) + Math.exp(-t)
			const c = 2.5
			const s = 3

			const lhs = laplaceTransformFloatIterative((t) => f(c * t), s, 50, 20000)
			const rhs = (1 / c) * laplaceTransformFloatIterative(f, s / c, 50, 20000)
			assertClose(lhs, rhs, 1e-7, 'time scaling identity')
		})
	})

	describe('input validation', () => {
		test('rejects invalid f', () => {
			for (const badF of [null, undefined, 42, 't => t', {}, []]) {
				assert.throws(() => laplaceTransformFloatIterative(badF, 1), TypeError)
			}
		})

		test('rejects invalid s', () => {
			for (const badS of [null, undefined, '1', {}, true, 1n]) {
				assert.throws(() => laplaceTransformFloatIterative(() => 1, badS), TypeError)
			}
			for (const nonFiniteS of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				assert.throws(() => laplaceTransformFloatIterative(() => 1, nonFiniteS), RangeError)
			}
		})

		test('rejects invalid upperLimit', () => {
			for (const badLimit of [null, '50', {}, true]) {
				assert.throws(() => laplaceTransformFloatIterative(() => 1, 1, badLimit), TypeError)
			}
			for (const badRange of [0, -0, -10, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				assert.throws(() => laplaceTransformFloatIterative(() => 1, 1, badRange), RangeError)
			}
		})

		test('rejects invalid steps', () => {
			for (const badSteps of [null, '100', {}, true]) {
				assert.throws(() => laplaceTransformFloatIterative(() => 1, 1, 10, badSteps), TypeError)
			}
			for (const badRange of [
				0,
				-5,
				2.5,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY,
				Number.MAX_SAFE_INTEGER + 1,
			]) {
				assert.throws(() => laplaceTransformFloatIterative(() => 1, 1, 10, badRange), RangeError)
			}
		})

		test('rejects non-number, non-finite, or overflowing integrand values', () => {
			assert.throws(() => laplaceTransformFloatIterative(() => '1', 1, 10, 10), TypeError)
			assert.throws(() => laplaceTransformFloatIterative(() => Number.NaN, 1, 10, 10), RangeError)
			assert.throws(
				() => laplaceTransformFloatIterative(() => Number.POSITIVE_INFINITY, 1, 10, 10),
				RangeError,
			)
			// Exponential overflow: e^(-(-100)*50) = e^5000 = Infinity
			assert.throws(() => laplaceTransformFloatIterative(() => 1, -100, 50, 10), RangeError)
		})
	})
})
