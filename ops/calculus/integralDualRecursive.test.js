import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { integralDualRecursive } from './integralDualRecursive.js'

// Local dual-number primitives for constructing test integrands
const dual = (v, d = 0) => ({ v, d })
const dAdd = (a, b) => ({ v: a.v + b.v, d: a.d + b.d })
const dSub = (a, b) => ({ v: a.v - b.v, d: a.d - b.d })
const dMul = (a, b) => ({ v: a.v * b.v, d: a.d * b.v + a.v * b.d })
const dDiv = (a, b) => ({ v: a.v / b.v, d: (a.d * b.v - a.v * b.d) / (b.v * b.v) })
const dSin = (a) => ({ v: Math.sin(a.v), d: Math.cos(a.v) * a.d })
const dCos = (a) => ({ v: Math.cos(a.v), d: -Math.sin(a.v) * a.d })
const dExp = (a) => {
	const e = Math.exp(a.v)
	return { v: e, d: e * a.d }
}

function assertClose(actual, expected, tol = 1e-9, msg = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${msg ? msg + ': ' : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

describe('integralDualRecursive', () => {
	describe('normal cases', () => {
		it('integrates a polynomial with constant bounds', () => {
			// ∫_0^3 x^2 dx = 9
			const res = integralDualRecursive((x) => dMul(x, x), dual(0), dual(3))
			assertClose(res.v, 9, 1e-12)
			assertClose(res.d, 0, 1e-12)
		})

		it('propagates parameter derivative through integrand (polynomial)', () => {
			// I(p) = ∫_0^2 (p * x^2 + 3) dx = (8/3)p + 6, I'(p) = 8/3
			const p = dual(4, 1)
			const res = integralDualRecursive(
				(x) => dAdd(dMul(p, dMul(x, x)), dual(3)),
				dual(0),
				dual(2)
			)
			assertClose(res.v, (8 / 3) * 4 + 6, 1e-11)
			assertClose(res.d, 8 / 3, 1e-11)
		})

		it('propagates parameter derivative through transcendental integrand sin(k*x)', () => {
			// I(k) = ∫_0^π sin(k*x) dx = (1 - cos(k*π)) / k
			// I'(k) = (k*π*sin(k*π) - (1 - cos(k*π))) / k^2
			const kVal = 1.7
			const k = dual(kVal, 1)
			const res = integralDualRecursive((x) => dSin(dMul(k, x)), 0, Math.PI)

			const expectedV = (1 - Math.cos(kVal * Math.PI)) / kVal
			const expectedD = (kVal * Math.PI * Math.sin(kVal * Math.PI) - (1 - Math.cos(kVal * Math.PI))) / (kVal * kVal)
			assertClose(res.v, expectedV, 1e-9, 'value')
			assertClose(res.d, expectedD, 1e-9, 'derivative')
		})

		it('propagates parameter derivative through exp(λ*x)', () => {
			// I(λ) = ∫_0^1 e^(λx) dx = (e^λ - 1) / λ
			// I'(λ) = (λ e^λ - e^λ + 1) / λ^2
			const lamVal = 2.3
			const lam = dual(lamVal, 1)
			const res = integralDualRecursive((x) => dExp(dMul(lam, x)), dual(0), dual(1))

			const e = Math.exp(lamVal)
			assertClose(res.v, (e - 1) / lamVal, 1e-10)
			assertClose(res.d, (lamVal * e - e + 1) / (lamVal * lamVal), 1e-10)
		})

		it('supports moving upper bound (Fundamental Theorem of Calculus)', () => {
			// F(t) = ∫_0^t cos(x) dx = sin(t), F'(t) = cos(t)
			const t = 1.25
			const res = integralDualRecursive((x) => dCos(x), dual(0, 0), dual(t, 1))
			assertClose(res.v, Math.sin(t), 1e-10)
			assertClose(res.d, Math.cos(t), 1e-10)
		})

		it('supports moving lower bound', () => {
			// G(t) = ∫_t^2 e^x dx = e^2 - e^t, G'(t) = -e^t
			const t = 0.6
			const res = integralDualRecursive((x) => dExp(x), dual(t, 1), dual(2, 0))
			assertClose(res.v, Math.exp(2) - Math.exp(t), 1e-10)
			assertClose(res.d, -Math.exp(t), 1e-10)
		})

		it('handles sharply peaked Lorentzian integrand via adaptive subdivision', () => {
			// I(k) = ∫_-5^5 1 / (1 + (k*x)^2) dx = 2 * atan(5k) / k
			// I'(k) = (10k / (1 + 25k^2) - 2*atan(5k)) / k^2
			const kVal = 6
			const k = dual(kVal, 1)
			const res = integralDualRecursive(
				(x) => {
					const kx = dMul(k, x)
					return dDiv(dual(1), dAdd(dual(1), dMul(kx, kx)))
				},
				-5,
				5,
				{ tolerance: 1e-9, maxDepth: 22 }
			)
			const expectedV = (2 * Math.atan(5 * kVal)) / kVal
			const expectedD = (10 * kVal / (1 + 25 * kVal * kVal) - 2 * Math.atan(5 * kVal)) / (kVal * kVal)
			assertClose(res.v, expectedV, 1e-8, 'Lorentzian value')
			assertClose(res.d, expectedD, 1e-8, 'Lorentzian derivative')
		})
	})

	describe('edge cases', () => {
		it('returns { v: 0, d: 0 } for zero-width interval with fixed bounds', () => {
			const res = integralDualRecursive((x) => dExp(x), dual(2, 0), dual(2, 0))
			assert.equal(res.v, 0)
			assert.equal(res.d, 0)
			assert.equal(Object.is(res.v, -0), false)
			assert.equal(Object.is(res.d, -0), false)
		})

		it('computes exact Leibniz derivative for zero-width interval with moving bounds', () => {
			// a(θ) = 2 + θ, b(θ) = 2 + 3θ at θ = 0 => a_v = b_v = 2, a_d = 1, b_d = 3
			// I'(0) = f(2) * (3 - 1) = 2 * e^2
			const res = integralDualRecursive((x) => dExp(x), dual(2, 1), dual(2, 3))
			assert.equal(res.v, 0)
			assertClose(res.d, 2 * Math.exp(2), 1e-12)
		})

		it('handles reversed bounds (b < a) with both parameter and bound derivatives', () => {
			// I(θ) = ∫_{2θ}^{θ} θ*x dx = θ * (θ^2 - 4θ^2)/2 = -1.5 * θ^3
			// I'(θ) = -4.5 * θ^2
			const theta = 1.5
			const p = dual(theta, 1)
			const res = integralDualRecursive(
				(x) => dMul(p, x),
				dual(2 * theta, 2),
				dual(theta, 1)
			)
			assertClose(res.v, -1.5 * theta ** 3, 1e-10)
			assertClose(res.d, -4.5 * theta ** 2, 1e-10)
		})

		it('avoids false zero convergence on periodic functions via minDepth', () => {
			// ∫_0^{2π} sin^2(2x) dx = π (endpoints and midpoint are all 0)
			const res = integralDualRecursive(
				(x) => {
					const s = dSin(dMul(dual(2), x))
					return dMul(s, s)
				},
				0,
				2 * Math.PI
			)
			assertClose(res.v, Math.PI, 1e-9)
			assertClose(res.d, 0, 1e-9)
		})

		it('respects custom maxDepth: 0 (single Simpson step, exact for cubics)', () => {
			// ∫_0^2 (x^3 + p*x) dx = 4 + 2p, d/dp = 2
			const p = dual(5, 1)
			const res = integralDualRecursive(
				(x) => dAdd(dMul(x, dMul(x, x)), dMul(p, x)),
				0,
				2,
				{ maxDepth: 0 }
			)
			assertClose(res.v, 14, 1e-12)
			assertClose(res.d, 2, 1e-12)
		})

		it('handles large-magnitude integrands without stalling on float64 precision floor', () => {
			// ∫_0^1 (1e10 * x^2 + p * 1e10 * x) dx = 1e10/3 + 0.5e10*p
			const p = dual(2, 1)
			const scale = dual(1e10)
			const res = integralDualRecursive(
				(x) => dAdd(dMul(scale, dMul(x, x)), dMul(dMul(p, scale), x)),
				0,
				1,
				{ tolerance: 1e-10, maxDepth: 20 }
			)
			assertClose(res.v, 1e10 / 3 + 1e10, 1e-3)
			assertClose(res.d, 0.5e10, 1e-3)
		})
	})

	describe('input validation', () => {
		it('rejects non-function integrand', () => {
			assert.throws(() => integralDualRecursive(null, 0, 1), TypeError)
			assert.throws(() => integralDualRecursive(42, 0, 1), TypeError)
		})

		it('rejects malformed or non-finite bounds', () => {
			const id = (x) => x
			assert.throws(() => integralDualRecursive(id, null, 1), TypeError)
			assert.throws(() => integralDualRecursive(id, 0, undefined), TypeError)
			assert.throws(() => integralDualRecursive(id, '0', 1), TypeError)
			assert.throws(() => integralDualRecursive(id, [0, 0], 1), TypeError)
			assert.throws(() => integralDualRecursive(id, { v: 0 }, 1), TypeError)
			assert.throws(() => integralDualRecursive(id, { v: '0', d: 0 }, 1), TypeError)

			assert.throws(() => integralDualRecursive(id, NaN, 1), RangeError)
			assert.throws(() => integralDualRecursive(id, 0, Infinity), RangeError)
			assert.throws(() => integralDualRecursive(id, { v: -Infinity, d: 0 }, 1), RangeError)
			assert.throws(() => integralDualRecursive(id, { v: 0, d: NaN }, 1), RangeError)
		})

		it('rejects invalid integrand return values', () => {
			assert.throws(() => integralDualRecursive(() => 5, 0, 1), TypeError)
			assert.throws(() => integralDualRecursive(() => null, 0, 1), TypeError)
			assert.throws(() => integralDualRecursive(() => ({ v: 1 }), 0, 1), TypeError)
			assert.throws(() => integralDualRecursive(() => ({ v: NaN, d: 0 }), 0, 1), RangeError)
			assert.throws(() => integralDualRecursive(() => ({ v: 1, d: Infinity }), 0, 1), RangeError)
		})

		it('rejects invalid options', () => {
			const id = (x) => x
			assert.throws(() => integralDualRecursive(id, 0, 1, null), TypeError)
			assert.throws(() => integralDualRecursive(id, 0, 1, []), TypeError)
			assert.throws(() => integralDualRecursive(id, 0, 1, { tolerance: '1e-6' }), TypeError)
			assert.throws(() => integralDualRecursive(id, 0, 1, { tolerance: 0 }), RangeError)
			assert.throws(() => integralDualRecursive(id, 0, 1, { tolerance: -1e-6 }), RangeError)
			assert.throws(() => integralDualRecursive(id, 0, 1, { tolerance: NaN }), RangeError)
			assert.throws(() => integralDualRecursive(id, 0, 1, { maxDepth: -1 }), RangeError)
			assert.throws(() => integralDualRecursive(id, 0, 1, { maxDepth: 2.5 }), RangeError)
			assert.throws(() => integralDualRecursive(id, 0, 1, { maxDepth: 51 }), RangeError)
			assert.throws(() => integralDualRecursive(id, 0, 1, { maxDepth: 4, minDepth: 5 }), RangeError)
			assert.throws(() => integralDualRecursive(id, 0, 1, { minDepth: -1 }), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches closed-form analytic antiderivative + full Leibniz rule across θ values', () => {
			// I(θ) = ∫_{θ}^{θ^2} sin(θ * x) dx = (cos(θ^2) - cos(θ^3)) / θ
			// I'(θ) = [(-2θ sin(θ^2) + 3θ^2 sin(θ^3))*θ - (cos(θ^2) - cos(θ^3))] / θ^2
			for (const theta of [0.5, 1.1, 1.8, -0.9]) {
				const p = dual(theta, 1)
				const a = dual(theta, 1)
				const b = dual(theta * theta, 2 * theta)
				const res = integralDualRecursive((x) => dSin(dMul(p, x)), a, b)

				const expectedV = (Math.cos(theta ** 2) - Math.cos(theta ** 3)) / theta
				const numD = (-2 * theta * Math.sin(theta ** 2) + 3 * theta ** 2 * Math.sin(theta ** 3)) * theta -
					(Math.cos(theta ** 2) - Math.cos(theta ** 3))
				const expectedD = numD / (theta * theta)

				assertClose(res.v, expectedV, 1e-9, `value at θ=${theta}`)
				assertClose(res.d, expectedD, 1e-9, `Leibniz derivative at θ=${theta}`)
			}
		})

		it('matches independent composite midpoint + central finite-difference derivative', () => {
			// Non-elementary integrand: I(θ) = ∫_{0.2θ}^{1 + 0.5θ^2} exp(-θ x^2) cos(θ x) dx
			function midpointIntegral(theta, steps = 4000) {
				const a = 0.2 * theta
				const b = 1 + 0.5 * theta * theta
				const h = (b - a) / steps
				let sum = 0
				for (let i = 0; i < steps; i++) {
					const x = a + (i + 0.5) * h
					sum += Math.exp(-theta * x * x) * Math.cos(theta * x)
				}
				return sum * h
			}

			const theta = 1.2
			const h = 1e-6
			const fdValue = midpointIntegral(theta)
			const fdDeriv = (midpointIntegral(theta + h) - midpointIntegral(theta - h)) / (2 * h)

			const p = dual(theta, 1)
			const res = integralDualRecursive(
				(x) => {
					const negThetaX2 = dMul(dual(-p.v, -p.d), dMul(x, x))
					return dMul(dExp(negThetaX2), dCos(dMul(p, x)))
				},
				dual(0.2 * theta, 0.2),
				dual(1 + 0.5 * theta * theta, theta)
			)

			assertClose(res.v, fdValue, 1e-7, 'cross-check value vs midpoint')
			assertClose(res.d, fdDeriv, 1e-6, 'cross-check derivative vs central finite difference')
		})

		it('satisfies interval additivity with cancelling interior dual bound derivative', () => {
			// ∫_a^b f = ∫_a^c f + ∫_c^b f even when c has an arbitrary non-zero derivative c_d
			const p = dual(1.4, 1)
			const fn = (x) => dSub(dExp(dMul(p, x)), dSin(x))
			const a = dual(0.1, 0.3)
			const c = dual(0.9, -4.7)
			const b = dual(1.7, 2.2)

			const whole = integralDualRecursive(fn, a, b)
			const left = integralDualRecursive(fn, a, c)
			const right = integralDualRecursive(fn, c, b)

			assertClose(left.v + right.v, whole.v, 1e-10, 'additive value')
			assertClose(left.d + right.d, whole.d, 1e-10, 'additive derivative')
		})
	})
})
