import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gradientComplexIterative } from './gradientComplexIterative.js'

// Local complex arithmetic helpers for tests
const c = (re, im = 0) => ({ re, im })
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im })
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im })
const cMul = (a, b) => ({
	re: a.re * b.re - a.im * b.im,
	im: a.re * b.im + a.im * b.re,
})
const cDiv = (a, b) => {
	const d = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / d,
		im: (a.im * b.re - a.re * b.im) / d,
	}
}
const cConj = (a) => ({ re: a.re, im: -a.im })
const cExp = (a) => {
	const e = Math.exp(a.re)
	return { re: e * Math.cos(a.im), im: e * Math.sin(a.im) }
}
const cSin = (a) => ({
	re: Math.sin(a.re) * Math.cosh(a.im),
	im: Math.cos(a.re) * Math.sinh(a.im),
})
const cCos = (a) => ({
	re: Math.cos(a.re) * Math.cosh(a.im),
	im: -Math.sin(a.re) * Math.sinh(a.im),
})

function assertComplexClose(actual, expected, tol = 1e-7, msg = '') {
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol && Math.abs(actual.im - expected.im) <= tol,
		`${msg ? msg + ': ' : ''}expected {re: ${expected.re}, im: ${expected.im}} ± ${tol}, got {re: ${actual.re}, im: ${actual.im}}`
	)
}

describe('gradientComplexIterative', () => {
	describe('normal cases', () => {
		it('computes zero gradient for a constant complex function', () => {
			const fn = () => c(3.5, -2.25)
			const grad = gradientComplexIterative(fn, [c(1, 2), c(-3, 4)])
			assert.deepStrictEqual(grad, [c(0, 0), c(0, 0)])
		})

		it('computes exact gradient for a complex linear form', () => {
			const coeffs = [c(2, -1), c(-3, 4), c(0.5, 1.5)]
			const bias = c(7, -8)
			const fn = (z) => {
				let sum = bias
				for (let i = 0; i < z.length; i++) {
					sum = cAdd(sum, cMul(coeffs[i], z[i]))
				}
				return sum
			}
			const point = [c(1.2, -0.7), c(-2.3, 3.1), c(0.4, -1.9)]
			const grad = gradientComplexIterative(fn, point)

			assert.equal(grad.length, coeffs.length)
			for (let i = 0; i < coeffs.length; i++) {
				assertComplexClose(grad[i], coeffs[i], 1e-8, `linear coeff ${i}`)
			}
		})

		it('computes derivatives of single-variable holomorphic functions (z^3, exp, sin, 1/z)', () => {
			const z0 = c(1.1, -0.6)

			// f(z) = z^3 => f'(z) = 3 z^2
			const gCube = gradientComplexIterative(([z]) => cMul(cMul(z, z), z), [z0])
			assertComplexClose(gCube[0], cMul(c(3, 0), cMul(z0, z0)), 1e-7, 'd/dz(z^3)')

			// f(z) = exp(z) => f'(z) = exp(z)
			const gExp = gradientComplexIterative(([z]) => cExp(z), [z0])
			assertComplexClose(gExp[0], cExp(z0), 1e-7, 'd/dz(exp(z))')

			// f(z) = sin(z) => f'(z) = cos(z)
			const gSin = gradientComplexIterative(([z]) => cSin(z), [z0])
			assertComplexClose(gSin[0], cCos(z0), 1e-7, 'd/dz(sin(z))')

			// f(z) = 1/z => f'(z) = -1/z^2
			const gInv = gradientComplexIterative(([z]) => cDiv(c(1, 0), z), [z0])
			assertComplexClose(gInv[0], cDiv(c(-1, 0), cMul(z0, z0)), 1e-7, 'd/dz(1/z)')
		})

		it('computes analytic gradient for a multivariable holomorphic polynomial', () => {
			// f(z0, z1, z2) = z0^2 * z1 + (1 - 2i) * z1 * z2^2 - i * z0 * z2
			const a = c(1, -2)
			const negI = c(0, -1)
			const fn = ([z0, z1, z2]) =>
				cAdd(
					cAdd(cMul(cMul(z0, z0), z1), cMul(a, cMul(z1, cMul(z2, z2)))),
					cMul(negI, cMul(z0, z2))
				)

			const point = [c(1.5, -0.5), c(-0.8, 1.2), c(0.7, 0.9)]
			const [z0, z1, z2] = point

			// ∂f/∂z0 = 2*z0*z1 - i*z2
			const expected0 = cAdd(cMul(c(2, 0), cMul(z0, z1)), cMul(negI, z2))
			// ∂f/∂z1 = z0^2 + (1 - 2i)*z2^2
			const expected1 = cAdd(cMul(z0, z0), cMul(a, cMul(z2, z2)))
			// ∂f/∂z2 = 2*(1 - 2i)*z1*z2 - i*z0
			const expected2 = cAdd(cMul(c(2, 0), cMul(a, cMul(z1, z2))), cMul(negI, z0))

			const grad = gradientComplexIterative(fn, point)
			assertComplexClose(grad[0], expected0, 1e-7, '∂f/∂z0')
			assertComplexClose(grad[1], expected1, 1e-7, '∂f/∂z1')
			assertComplexClose(grad[2], expected2, 1e-7, '∂f/∂z2')
		})

		it('computes exact Wirtinger gradient for non-holomorphic functions', () => {
			// f(z) = conj(z) => ∂f/∂z = 0
			const gConj = gradientComplexIterative(([z]) => cConj(z), [c(2.5, -3.5)])
			assertComplexClose(gConj[0], c(0, 0), 1e-10, 'd/dz(conj(z))')

			// f(z0, z1) = |z0|^2 + 2|z1|^2 => ∂f/∂z0 = conj(z0), ∂f/∂z1 = 2*conj(z1)
			const normSq = ([z0, z1]) =>
				c(
					z0.re * z0.re + z0.im * z0.im + 2 * (z1.re * z1.re + z1.im * z1.im),
					0
				)
			const p = [c(1.3, -2.4), c(-0.9, 3.1)]
			const grad = gradientComplexIterative(normSq, p)
			assertComplexClose(grad[0], cConj(p[0]), 1e-8, '∂/∂z0(|z0|^2 + 2|z1|^2)')
			assertComplexClose(grad[1], cMul(c(2, 0), cConj(p[1])), 1e-8, '∂/∂z1(|z0|^2 + 2|z1|^2)')
		})

		it('accepts custom step size and does not mutate input point', () => {
			const point = [c(2, -1), c(-3, 4)]
			const snapshot = structuredClone(point)
			const grad = gradientComplexIterative(
				([z0, z1]) => cAdd(cMul(z0, z0), cMul(z1, z1)),
				point,
				1e-5
			)
			assert.deepStrictEqual(point, snapshot)
			assertComplexClose(grad[0], c(4, -2), 1e-8)
			assertComplexClose(grad[1], c(-6, 8), 1e-8)
		})
	})

	describe('edge cases and input validation', () => {
		it('handles zero point and higher-dimensional vectors cleanly', () => {
			const n = 10
			const point = Array.from({ length: n }, () => c(0, 0))
			// f(z) = sum_k ((k + 1) + i*(k - 1)) * z_k + z_k^2
			const fn = (z) => {
				let acc = c(0, 0)
				for (let k = 0; k < z.length; k++) {
					const linear = cMul(c(k + 1, k - 1), z[k])
					const quad = cMul(z[k], z[k])
					acc = cAdd(acc, cAdd(linear, quad))
				}
				return acc
			}
			const grad = gradientComplexIterative(fn, point)
			assert.equal(grad.length, n)
			for (let k = 0; k < n; k++) {
				assertComplexClose(grad[k], c(k + 1, k - 1), 1e-8, `dim ${k}`)
			}
		})

		it('protects evaluation state even if callback mutates its argument array', () => {
			const point = [c(1, 2), c(3, -1)]
			const fn = (z) => {
				const out = cMul(z[0], z[1])
				z[0].re = 9999
				z[1] = c(-9999, -9999)
				return out
			}
			const grad = gradientComplexIterative(fn, point)
			assert.deepStrictEqual(point, [c(1, 2), c(3, -1)])
			assertComplexClose(grad[0], c(3, -1), 1e-8)
			assertComplexClose(grad[1], c(1, 2), 1e-8)
		})

		it('throws TypeError for invalid fn, point, element, or step types', () => {
			assert.throws(() => gradientComplexIterative(null, [c(1, 0)]), TypeError)
			assert.throws(() => gradientComplexIterative('not-a-fn', [c(1, 0)]), TypeError)
			assert.throws(() => gradientComplexIterative(([z]) => z, null), TypeError)
			assert.throws(() => gradientComplexIterative(([z]) => z, c(1, 2)), TypeError)
			assert.throws(() => gradientComplexIterative(([z]) => z, [null]), TypeError)
			assert.throws(() => gradientComplexIterative(([z]) => z, [42]), TypeError)
			assert.throws(() => gradientComplexIterative(([z]) => z, [{ re: 1 }]), TypeError)
			assert.throws(() => gradientComplexIterative(([z]) => z, [{ re: '1', im: 0 }]), TypeError)
			assert.throws(() => gradientComplexIterative(([z]) => z, [c(1, 0)], '1e-6'), TypeError)
			assert.throws(() => gradientComplexIterative(() => 123, [c(1, 0)]), TypeError)
			assert.throws(() => gradientComplexIterative(() => ({ re: 1 }), [c(1, 0)]), TypeError)
		})

		it('throws RangeError for empty point, non-positive/non-finite step, or non-finite values', () => {
			assert.throws(() => gradientComplexIterative(([z]) => z, []), RangeError)
			assert.throws(() => gradientComplexIterative(([z]) => z, [c(1, 0)], 0), RangeError)
			assert.throws(() => gradientComplexIterative(([z]) => z, [c(1, 0)], -1e-6), RangeError)
			assert.throws(() => gradientComplexIterative(([z]) => z, [c(1, 0)], Number.NaN), RangeError)
			assert.throws(() => gradientComplexIterative(([z]) => z, [c(1, 0)], Infinity), RangeError)
			assert.throws(() => gradientComplexIterative(([z]) => z, [c(Number.NaN, 0)]), RangeError)
			assert.throws(() => gradientComplexIterative(([z]) => z, [c(0, -Infinity)]), RangeError)
			assert.throws(() => gradientComplexIterative(() => c(Infinity, 0), [c(1, 0)]), RangeError)
			assert.throws(() => gradientComplexIterative(() => c(0, Number.NaN), [c(1, 0)]), RangeError)
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('matches Cauchy integral formula along circular contours for holomorphic f', () => {
			// f(z0, z1) = exp(z0 * z1) + sin(z0 - i*z1)
			const fn = ([z0, z1]) =>
				cAdd(cExp(cMul(z0, z1)), cSin(cSub(z0, cMul(c(0, 1), z1))))

			const point = [c(0.4, -0.3), c(-0.5, 0.6)]
			const grad = gradientComplexIterative(fn, point)

			// Independent computation via Cauchy's integral formula:
			// ∂f/∂z_k = (1 / (2π)) * ∫_0^{2π} f(..., z_k + r*e^{iθ}, ...) / (r*e^{iθ}) dθ
			const r = 0.05
			const N = 64
			for (let k = 0; k < point.length; k++) {
				let sumRe = 0
				let sumIm = 0
				for (let j = 0; j < N; j++) {
					const theta = (2 * Math.PI * j) / N
					const offset = c(r * Math.cos(theta), r * Math.sin(theta))
					const z = point.map((p, idx) => (idx === k ? cAdd(p, offset) : { ...p }))
					const integrand = cDiv(fn(z), offset)
					sumRe += integrand.re
					sumIm += integrand.im
				}
				const cauchyDeriv = c(sumRe / N, sumIm / N)
				assertComplexClose(grad[k], cauchyDeriv, 1e-8, `Cauchy cross-check dim ${k}`)
			}
		})

		it('satisfies complex directional derivative identity ∇f(z) · v = d/dt f(z + t*v)|_{t=0}', () => {
			const fn = ([z0, z1, z2]) =>
				cAdd(cExp(cMul(z0, z1)), cCos(cSub(z1, cMul(c(0, 1), z2))))

			const point = [c(0.3, 0.7), c(-0.4, 0.2), c(0.6, -0.5)]
			const dir = [c(0.5, -0.2), c(-0.3, 0.8), c(0.4, 0.1)]

			const grad = gradientComplexIterative(fn, point)
			let dot = c(0, 0)
			for (let k = 0; k < point.length; k++) {
				dot = cAdd(dot, cMul(grad[k], dir[k]))
			}

			// Independent 1D central difference along complex direction v
			const t = 1e-6
			const zPlus = point.map((p, k) => cAdd(p, cMul(c(t, 0), dir[k])))
			const zMinus = point.map((p, k) => cSub(p, cMul(c(t, 0), dir[k])))
			const fDiff = cSub(fn(zPlus), fn(zMinus))
			const directional = c(fDiff.re / (2 * t), fDiff.im / (2 * t))

			assertComplexClose(dot, directional, 1e-7, 'directional derivative identity')
		})

		it('satisfies linearity and Leibniz product rule for Wirtinger gradients', () => {
			// Include non-holomorphic term in f and holomorphic term in g
			const f = ([z0, z1]) =>
				cAdd(cMul(z0, cConj(z0)), cMul(c(1, 2), cMul(z0, z1)))
			const g = ([z0, z1]) =>
				cAdd(cExp(z0), cMul(z1, z1))

			const alpha = c(2, -1)
			const beta = c(-0.5, 3)
			const point = [c(0.7, -0.4), c(-0.6, 0.8)]

			const gradF = gradientComplexIterative(f, point)
			const gradG = gradientComplexIterative(g, point)

			// Linearity: ∇(αf + βg) = α∇f + β∇g
			const gradLin = gradientComplexIterative(
				(z) => cAdd(cMul(alpha, f(z)), cMul(beta, g(z))),
				point
			)
			for (let k = 0; k < point.length; k++) {
				const expected = cAdd(cMul(alpha, gradF[k]), cMul(beta, gradG[k]))
				assertComplexClose(gradLin[k], expected, 1e-7, `linearity dim ${k}`)
			}

			// Product rule: ∇(f * g) = g*∇f + f*∇g
			const fVal = f(point)
			const gVal = g(point)
			const gradProd = gradientComplexIterative((z) => cMul(f(z), g(z)), point)
			for (let k = 0; k < point.length; k++) {
				const expected = cAdd(cMul(gVal, gradF[k]), cMul(fVal, gradG[k]))
				assertComplexClose(gradProd[k], expected, 1e-7, `product rule dim ${k}`)
			}
		})
	})
})
