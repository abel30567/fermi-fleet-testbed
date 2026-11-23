import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { gradientComplexSeries } from './gradientComplexSeries.js'

// Complex arithmetic helpers for test functions and analytical expectations
const c = (re, im = 0) => ({ re, im })
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im })
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im })
const cMul = (a, b) => ({
	re: a.re * b.re - a.im * b.im,
	im: a.re * b.im + a.im * b.re,
})
const cDiv = (a, b) => {
	const denom = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom,
	}
}
const cExp = (z) => {
	const e = Math.exp(z.re)
	return { re: e * Math.cos(z.im), im: e * Math.sin(z.im) }
}
const cSin = (z) => ({
	re: Math.sin(z.re) * Math.cosh(z.im),
	im: Math.cos(z.re) * Math.sinh(z.im),
})
const cCos = (z) => ({
	re: Math.cos(z.re) * Math.cosh(z.im),
	im: -Math.sin(z.re) * Math.sinh(z.im),
})
const cLog = (z) => ({
	re: Math.log(Math.hypot(z.re, z.im)),
	im: Math.atan2(z.im, z.re),
})
const cPowInt = (z, n) => {
	let acc = c(1, 0)
	for (let i = 0; i < n; i++) acc = cMul(acc, z)
	return acc
}

function assertComplexClose(actual, expected, tol = 1e-10, msg = '') {
	assert.equal(typeof actual.re, 'number', `${msg} re should be number`)
	assert.equal(typeof actual.im, 'number', `${msg} im should be number`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${msg} re mismatch: got ${actual.re}, expected ${expected.re} (diff=${Math.abs(actual.re - expected.re)})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${msg} im mismatch: got ${actual.im}, expected ${expected.im} (diff=${Math.abs(actual.im - expected.im)})`
	)
}

function assertGradientClose(actual, expected, tol = 1e-10) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], tol, `grad[${i}]`)
	}
}

describe('gradientComplexSeries', () => {
	describe('normal cases — closed-form holomorphic functions', () => {
		test('constant function yields exact zero gradient', () => {
			const fn = () => c(3.5, -2.25)
			const grad = gradientComplexSeries(fn, [c(1, 2), c(-3, 4)])
			assert.deepStrictEqual(grad, [c(0, 0), c(0, 0)])
		})

		test('linear function f(z) = a*z0 + b*z1 + d', () => {
			const a = c(2, -3)
			const b = c(-1.5, 4)
			const d = c(7, -8)
			const fn = ([z0, z1]) => cAdd(cAdd(cMul(a, z0), cMul(b, z1)), d)
			const grad = gradientComplexSeries(fn, [c(5, -2), c(-1, 3)])
			assertGradientClose(grad, [a, b], 1e-11)
		})

		test('multivariate polynomial f(z0, z1) = z0^3 + 2*z0*z1^2 - i*z1^4', () => {
			const fn = ([z0, z1]) =>
				cSub(
					cAdd(cPowInt(z0, 3), cMul(c(2, 0), cMul(z0, cPowInt(z1, 2)))),
					cMul(c(0, 1), cPowInt(z1, 4))
				)
			const p = [c(1.2, -0.7), c(-0.5, 1.4)]
			const [z0, z1] = p
			// df/dz0 = 3*z0^2 + 2*z1^2
			const dfdz0 = cAdd(cMul(c(3, 0), cPowInt(z0, 2)), cMul(c(2, 0), cPowInt(z1, 2)))
			// df/dz1 = 4*z0*z1 - 4i*z1^3
			const dfdz1 = cSub(
				cMul(c(4, 0), cMul(z0, z1)),
				cMul(c(0, 4), cPowInt(z1, 3))
			)
			const grad = gradientComplexSeries(fn, p)
			assertGradientClose(grad, [dfdz0, dfdz1], 1e-10)
		})

		test('exponential composition f(z0, z1) = exp(z0 * z1)', () => {
			const fn = ([z0, z1]) => cExp(cMul(z0, z1))
			const p = [c(0.5, 0.8), c(-0.4, 0.6)]
			const [z0, z1] = p
			const e = cExp(cMul(z0, z1))
			const grad = gradientComplexSeries(fn, p)
			assertGradientClose(grad, [cMul(z1, e), cMul(z0, e)], 1e-11)
		})

		test('trigonometric function f(z0, z1) = sin(z0) * cos(z1)', () => {
			const fn = ([z0, z1]) => cMul(cSin(z0), cCos(z1))
			const p = [c(0.7, -0.3), c(-0.9, 0.5)]
			const [z0, z1] = p
			const expected = [
				cMul(cCos(z0), cCos(z1)),
				cMul(c(-1, 0), cMul(cSin(z0), cSin(z1))),
			]
			const grad = gradientComplexSeries(fn, p)
			assertGradientClose(grad, expected, 1e-11)
		})

		test('3D rational function f(z0, z1, z2) = (z0 + z1) / z2', () => {
			const fn = ([z0, z1, z2]) => cDiv(cAdd(z0, z1), z2)
			const p = [c(2, -1), c(-0.5, 3), c(1.5, 2.5)]
			const [z0, z1, z2] = p
			const invZ2 = cDiv(c(1, 0), z2)
			const dfdz2 = cMul(c(-1, 0), cDiv(cAdd(z0, z1), cMul(z2, z2)))
			const grad = gradientComplexSeries(fn, p)
			assertGradientClose(grad, [invZ2, invZ2, dfdz2], 1e-11)
		})

		test('1D complex logarithm f(z) = log(z) away from branch cut', () => {
			const fn = ([z]) => cLog(z)
			const z = c(2, 3)
			const grad = gradientComplexSeries(fn, [z])
			assertGradientClose(grad, [cDiv(c(1, 0), z)], 1e-11)
		})
	})

	describe('edge cases', () => {
		test('empty point [] returns empty gradient []', () => {
			const grad = gradientComplexSeries(() => c(0, 0), [])
			assert.deepStrictEqual(grad, [])
		})

		test('origin evaluation for high-degree polynomial z^12 + (1-2i)*z', () => {
			const fn = ([z]) => cAdd(cPowInt(z, 12), cMul(c(1, -2), z))
			const grad = gradientComplexSeries(fn, [c(0, 0)])
			assertGradientClose(grad, [c(1, -2)], 1e-12)
		})

		test('custom smaller radius near a pole at z = 0', () => {
			// f(z) = 1 / z evaluated at z = 0.01 (pole at distance 0.01)
			const fn = ([z]) => cDiv(c(1, 0), z)
			const z = c(0.01, 0)
			const grad = gradientComplexSeries(fn, [z], { radius: 1e-4, samples: 16 })
			// f'(z) = -1 / z^2 = -10000
			assertGradientClose(grad, [c(-10000, 0)], 1e-6)
		})

		test('non-holomorphic smooth function computes Wirtinger derivative ∂f/∂z', () => {
			// f(z) = |z|^2 = z * conj(z) => ∂f/∂z = conj(z)
			const fn = ([z]) => c(z.re * z.re + z.im * z.im, 0)
			const z = c(2.5, -1.75)
			const grad = gradientComplexSeries(fn, [z])
			assertGradientClose(grad, [c(z.re, -z.im)], 1e-11)
		})

		test('minimum samples = 2 still yields central-difference accuracy for quadratic', () => {
			const fn = ([z]) => cPowInt(z, 2)
			const z = c(3, -4)
			const grad = gradientComplexSeries(fn, [z], { radius: 1e-3, samples: 2 })
			assertGradientClose(grad, [cMul(c(2, 0), z)], 1e-10)
		})

		test('does not mutate input point array or elements even if fn mutates its argument', () => {
			const p = [c(1, 2), c(3, 4)]
			const fn = (z) => {
				const out = cAdd(cMul(z[0], z[0]), z[1])
				z[0].re = 999
				z[1].im = -999
				return out
			}
			const grad = gradientComplexSeries(fn, p)
			assert.deepStrictEqual(p, [c(1, 2), c(3, 4)])
			assertGradientClose(grad, [c(2, 4), c(1, 0)], 1e-10)
		})
	})

	describe('input validation', () => {
		test('rejects non-function fn', () => {
			assert.throws(() => gradientComplexSeries(null, [c(0, 0)]), TypeError)
			assert.throws(() => gradientComplexSeries('not-fn', [c(0, 0)]), TypeError)
		})

		test('rejects non-array point', () => {
			assert.throws(() => gradientComplexSeries(() => c(0, 0), c(1, 2)), TypeError)
			assert.throws(() => gradientComplexSeries(() => c(0, 0), null), TypeError)
		})

		test('rejects malformed or non-finite complex coordinates', () => {
			const id = ([z]) => z
			assert.throws(() => gradientComplexSeries(id, [null]), TypeError)
			assert.throws(() => gradientComplexSeries(id, [42]), TypeError)
			assert.throws(() => gradientComplexSeries(id, [{ re: 1 }]), TypeError)
			assert.throws(() => gradientComplexSeries(id, [{ re: NaN, im: 0 }]), RangeError)
			assert.throws(() => gradientComplexSeries(id, [{ re: 0, im: Infinity }]), RangeError)
		})

		test('rejects invalid options', () => {
			const id = ([z]) => z
			const p = [c(1, 0)]
			assert.throws(() => gradientComplexSeries(id, p, null), TypeError)
			assert.throws(() => gradientComplexSeries(id, p, []), TypeError)
			assert.throws(() => gradientComplexSeries(id, p, { radius: '1e-3' }), TypeError)
			assert.throws(() => gradientComplexSeries(id, p, { radius: 0 }), RangeError)
			assert.throws(() => gradientComplexSeries(id, p, { radius: -1e-3 }), RangeError)
			assert.throws(() => gradientComplexSeries(id, p, { radius: Infinity }), RangeError)
			assert.throws(() => gradientComplexSeries(id, p, { samples: '16' }), TypeError)
			assert.throws(() => gradientComplexSeries(id, p, { samples: 1 }), RangeError)
			assert.throws(() => gradientComplexSeries(id, p, { samples: 4.5 }), RangeError)
		})

		test('rejects fn returning invalid or non-finite complex values', () => {
			assert.throws(() => gradientComplexSeries(() => 5, [c(1, 0)]), TypeError)
			assert.throws(
				() => gradientComplexSeries(() => ({ re: NaN, im: 0 }), [c(1, 0)]),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		test('Cauchy-Riemann real/imaginary finite-difference cross-check', () => {
			// f(z0, z1) = exp(z0) * sin(z1) + z0^2 * z1
			const fn = ([z0, z1]) =>
				cAdd(cMul(cExp(z0), cSin(z1)), cMul(cPowInt(z0, 2), z1))
			const p = [c(0.6, -0.4), c(-0.3, 0.9)]
			const grad = gradientComplexSeries(fn, p)

			// Independent 4th-order central finite differences along both real (x) and imaginary (y) axes.
			const h = 1e-4
			for (let j = 0; j < p.length; j++) {
				const evalShift = (dx, dy) => {
					const q = p.map((v) => ({ ...v }))
					q[j] = { re: q[j].re + dx, im: q[j].im + dy }
					return fn(q)
				}
				const dfdx = cDiv(
					cAdd(
						cSub(evalShift(-2 * h, 0), cMul(c(8, 0), evalShift(-h, 0))),
						cSub(cMul(c(8, 0), evalShift(h, 0)), evalShift(2 * h, 0))
					),
					c(12 * h, 0)
				)
				// Along imaginary axis: ∂f/∂z = -i * ∂f/∂y
				const dfdy = cDiv(
					cAdd(
						cSub(evalShift(0, -2 * h), cMul(c(8, 0), evalShift(0, -h))),
						cSub(cMul(c(8, 0), evalShift(0, h)), evalShift(0, 2 * h))
					),
					c(12 * h, 0)
				)
				const fromImagAxis = cMul(c(0, -1), dfdy)

				// Both axes must agree with each other (Cauchy-Riemann) and with gradientComplexSeries.
				assertComplexClose(dfdx, fromImagAxis, 1e-10, `CR axis consistency [${j}]`)
				assertComplexClose(grad[j], dfdx, 1e-10, `real-axis FD cross-check [${j}]`)
				assertComplexClose(grad[j], fromImagAxis, 1e-10, `imag-axis FD cross-check [${j}]`)
			}
		})

		test('directional derivative and product rule algebraic identities', () => {
			const f = ([z0, z1]) => cExp(cAdd(z0, cMul(c(0, 1), z1)))
			const g = ([z0, z1]) => cAdd(cPowInt(z0, 2), cCos(z1))
			const fg = (z) => cMul(f(z), g(z))

			const p = [c(0.4, 0.7), c(-0.8, 0.2)]
			const gradF = gradientComplexSeries(f, p)
			const gradG = gradientComplexSeries(g, p)
			const gradFG = gradientComplexSeries(fg, p)

			const fVal = f(p)
			const gVal = g(p)

			// Product rule: ∇(f*g) = g*∇f + f*∇g
			for (let j = 0; j < p.length; j++) {
				const rhs = cAdd(cMul(gVal, gradF[j]), cMul(fVal, gradG[j]))
				assertComplexClose(gradFG[j], rhs, 1e-11, `product rule [${j}]`)
			}

			// Directional derivative: (fg(p + eps*v) - fg(p - eps*v)) / (2*eps) ≈ ∇(fg)(p) · v
			const v = [c(0.3, -0.5), c(-0.7, 0.4)]
			const eps = 1e-6
			const plus = p.map((zj, j) => cAdd(zj, cMul(c(eps, 0), v[j])))
			const minus = p.map((zj, j) => cSub(zj, cMul(c(eps, 0), v[j])))
			const fdDirectional = cDiv(cSub(fg(plus), fg(minus)), c(2 * eps, 0))
			const dotDirectional = gradFG.reduce((acc, gj, j) => cAdd(acc, cMul(gj, v[j])), c(0, 0))
			assertComplexClose(dotDirectional, fdDirectional, 1e-8, 'directional derivative')
		})
	})
})
