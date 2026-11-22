import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { integralComplexSeries } from './integralComplexSeries.js'

function cAdd(u, v) {
	return { re: u.re + v.re, im: u.im + v.im }
}

function cSub(u, v) {
	return { re: u.re - v.re, im: u.im - v.im }
}

function cMul(u, v) {
	return {
		re: u.re * v.re - u.im * v.im,
		im: u.re * v.im + u.im * v.re,
	}
}

function cDiv(u, v) {
	const denom = v.re * v.re + v.im * v.im
	return {
		re: (u.re * v.re + u.im * v.im) / denom,
		im: (u.im * v.re - u.re * v.im) / denom,
	}
}

function cExp(z) {
	const r = Math.exp(z.re)
	return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) }
}

function cSin(z) {
	return {
		re: Math.sin(z.re) * Math.cosh(z.im),
		im: Math.cos(z.re) * Math.sinh(z.im),
	}
}

function cCos(z) {
	return {
		re: Math.cos(z.re) * Math.cosh(z.im),
		im: -Math.sin(z.re) * Math.sinh(z.im),
	}
}

function assertComplexClose(actual, expected, tol = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`real part mismatch: got ${actual.re}, expected ${expected.re} (diff ${Math.abs(actual.re - expected.re)})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`imag part mismatch: got ${actual.im}, expected ${expected.im} (diff ${Math.abs(actual.im - expected.im)})`
	)
}

describe('integralComplexSeries', () => {
	describe('normal cases', () => {
		it('integrates a constant complex function', () => {
			const c = { re: 2, im: 5 }
			const a = { re: 1, im: 2 }
			const b = { re: 4, im: -3 }
			// (2 + 5i) * ((4 - 3i) - (1 + 2i)) = (2 + 5i) * (3 - 5i) = 31 + 5i
			const res = integralComplexSeries(() => c, a, b)
			assertComplexClose(res, { re: 31, im: 5 })
		})

		it('integrates polynomials (linear, quadratic, quartic)', () => {
			// integral_0^(1+i) z dz = (1+i)^2 / 2 = i
			const lin = integralComplexSeries(
				(z) => z,
				{ re: 0, im: 0 },
				{ re: 1, im: 1 }
			)
			assertComplexClose(lin, { re: 0, im: 1 })

			// integral_(1-i)^(2+3i) z^2 dz = ((2+3i)^3 - (1-i)^3) / 3
			const a = { re: 1, im: -1 }
			const b = { re: 2, im: 3 }
			const quad = integralComplexSeries((z) => cMul(z, z), a, b)
			const a3 = cMul(cMul(a, a), a)
			const b3 = cMul(cMul(b, b), b)
			const expectedQuad = {
				re: (b3.re - a3.re) / 3,
				im: (b3.im - a3.im) / 3,
			}
			assertComplexClose(quad, expectedQuad)

			// integral_(-1+i)^(2-i) (z^4 - 3z^2 + 2z - 1) dz
			const poly = (z) => {
				const z2 = cMul(z, z)
				const z4 = cMul(z2, z2)
				return {
					re: z4.re - 3 * z2.re + 2 * z.re - 1,
					im: z4.im - 3 * z2.im + 2 * z.im,
				}
			}
			const antideriv = (z) => {
				const z2 = cMul(z, z)
				const z3 = cMul(z2, z)
				const z5 = cMul(z3, z2)
				return {
					re: z5.re / 5 - z3.re + z2.re - z.re,
					im: z5.im / 5 - z3.im + z2.im - z.im,
				}
			}
			const pA = { re: -1, im: 1 }
			const pB = { re: 2, im: -1 }
			const resPoly = integralComplexSeries(poly, pA, pB, { steps: 2 })
			assertComplexClose(resPoly, cSub(antideriv(pB), antideriv(pA)))
		})

		it('integrates exp(z) along a complex segment', () => {
			// integral_0^(1 + i*pi) exp(z) dz = exp(1 + i*pi) - exp(0) = -e - 1
			const res = integralComplexSeries(
				cExp,
				{ re: 0, im: 0 },
				{ re: 1, im: Math.PI }
			)
			assertComplexClose(res, { re: -Math.E - 1, im: 0 })
		})

		it('integrates sin(z) along a complex segment', () => {
			// integral_0^(pi/2 + i) sin(z) dz = -cos(pi/2 + i) + cos(0) = 1 + i*sinh(1)
			const a = { re: 0, im: 0 }
			const b = { re: Math.PI / 2, im: 1 }
			const res = integralComplexSeries(cSin, a, b)
			const expected = cSub(cCos(a), cCos(b))
			assertComplexClose(res, expected)
			assertComplexClose(res, { re: 1, im: Math.sinh(1) })
		})

		it('integrates 1/z in the right half-plane matching principal Log', () => {
			// Segment from 1 to i stays strictly in Re(z) > 0, so integral = Log(i) - Log(1) = i*pi/2
			const res = integralComplexSeries(
				(z) => cDiv({ re: 1, im: 0 }, z),
				{ re: 1, im: 0 },
				{ re: 0, im: 1 }
			)
			assertComplexClose(res, { re: 0, im: Math.PI / 2 })
		})
	})

	describe('edge cases', () => {
		it('returns exact { re: 0, im: 0 } when a equals b', () => {
			const p = { re: 3.5, im: -2.25 }
			assert.deepStrictEqual(integralComplexSeries(cExp, p, p), {
				re: 0,
				im: 0,
			})
			assert.deepStrictEqual(
				integralComplexSeries(cExp, p, { re: 3.5, im: -2.25 }),
				{ re: 0, im: 0 }
			)
		})

		it('flips sign when bounds are reversed', () => {
			const a = { re: -0.5, im: 1.2 }
			const b = { re: 1.7, im: -0.8 }
			const forward = integralComplexSeries(cExp, a, b)
			const backward = integralComplexSeries(cExp, b, a)
			assertComplexClose(cAdd(forward, backward), { re: 0, im: 0 })
		})

		it('respects custom positive even options.steps', () => {
			const a = { re: 0, im: 0 }
			const b = { re: 2, im: 1 }
			const exact = cSub(cExp(b), cExp(a))
			const coarse = integralComplexSeries(cExp, a, b, { steps: 2 })
			const fine = integralComplexSeries(cExp, a, b, { steps: 64 })
			assertComplexClose(coarse, exact, 1e-8)
			assertComplexClose(fine, exact, 1e-13)
		})

		it('validates invalid inputs and integrand return values', () => {
			const ok = { re: 1, im: 0 }
			const id = (z) => z

			// Invalid fn
			assert.throws(() => integralComplexSeries(null, ok, ok), TypeError)
			assert.throws(() => integralComplexSeries(42, ok, ok), TypeError)
			assert.throws(() => integralComplexSeries('z', ok, ok), TypeError)

			// Invalid a or b
			assert.throws(() => integralComplexSeries(id, null, ok), TypeError)
			assert.throws(() => integralComplexSeries(id, ok, undefined), TypeError)
			assert.throws(() => integralComplexSeries(id, [1, 2], ok), TypeError)
			assert.throws(
				() => integralComplexSeries(id, { re: '1', im: 0 }, ok),
				TypeError
			)
			assert.throws(
				() => integralComplexSeries(id, { re: NaN, im: 0 }, ok),
				RangeError
			)
			assert.throws(
				() => integralComplexSeries(id, ok, { re: 0, im: Infinity }),
				RangeError
			)
			assert.throws(
				() => integralComplexSeries(id, ok, { re: -Infinity, im: 0 }),
				RangeError
			)

			// Invalid options
			assert.throws(
				() => integralComplexSeries(id, ok, ok, null),
				TypeError
			)
			assert.throws(
				() => integralComplexSeries(id, ok, ok, []),
				TypeError
			)
			assert.throws(
				() => integralComplexSeries(id, ok, ok, { steps: '4' }),
				TypeError
			)
			assert.throws(
				() => integralComplexSeries(id, ok, ok, { steps: 0 }),
				RangeError
			)
			assert.throws(
				() => integralComplexSeries(id, ok, ok, { steps: -4 }),
				RangeError
			)
			assert.throws(
				() => integralComplexSeries(id, ok, ok, { steps: 3 }),
				RangeError
			)
			assert.throws(
				() => integralComplexSeries(id, ok, ok, { steps: 2.5 }),
				RangeError
			)
			assert.throws(
				() => integralComplexSeries(id, ok, ok, { steps: Infinity }),
				RangeError
			)

			// Invalid return value from fn
			assert.throws(
				() =>
					integralComplexSeries(
						() => null,
						{ re: 0, im: 0 },
						{ re: 1, im: 0 }
					),
				TypeError
			)
			assert.throws(
				() =>
					integralComplexSeries(
						() => ({ re: NaN, im: 0 }),
						{ re: 0, im: 0 },
						{ re: 1, im: 0 }
					),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		it('matches Fundamental Theorem of Calculus F(b) - F(a) for z * exp(z)', () => {
			// d/dz [(z - 1) * exp(z)] = z * exp(z)
			const f = (z) => cMul(z, cExp(z))
			const F = (z) => cMul({ re: z.re - 1, im: z.im }, cExp(z))

			const pairs = [
				[
					{ re: 0, im: 0 },
					{ re: 1, im: 2 },
				],
				[
					{ re: -1.5, im: 0.7 },
					{ re: 0.8, im: -1.3 },
				],
				[
					{ re: 2, im: -2 },
					{ re: -0.5, im: 1.5 },
				],
			]

			for (const [a, b] of pairs) {
				const numerical = integralComplexSeries(f, a, b)
				const analytic = cSub(F(b), F(a))
				assertComplexClose(numerical, analytic, 1e-11)
			}
		})

		it("satisfies Cauchy's integral theorem on a closed triangular contour", () => {
			const A = { re: -1, im: -0.5 }
			const B = { re: 1.5, im: -0.2 }
			const C = { re: 0.3, im: 1.4 }

			const holomorphicFunctions = [
				cExp,
				cSin,
				(z) => {
					const z2 = cMul(z, z)
					const z3 = cMul(z2, z)
					return { re: z3.re - 2 * z.im, im: z3.im + 2 * z.re }
				},
			]

			for (const f of holomorphicFunctions) {
				const ab = integralComplexSeries(f, A, B)
				const bc = integralComplexSeries(f, B, C)
				const ca = integralComplexSeries(f, C, A)
				const closedLoop = cAdd(cAdd(ab, bc), ca)
				assertComplexClose(closedLoop, { re: 0, im: 0 }, 1e-12)
			}
		})

		it("satisfies Cauchy's residue theorem for 1/z around the origin (2*pi*i)", () => {
			// Counter-clockwise diamond 1 -> i -> -1 -> -i -> 1 enclosing z = 0
			const invZ = (z) => cDiv({ re: 1, im: 0 }, z)
			const vertices = [
				{ re: 1, im: 0 },
				{ re: 0, im: 1 },
				{ re: -1, im: 0 },
				{ re: 0, im: -1 },
			]
			let total = { re: 0, im: 0 }
			for (let i = 0; i < vertices.length; i++) {
				const seg = integralComplexSeries(
					invZ,
					vertices[i],
					vertices[(i + 1) % vertices.length]
				)
				total = cAdd(total, seg)
			}
			assertComplexClose(total, { re: 0, im: 2 * Math.PI }, 1e-12)
		})

		it("matches Green's theorem for non-holomorphic conjugate integrand f(z) = conj(z)", () => {
			// For a positively oriented closed contour, integral conj(z) dz = 2i * Area.
			// Triangle (0,0) -> (2,0) -> (0,3) -> (0,0) has Area = 3, so integral = 6i.
			const conj = (z) => ({ re: z.re, im: -z.im })
			const p0 = { re: 0, im: 0 }
			const p1 = { re: 2, im: 0 }
			const p2 = { re: 0, im: 3 }
			const loop = cAdd(
				cAdd(
					integralComplexSeries(conj, p0, p1),
					integralComplexSeries(conj, p1, p2)
				),
				integralComplexSeries(conj, p2, p0)
			)
			assertComplexClose(loop, { re: 0, im: 6 }, 1e-12)
		})
	})
})
