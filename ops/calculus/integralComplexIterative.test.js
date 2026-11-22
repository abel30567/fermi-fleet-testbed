import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { integralComplexIterative } from './integralComplexIterative.js'

const cAdd = (x, y) => ({ re: x.re + y.re, im: x.im + y.im })
const cSub = (x, y) => ({ re: x.re - y.re, im: x.im - y.im })
const cMul = (x, y) => ({
	re: x.re * y.re - x.im * y.im,
	im: x.re * y.im + x.im * y.re,
})
const cDiv = (x, y) => {
	const denom = y.re * y.re + y.im * y.im
	return {
		re: (x.re * y.re + x.im * y.im) / denom,
		im: (x.im * y.re - x.re * y.im) / denom,
	}
}
const cExp = (z) => {
	const ex = Math.exp(z.re)
	return { re: ex * Math.cos(z.im), im: ex * Math.sin(z.im) }
}
const cCos = (z) => ({
	re: Math.cos(z.re) * Math.cosh(z.im),
	im: -Math.sin(z.re) * Math.sinh(z.im),
})
const cSin = (z) => ({
	re: Math.sin(z.re) * Math.cosh(z.im),
	im: Math.cos(z.re) * Math.sinh(z.im),
})

function assertComplexClose(actual, expected, tol = 1e-10) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`Expected re ${actual.re} to be within ${tol} of ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`Expected im ${actual.im} to be within ${tol} of ${expected.im}`
	)
}

/**
 * Independent naive midpoint Riemann sum integrator for cross-checking.
 */
function naiveMidpointComplexIntegral(f, a, b, n) {
	const dr = b.re - a.re
	const di = b.im - a.im
	let sumRe = 0
	let sumIm = 0
	for (let k = 0; k < n; k++) {
		const t = (k + 0.5) / n
		const v = f({ re: a.re + t * dr, im: a.im + t * di })
		sumRe += v.re
		sumIm += v.im
	}
	const avgRe = sumRe / n
	const avgIm = sumIm / n
	return {
		re: dr * avgRe - di * avgIm,
		im: dr * avgIm + di * avgRe,
	}
}

describe('integralComplexIterative', () => {
	describe('normal cases', () => {
		it('integrates a constant complex function', () => {
			const c = { re: 3, im: -4 }
			const a = { re: 1, im: 2 }
			const b = { re: -2, im: 5 }
			const result = integralComplexIterative(() => c, a, b, 10)
			const expected = cMul(c, cSub(b, a))
			assertComplexClose(result, expected, 1e-12)
		})

		it('integrates polynomials up to degree 3 exactly even with steps = 1', () => {
			const a = { re: 1, im: -2 }
			const b = { re: 3, im: 4 }

			// ∫ z dz = (b^2 - a^2) / 2
			const lin = integralComplexIterative((z) => z, a, b, 1)
			const expLin = cMul({ re: 0.5, im: 0 }, cSub(cMul(b, b), cMul(a, a)))
			assertComplexClose(lin, expLin, 1e-12)

			// ∫ z^3 dz = (b^4 - a^4) / 4
			const cubic = integralComplexIterative(
				(z) => cMul(cMul(z, z), z),
				a,
				b,
				1
			)
			const b4 = cMul(cMul(b, b), cMul(b, b))
			const a4 = cMul(cMul(a, a), cMul(a, a))
			const expCubic = cMul({ re: 0.25, im: 0 }, cSub(b4, a4))
			assertComplexClose(cubic, expCubic, 1e-11)
		})

		it('matches standard real calculus along the real axis', () => {
			const result = integralComplexIterative(
				cSin,
				{ re: 0, im: 0 },
				{ re: Math.PI, im: 0 }
			)
			assertComplexClose(result, { re: 2, im: 0 }, 1e-12)
		})

		it('integrates along the purely imaginary axis', () => {
			// ∫_0^i z dz = i^2 / 2 = -1/2
			const result = integralComplexIterative(
				(z) => z,
				{ re: 0, im: 0 },
				{ re: 0, im: 1 },
				4
			)
			assertComplexClose(result, { re: -0.5, im: 0 }, 1e-12)
		})

		it('integrates complex exponential e^z accurately', () => {
			const a = { re: -0.5, im: 1.2 }
			const b = { re: 1.3, im: -0.7 }
			const result = integralComplexIterative(cExp, a, b)
			const expected = cSub(cExp(b), cExp(a))
			assertComplexClose(result, expected, 1e-12)
		})

		it('integrates complex cosine cos(z) accurately', () => {
			const a = { re: 0.2, im: -0.5 }
			const b = { re: 1.1, im: 0.8 }
			const result = integralComplexIterative(cCos, a, b)
			const expected = cSub(cSin(b), cSin(a))
			assertComplexClose(result, expected, 1e-12)
		})
	})

	describe('edge cases', () => {
		it('returns { re: 0, im: 0 } when lower and upper limits are equal', () => {
			const p = { re: 2.5, im: -1.5 }
			const result = integralComplexIterative(cExp, p, p)
			assert.deepStrictEqual(result, { re: 0, im: 0 })
			assert.ok(!Object.is(result.re, -0))
			assert.ok(!Object.is(result.im, -0))
		})

		it('negates the integral when limits are reversed', () => {
			const a = { re: -1, im: 2 }
			const b = { re: 2.5, im: -0.5 }
			const forward = integralComplexIterative(cExp, a, b, 200)
			const reverse = integralComplexIterative(cExp, b, a, 200)
			assertComplexClose(
				reverse,
				{ re: -forward.re, im: -forward.im },
				1e-12
			)
		})

		it('works with odd step counts and does not mutate input endpoints', () => {
			const a = { re: 1, im: 1 }
			const b = { re: 2, im: 3 }
			const mutatingF = (z) => {
				const out = { re: z.re * 2, im: z.im * 2 }
				z.re = 999
				z.im = 999
				return out
			}
			const result = integralComplexIterative(mutatingF, a, b, 7)
			assert.deepStrictEqual(a, { re: 1, im: 1 })
			assert.deepStrictEqual(b, { re: 2, im: 3 })
			// ∫ 2z dz = b^2 - a^2
			const expected = cSub(cMul(b, b), cMul(a, a))
			assertComplexClose(result, expected, 1e-12)
		})
	})

	describe('input validation', () => {
		const id = (z) => z
		const z0 = { re: 0, im: 0 }
		const z1 = { re: 1, im: 1 }

		it('throws TypeError for non-function f', () => {
			assert.throws(() => integralComplexIterative(null, z0, z1), TypeError)
			assert.throws(() => integralComplexIterative(42, z0, z1), TypeError)
			assert.throws(() => integralComplexIterative('z', z0, z1), TypeError)
		})

		it('throws TypeError for malformed complex limits a or b', () => {
			assert.throws(() => integralComplexIterative(id, null, z1), TypeError)
			assert.throws(() => integralComplexIterative(id, z0, undefined), TypeError)
			assert.throws(() => integralComplexIterative(id, 1, z1), TypeError)
			assert.throws(
				() => integralComplexIterative(id, { re: '1', im: 0 }, z1),
				TypeError
			)
			assert.throws(
				() => integralComplexIterative(id, z0, { re: 1 }),
				TypeError
			)
		})

		it('throws RangeError for non-finite complex limits', () => {
			assert.throws(
				() => integralComplexIterative(id, { re: NaN, im: 0 }, z1),
				RangeError
			)
			assert.throws(
				() => integralComplexIterative(id, { re: Infinity, im: 0 }, z1),
				RangeError
			)
			assert.throws(
				() => integralComplexIterative(id, z0, { re: 0, im: -Infinity }),
				RangeError
			)
		})

		it('throws TypeError or RangeError for invalid steps', () => {
			assert.throws(
				() => integralComplexIterative(id, z0, z1, '10'),
				TypeError
			)
			assert.throws(
				() => integralComplexIterative(id, z0, z1, 0),
				RangeError
			)
			assert.throws(
				() => integralComplexIterative(id, z0, z1, -10),
				RangeError
			)
			assert.throws(
				() => integralComplexIterative(id, z0, z1, 2.5),
				RangeError
			)
			assert.throws(
				() => integralComplexIterative(id, z0, z1, NaN),
				RangeError
			)
			assert.throws(
				() => integralComplexIterative(id, z0, z1, Infinity),
				RangeError
			)
			assert.throws(
				() =>
					integralComplexIterative(id, z0, z1, Number.MAX_SAFE_INTEGER + 1),
				RangeError
			)
		})

		it('validates integrand return values', () => {
			assert.throws(
				() => integralComplexIterative(() => null, z0, z1, 2),
				TypeError
			)
			assert.throws(
				() => integralComplexIterative(() => ({ re: 1 }), z0, z1, 2),
				TypeError
			)
			assert.throws(
				() => integralComplexIterative(() => ({ re: NaN, im: 0 }), z0, z1, 2),
				RangeError
			)
			assert.throws(
				() =>
					integralComplexIterative(() => ({ re: Infinity, im: 0 }), z0, z0, 2),
				RangeError
			)
		})

		it('throws RangeError if the integral overflows to Infinity', () => {
			assert.throws(
				() =>
					integralComplexIterative(
						() => ({ re: 1e308, im: 0 }),
						{ re: 0, im: 0 },
						{ re: 10, im: 0 },
						2
					),
				RangeError
			)
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('satisfies Cauchy integral theorem on a closed contour for holomorphic functions', () => {
			const f = (z) => cAdd(cExp(z), cMul(z, z))
			const vertices = [
				{ re: -1, im: -1 },
				{ re: 2, im: -0.5 },
				{ re: 1.5, im: 2 },
				{ re: -1.5, im: 1.2 },
			]
			let total = { re: 0, im: 0 }
			for (let i = 0; i < vertices.length; i++) {
				const from = vertices[i]
				const to = vertices[(i + 1) % vertices.length]
				total = cAdd(total, integralComplexIterative(f, from, to))
			}
			assertComplexClose(total, { re: 0, im: 0 }, 1e-11)
		})

		it('satisfies Cauchy residue theorem: ∮ (1/z) dz = 2πi around the origin', () => {
			const invZ = (z) => cDiv({ re: 1, im: 0 }, z)
			const square = [
				{ re: 1, im: -1 },
				{ re: 1, im: 1 },
				{ re: -1, im: 1 },
				{ re: -1, im: -1 },
			]
			let total = { re: 0, im: 0 }
			for (let i = 0; i < square.length; i++) {
				const from = square[i]
				const to = square[(i + 1) % square.length]
				total = cAdd(total, integralComplexIterative(invZ, from, to, 400))
			}
			assertComplexClose(total, { re: 0, im: 2 * Math.PI }, 1e-11)
		})

		it('satisfies linearity and path additivity', () => {
			const alpha = { re: 2, im: -1 }
			const beta = { re: -0.5, im: 3 }
			const f = cExp
			const g = cSin
			const a = { re: -0.3, im: 0.4 }
			const c = { re: 0.5, im: -0.2 }
			const b = { re: 1.2, im: 0.9 }

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

			// Path additivity for holomorphic f: ∫_a^c + ∫_c^b = ∫_a^b
			const viaC = cAdd(
				integralComplexIterative(f, a, c, 300),
				integralComplexIterative(f, c, b, 300)
			)
			const direct = integralComplexIterative(f, a, b, 300)
			assertComplexClose(viaC, direct, 1e-11)
		})

		it('agrees with an independent midpoint Riemann integrator on a non-holomorphic integrand', () => {
			// f(z) = conj(z) * e^z is non-holomorphic; integral depends on the straight-line path
			const nonHolomorphic = (z) => cMul({ re: z.re, im: -z.im }, cExp(z))
			const a = { re: -0.5, im: 0.8 }
			const b = { re: 1.4, im: -0.6 }

			const simpson = integralComplexIterative(nonHolomorphic, a, b, 500)
			const midpointRef = naiveMidpointComplexIntegral(
				nonHolomorphic,
				a,
				b,
				20000
			)
			assertComplexClose(simpson, midpointRef, 1e-7)
		})
	})
})
