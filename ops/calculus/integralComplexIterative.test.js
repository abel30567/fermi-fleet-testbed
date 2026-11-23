import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { integralComplexIterative } from './integralComplexIterative.js'

const c = (re, im = 0) => ({ re, im })
const cAdd = (x, y) => ({ re: x.re + y.re, im: x.im + y.im })
const cSub = (x, y) => ({ re: x.re - y.re, im: x.im - y.im })
const cMul = (x, y) => ({
	re: x.re * y.re - x.im * y.im,
	im: x.re * y.im + x.im * y.re,
})
const cDiv = (x, y) => {
	const d = y.re * y.re + y.im * y.im
	return {
		re: (x.re * y.re + x.im * y.im) / d,
		im: (x.im * y.re - x.re * y.im) / d,
	}
}
const cExp = (z) => {
	const r = Math.exp(z.re)
	return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) }
}
const cSin = (z) => ({
	re: Math.sin(z.re) * Math.cosh(z.im),
	im: Math.cos(z.re) * Math.sinh(z.im),
})
const cCos = (z) => ({
	re: Math.cos(z.re) * Math.cosh(z.im),
	im: -Math.sin(z.re) * Math.sinh(z.im),
})

function assertComplexClose(actual, expected, tol = 1e-10, message = '') {
	const reDiff = Math.abs(actual.re - expected.re)
	const imDiff = Math.abs(actual.im - expected.im)
	assert.ok(
		reDiff <= tol && imDiff <= tol,
		`${message ? `${message}: ` : ''}expected { re: ${expected.re}, im: ${expected.im} }, got { re: ${actual.re}, im: ${actual.im} } (diff re=${reDiff}, im=${imDiff}, tol=${tol})`
	)
}

describe('integralComplexIterative', () => {
	describe('normal cases', () => {
		it('integrates a constant complex function along a diagonal contour', () => {
			const k = c(2, -3)
			const a = c(1, 2)
			const b = c(4, -1)
			const result = integralComplexIterative(() => k, a, b, 10)
			// k * (b - a) = (2 - 3i)(3 - 3i) = (6 - 9) + (-6 - 9)i = -3 - 15i
			assertComplexClose(result, cMul(k, cSub(b, a)), 1e-12)
		})

		it('integrates complex polynomials z, z^2, z^3 exactly with Simpson rule even for steps=1', () => {
			const a = c(1, -2)
			const b = c(3, 4)

			// ∫ z dz = (b^2 - a^2) / 2
			const intZ = integralComplexIterative((z) => z, a, b, 1)
			const expZ = cDiv(cSub(cMul(b, b), cMul(a, a)), c(2, 0))
			assertComplexClose(intZ, expZ, 1e-12, '∫ z dz')

			// ∫ z^2 dz = (b^3 - a^3) / 3
			const intZ2 = integralComplexIterative((z) => cMul(z, z), a, b, 1)
			const b3 = cMul(cMul(b, b), b)
			const a3 = cMul(cMul(a, a), a)
			const expZ2 = cDiv(cSub(b3, a3), c(3, 0))
			assertComplexClose(intZ2, expZ2, 1e-12, '∫ z^2 dz')

			// ∫ z^3 dz = (b^4 - a^4) / 4
			const intZ3 = integralComplexIterative(
				(z) => cMul(cMul(z, z), z),
				a,
				b,
				1
			)
			const b4 = cMul(b3, b)
			const a4 = cMul(a3, a)
			const expZ3 = cDiv(cSub(b4, a4), c(4, 0))
			assertComplexClose(intZ3, expZ3, 1e-11, '∫ z^3 dz')
		})

		it('integrates e^z along a complex path against its antiderivative e^b - e^a', () => {
			const a = c(0, 0)
			const b = c(1, Math.PI)
			const result = integralComplexIterative(cExp, a, b, 500)
			// e^(1 + i*pi) - e^0 = -e - 1
			const expected = cSub(cExp(b), cExp(a))
			assertComplexClose(result, expected, 1e-11)
		})

		it('integrates sin(z) against its antiderivative -(cos(b) - cos(a))', () => {
			const a = c(0.5, -0.25)
			const b = c(1.5, 0.75)
			const result = integralComplexIterative(cSin, a, b, 500)
			const expected = cSub(cCos(a), cCos(b))
			assertComplexClose(result, expected, 1e-11)
		})

		it('integrates real-axis complex-valued function e^(i*x) over [0, pi]', () => {
			const result = integralComplexIterative(
				(z) => cExp(cMul(c(0, 1), z)),
				c(0, 0),
				c(Math.PI, 0)
			)
			// ∫_0^pi e^(ix) dx = (e^(i*pi) - 1) / i = (-2) / i = 2i
			assertComplexClose(result, c(0, 2), 1e-11)
		})

		it('supports trapezoid and midpoint methods via options object', () => {
			const a = c(0, 0)
			const b = c(1, 1)
			const expected = cSub(cExp(b), cExp(a))

			const trap = integralComplexIterative(cExp, a, b, {
				steps: 2000,
				method: 'trapezoid',
			})
			const mid = integralComplexIterative(cExp, a, b, {
				steps: 2000,
				method: 'midpoint',
			})
			const simp = integralComplexIterative(cExp, a, b, {
				steps: 200,
				method: 'simpson',
			})

			assertComplexClose(trap, expected, 1e-6, 'trapezoid')
			assertComplexClose(mid, expected, 1e-6, 'midpoint')
			assertComplexClose(simp, expected, 1e-11, 'simpson')
		})
	})

	describe('independent cross-checks (Cauchy theorems, Green theorem, and independent quadrature)', () => {
		it('satisfies Cauchy integral theorem: closed contour integral of holomorphic e^z is 0', () => {
			const corners = [c(-1, -1), c(2, -1), c(2, 1.5), c(-1, 1.5)]
			let total = c(0, 0)
			for (let i = 0; i < corners.length; i++) {
				const p0 = corners[i]
				const p1 = corners[(i + 1) % corners.length]
				total = cAdd(total, integralComplexIterative(cExp, p0, p1, 400))
			}
			assertComplexClose(total, c(0, 0), 1e-10, 'Cauchy integral theorem')
		})

		it('satisfies Cauchy integral formula / residue theorem: ∮ 1/(z - z0) dz = 2πi', () => {
			const z0 = c(0.3, -0.2)
			const corners = [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)]
			const inv = (z) => cDiv(c(1, 0), cSub(z, z0))

			let total = c(0, 0)
			for (let i = 0; i < corners.length; i++) {
				const p0 = corners[i]
				const p1 = corners[(i + 1) % corners.length]
				total = cAdd(total, integralComplexIterative(inv, p0, p1, 500))
			}
			assertComplexClose(
				total,
				c(0, 2 * Math.PI),
				1e-10,
				'Residue theorem ∮ 1/(z - z0) dz'
			)
		})

		it('integrates non-holomorphic f(z) = conj(z) around unit square = 2i (Green theorem cross-check)', () => {
			// By Green's theorem, ∮ conj(z) dz = 2i * Area(region)
			const conj = (z) => ({ re: z.re, im: -z.im })
			const corners = [c(0, 0), c(1, 0), c(1, 1), c(0, 1)]
			let total = c(0, 0)
			for (let i = 0; i < corners.length; i++) {
				const p0 = corners[i]
				const p1 = corners[(i + 1) % corners.length]
				total = cAdd(total, integralComplexIterative(conj, p0, p1, 100))
			}
			assertComplexClose(total, c(0, 2), 1e-12, 'Green theorem for conj(z)')
		})

		it('matches an independent 3-point Gauss-Legendre quadrature reference on a smooth non-polynomial integrand', () => {
			// Independent composite 3-point Gauss-Legendre reference implementation
			const gaussNodes = [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)]
			const gaussWeights = [5 / 9, 8 / 9, 5 / 9]
			const f = (z) => cDiv(cExp(z), cAdd(cMul(z, z), c(4, 1)))
			const a = c(-0.5, 0.2)
			const b = c(1.2, -0.7)
			const dz = cSub(b, a)

			const panels = 50
			let refRe = 0
			let refIm = 0
			for (let k = 0; k < panels; k++) {
				const t0 = k / panels
				const t1 = (k + 1) / panels
				const mid = 0.5 * (t0 + t1)
				const half = 0.5 * (t1 - t0)
				for (let j = 0; j < 3; j++) {
					const t = mid + half * gaussNodes[j]
					const val = f({ re: a.re + t * dz.re, im: a.im + t * dz.im })
					refRe += half * gaussWeights[j] * val.re
					refIm += half * gaussWeights[j] * val.im
				}
			}
			const ref = cMul({ re: refRe, im: refIm }, dz)

			const actual = integralComplexIterative(f, a, b, 400)
			assertComplexClose(actual, ref, 1e-11, 'Gauss-Legendre cross-check')
		})
	})

	describe('edge cases and algebraic properties', () => {
		it('returns { re: 0, im: 0 } without -0 when start equals end', () => {
			const p = c(2, -3)
			const result = integralComplexIterative((z) => cMul(z, z), p, p, 10)
			assert.deepEqual(result, { re: 0, im: 0 })
			assert.ok(!Object.is(result.re, -0))
			assert.ok(!Object.is(result.im, -0))
		})

		it('reverses sign when swapping limits a and b', () => {
			const a = c(-1, 2)
			const b = c(2, -0.5)
			const forward = integralComplexIterative(cExp, a, b, 300)
			const backward = integralComplexIterative(cExp, b, a, 300)
			assertComplexClose(cAdd(forward, backward), c(0, 0), 1e-11)
		})

		it('is additive along collinear segments: ∫_a^m + ∫_m^b = ∫_a^b', () => {
			const a = c(0, 1)
			const m = c(1, 2)
			const b = c(2, 3)
			const whole = integralComplexIterative(cExp, a, b, 400)
			const part1 = integralComplexIterative(cExp, a, m, 200)
			const part2 = integralComplexIterative(cExp, m, b, 200)
			assertComplexClose(cAdd(part1, part2), whole, 1e-11)
		})

		it('satisfies linearity: ∫ (α f + β g) = α ∫ f + β ∫ g', () => {
			const alpha = c(2, -1)
			const beta = c(-0.5, 3)
			const a = c(0, -1)
			const b = c(1.5, 0.5)
			const f = cExp
			const g = (z) => cMul(z, z)

			const combined = integralComplexIterative(
				(z) => cAdd(cMul(alpha, f(z)), cMul(beta, g(z))),
				a,
				b,
				300
			)
			const linear = cAdd(
				cMul(alpha, integralComplexIterative(f, a, b, 300)),
				cMul(beta, integralComplexIterative(g, a, b, 300))
			)
			assertComplexClose(combined, linear, 1e-11)
		})

		it('does not mutate input endpoint objects even if integrand mutates its argument', () => {
			const a = c(1, 2)
			const b = c(3, 4)
			const mutatingFn = (z) => {
				const out = { re: z.re, im: z.im }
				z.re = 999
				z.im = -999
				return out
			}
			const result = integralComplexIterative(mutatingFn, a, b, 20)
			assert.deepEqual(a, { re: 1, im: 2 })
			assert.deepEqual(b, { re: 3, im: 4 })
			const expected = cDiv(cSub(cMul(b, b), cMul(a, a)), c(2, 0))
			assertComplexClose(result, expected, 1e-11)
		})

		it('handles open-endpoint integrand with midpoint method when endpoint has a removable/boundary issue', () => {
			// f(z) = sin(z) / z on [0, 1] has 0/0 at z = 0; midpoint never evaluates z = 0
			const sinc = (z) => cDiv(cSin(z), z)
			const result = integralComplexIterative(sinc, c(0, 0), c(1, 0), {
				steps: 1000,
				method: 'midpoint',
			})
			// Si(1) ≈ 0.9460830703671830
			assertComplexClose(result, c(0.946083070367183, 0), 1e-7)
		})
	})

	describe('input validation', () => {
		it('throws TypeError if fn is not a function', () => {
			assert.throws(
				() => integralComplexIterative(null, c(0, 0), c(1, 0)),
				TypeError
			)
			assert.throws(
				() => integralComplexIterative('z', c(0, 0), c(1, 0)),
				TypeError
			)
		})

		it('throws TypeError for invalid endpoint types', () => {
			const id = (z) => z
			assert.throws(() => integralComplexIterative(id, null, c(1, 0)), TypeError)
			assert.throws(
				() => integralComplexIterative(id, c(0, 0), undefined),
				TypeError
			)
			assert.throws(
				() => integralComplexIterative(id, { re: '0', im: 0 }, c(1, 0)),
				TypeError
			)
			assert.throws(
				() => integralComplexIterative(id, c(0, 0), { re: 1 }),
				TypeError
			)
		})

		it('throws RangeError for non-finite endpoint coordinates', () => {
			const id = (z) => z
			assert.throws(
				() => integralComplexIterative(id, c(NaN, 0), c(1, 0)),
				RangeError
			)
			assert.throws(
				() => integralComplexIterative(id, c(0, Infinity), c(1, 0)),
				RangeError
			)
			assert.throws(
				() => integralComplexIterative(id, c(0, 0), c(-Infinity, 0)),
				RangeError
			)
		})

		it('throws TypeError or RangeError for invalid steps or options', () => {
			const id = (z) => z
			assert.throws(
				() => integralComplexIterative(id, c(0, 0), c(1, 0), 0),
				RangeError
			)
			assert.throws(
				() => integralComplexIterative(id, c(0, 0), c(1, 0), -5),
				RangeError
			)
			assert.throws(
				() => integralComplexIterative(id, c(0, 0), c(1, 0), 1.5),
				RangeError
			)
			assert.throws(
				() => integralComplexIterative(id, c(0, 0), c(1, 0), NaN),
				RangeError
			)
			assert.throws(
				() => integralComplexIterative(id, c(0, 0), c(1, 0), Infinity),
				RangeError
			)
			assert.throws(
				() => integralComplexIterative(id, c(0, 0), c(1, 0), null),
				TypeError
			)
			assert.throws(
				() => integralComplexIterative(id, c(0, 0), c(1, 0), [10]),
				TypeError
			)
			assert.throws(
				() => integralComplexIterative(id, c(0, 0), c(1, 0), { steps: '10' }),
				TypeError
			)
			assert.throws(
				() => integralComplexIterative(id, c(0, 0), c(1, 0), { method: 123 }),
				TypeError
			)
			assert.throws(
				() =>
					integralComplexIterative(id, c(0, 0), c(1, 0), {
						method: 'romberg',
					}),
				RangeError
			)
		})

		it('throws TypeError or RangeError if fn(z) returns an invalid or non-finite complex value', () => {
			assert.throws(
				() => integralComplexIterative(() => 42, c(0, 0), c(1, 0), 10),
				TypeError
			)
			assert.throws(
				() =>
					integralComplexIterative(
						() => ({ re: 1, im: 'bad' }),
						c(0, 0),
						c(1, 0),
						10
					),
				TypeError
			)
			// Pole at z = 0 produces NaN/Infinity
			assert.throws(
				() =>
					integralComplexIterative(
						(z) => cDiv(c(1, 0), z),
						c(-1, 0),
						c(1, 0),
						2
					),
				RangeError
			)
		})

		it('throws RangeError when integral computation overflows to Infinity', () => {
			assert.throws(
				() =>
					integralComplexIterative(
						() => c(1e308, 0),
						c(0, 0),
						c(10, 0),
						2
					),
				RangeError
			)
		})
	})
})
