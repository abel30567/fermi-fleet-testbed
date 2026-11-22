import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { integralComplexRecursive } from './integralComplexRecursive.js'

// Complex arithmetic helpers for analytical expectations and independent reference quadrature
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
const cConj = (z) => ({ re: z.re, im: -z.im })
const cPow = (z, n) => {
	let acc = { re: 1, im: 0 }
	for (let i = 0; i < n; i++) {
		acc = cMul(acc, z)
	}
	return acc
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

function assertComplexClose(actual, expected, eps = 1e-8) {
	assert.equal(typeof actual, 'object')
	assert.notEqual(actual, null)
	const err = Math.hypot(actual.re - expected.re, actual.im - expected.im)
	assert.ok(
		err <= eps,
		`Expected (${expected.re} + ${expected.im}i), got (${actual.re} + ${actual.im}i) [|err|=${err} > ${eps}]`,
	)
}

/**
 * Independent iterative composite midpoint/trapezoidal-free reference:
 * Iterative composite Simpson's rule with fixed `n` even subintervals.
 */
function iterativeCompositeSimpson(f, z0, z1, n = 2000) {
	const dz = cSub(z1, z0)
	const h = 1 / n
	let sumRe = 0
	let sumIm = 0
	for (let k = 0; k <= n; k++) {
		const t = k * h
		const z = { re: z0.re + t * dz.re, im: z0.im + t * dz.im }
		const val = f(z)
		const weight = k === 0 || k === n ? 1 : k % 2 === 1 ? 4 : 2
		sumRe += weight * val.re
		sumIm += weight * val.im
	}
	const scale = h / 3
	return cMul(dz, { re: sumRe * scale, im: sumIm * scale })
}

describe('integralComplexRecursive', () => {
	describe('normal cases against analytical antiderivatives', () => {
		it('integrates a constant complex function', () => {
			const c = { re: 3.5, im: -2.25 }
			const z0 = { re: -1, im: 4 }
			const z1 = { re: 5, im: -2 }
			const result = integralComplexRecursive(() => c, z0, z1)
			const expected = cMul(c, cSub(z1, z0))
			assertComplexClose(result, expected, 1e-12)
		})

		it('integrates complex polynomials z, z^2, z^3, and higher degree', () => {
			const z0 = { re: 1, im: -1 }
			const z1 = { re: 2, im: 3 }

			// f(z) = z^2, F(z) = z^3 / 3
			const res2 = integralComplexRecursive((z) => cPow(z, 2), z0, z1)
			const exp2 = cDiv(cSub(cPow(z1, 3), cPow(z0, 3)), { re: 3, im: 0 })
			assertComplexClose(res2, exp2, 1e-12)

			// f(z) = z^5 + (2 - 3i)z^2 - i
			const coeff = { re: 2, im: -3 }
			const f = (z) =>
				cSub(cAdd(cPow(z, 5), cMul(coeff, cPow(z, 2))), { re: 0, im: 1 })
			const F = (z) =>
				cSub(
					cAdd(
						cDiv(cPow(z, 6), { re: 6, im: 0 }),
						cDiv(cMul(coeff, cPow(z, 3)), { re: 3, im: 0 }),
					),
					cMul({ re: 0, im: 1 }, z),
				)
			const resPoly = integralComplexRecursive(f, z0, z1)
			assertComplexClose(resPoly, cSub(F(z1), F(z0)), 1e-9)
		})

		it('integrates complex exponential e^z', () => {
			const z0 = { re: 0, im: 0 }
			const z1 = { re: 1, im: Math.PI / 2 }
			const result = integralComplexRecursive(cExp, z0, z1)
			const expected = cSub(cExp(z1), cExp(z0))
			assertComplexClose(result, expected, 1e-10)
		})

		it('integrates complex trigonometric functions cos(z) and sin(z)', () => {
			const z0 = { re: -0.5, im: 0.7 }
			const z1 = { re: 1.2, im: -0.4 }

			const resCos = integralComplexRecursive(cCos, z0, z1)
			assertComplexClose(resCos, cSub(cSin(z1), cSin(z0)), 1e-10)

			const resSin = integralComplexRecursive(cSin, z0, z1)
			assertComplexClose(resSin, cSub(cCos(z0), cCos(z1)), 1e-10)
		})

		it('integrates 1/z off the negative real axis against principal Log', () => {
			const z0 = { re: 1, im: 1 }
			const z1 = { re: 3, im: -2 }
			const f = (z) => cDiv({ re: 1, im: 0 }, z)
			const result = integralComplexRecursive(f, z0, z1)
			const expected = cSub(cLog(z1), cLog(z0))
			assertComplexClose(result, expected, 1e-9)
		})

		it('integrates non-holomorphic conjugate f(z) = conj(z) along a straight line', () => {
			const z0 = { re: 1, im: 2 }
			const z1 = { re: 4, im: -1 }
			const result = integralComplexRecursive(cConj, z0, z1)
			// Exact: 0.5 * (z1 - z0) * (conj(z0) + conj(z1))
			const expected = cMul(
				{ re: 0.5, im: 0 },
				cMul(cSub(z1, z0), cAdd(cConj(z0), cConj(z1))),
			)
			assertComplexClose(result, expected, 1e-12)
		})
	})

	describe('edge cases and adaptive behavior', () => {
		it('returns { re: 0, im: 0 } (no -0) on degenerate contour z0 === z1', () => {
			const z = { re: -0, im: 2.5 }
			let calls = 0
			const result = integralComplexRecursive(
				(pt) => {
					calls++
					assert.ok(Object.is(pt.re, 0))
					return { re: -0, im: -0 }
				},
				z,
				{ re: 0, im: 2.5 },
			)
			assert.equal(calls, 1)
			assert.ok(Object.is(result.re, 0))
			assert.ok(Object.is(result.im, 0))
		})

		it('normalizes -0 to +0 in returned complex values', () => {
			// Integral of f(z) = 0 from 0 to 1, and odd function on symmetric interval [-1, 1]
			const resZero = integralComplexRecursive(
				() => ({ re: -0, im: -0 }),
				{ re: 0, im: 0 },
				{ re: 1, im: 0 },
			)
			assert.ok(Object.is(resZero.re, 0))
			assert.ok(Object.is(resZero.im, 0))

			const resOdd = integralComplexRecursive(
				(z) => z,
				{ re: -1, im: -1 },
				{ re: 1, im: 1 },
			)
			assert.ok(Object.is(resOdd.re, 0))
			assert.ok(Object.is(resOdd.im, 0))
		})

		it('handles purely real and purely imaginary contours', () => {
			// Real axis: ∫_0^π sin(x) dx = 2
			const realRes = integralComplexRecursive(
				cSin,
				{ re: 0, im: 0 },
				{ re: Math.PI, im: 0 },
			)
			assertComplexClose(realRes, { re: 2, im: 0 }, 1e-10)

			// Imaginary axis: ∫_0^{iπ} e^z dz = e^{iπ} - 1 = -2
			const imagRes = integralComplexRecursive(
				cExp,
				{ re: 0, im: 0 },
				{ re: 0, im: Math.PI },
			)
			assertComplexClose(imagRes, { re: -2, im: 0 }, 1e-10)
		})

		it('reverses sign when contour orientation is reversed', () => {
			const f = (z) => cMul(cExp(z), cSin(z))
			const z0 = { re: -0.3, im: 0.8 }
			const z1 = { re: 1.1, im: -0.6 }
			const forward = integralComplexRecursive(f, z0, z1)
			const backward = integralComplexRecursive(f, z1, z0)
			assertComplexClose(cAdd(forward, backward), { re: 0, im: 0 }, 1e-10)
		})

		it('accurately integrates sharply peaked and oscillatory functions via adaptive refinement', () => {
			// Sharp Lorentzian peak along real axis: ∫_{-2}^{2} 1 / (z^2 + 0.01) dz = 20 * atan(20)
			const peakF = (z) => cDiv({ re: 1, im: 0 }, cAdd(cPow(z, 2), { re: 0.01, im: 0 }))
			const peakRes = integralComplexRecursive(
				peakF,
				{ re: -2, im: 0 },
				{ re: 2, im: 0 },
				{ tolerance: 1e-10 },
			)
			assertComplexClose(peakRes, { re: 20 * Math.atan(20), im: 0 }, 1e-9)

			// Periodic aliasing trap: ∫_0^1 sin^2(4πx) dx = 0.5
			const oscF = (z) => {
				const s = Math.sin(4 * Math.PI * z.re)
				return { re: s * s, im: 0 }
			}
			const oscRes = integralComplexRecursive(
				oscF,
				{ re: 0, im: 0 },
				{ re: 1, im: 0 },
				{ tolerance: 1e-10 },
			)
			assertComplexClose(oscRes, { re: 0.5, im: 0 }, 1e-9)
		})

		it('respects maxDepth: 0 and explicit minDepth options', () => {
			// Cubic is exact even at maxDepth: 0
			const z0 = { re: 0, im: 1 }
			const z1 = { re: 2, im: -1 }
			const res = integralComplexRecursive((z) => cPow(z, 3), z0, z1, {
				maxDepth: 0,
			})
			const expected = cDiv(cSub(cPow(z1, 4), cPow(z0, 4)), { re: 4, im: 0 })
			assertComplexClose(res, expected, 1e-12)

			// Explicit minDepth: 0 stops early for polynomials with minimal evaluations
			let evals = 0
			integralComplexRecursive(
				(z) => {
					evals++
					return z
				},
				z0,
				z1,
				{ minDepth: 0, maxDepth: 10 },
			)
			assert.equal(evals, 5)
		})
	})

	describe('mathematical identities and independent cross-checks', () => {
		const squareVertices = [
			{ re: -1, im: -1 },
			{ re: 1, im: -1 },
			{ re: 1, im: 1 },
			{ re: -1, im: 1 },
		]

		function integrateClosedPolygon(f, vertices, options) {
			let total = { re: 0, im: 0 }
			for (let i = 0; i < vertices.length; i++) {
				const a = vertices[i]
				const b = vertices[(i + 1) % vertices.length]
				total = cAdd(total, integralComplexRecursive(f, a, b, options))
			}
			return total
		}

		it("satisfies Cauchy's Integral Theorem (closed contour of entire function equals 0)", () => {
			const entire = (z) => cMul(cExp(z), cSub(cPow(z, 2), { re: 1, im: 0 }))
			const closed = integrateClosedPolygon(entire, squareVertices, {
				tolerance: 1e-10,
			})
			assertComplexClose(closed, { re: 0, im: 0 }, 1e-9)
		})

		it("satisfies Cauchy's Integral Formula and Residue Theorem around poles", () => {
			// ∮ (1 / z) dz = 2πi around unit-half-width square enclosing 0
			const poleOrigin = integrateClosedPolygon(
				(z) => cDiv({ re: 1, im: 0 }, z),
				squareVertices,
				{ tolerance: 1e-10 },
			)
			assertComplexClose(poleOrigin, { re: 0, im: 2 * Math.PI }, 1e-9)

			// ∮ (e^z / (z - zc)) dz = 2πi * e^{zc} for zc = 0.25 - 0.3i inside the square
			const zc = { re: 0.25, im: -0.3 }
			const cauchyVal = integrateClosedPolygon(
				(z) => cDiv(cExp(z), cSub(z, zc)),
				squareVertices,
				{ tolerance: 1e-10 },
			)
			const expected = cMul({ re: 0, im: 2 * Math.PI }, cExp(zc))
			assertComplexClose(cauchyVal, expected, 1e-8)
		})

		it("satisfies Green's Theorem for non-analytic f(z) = conj(z) around a square", () => {
			// Area of [-1, 1] x [-1, 1] is 4, so ∮ conj(z) dz = 2i * Area = 8i
			const closedConj = integrateClosedPolygon(cConj, squareVertices)
			assertComplexClose(closedConj, { re: 0, im: 8 }, 1e-10)
		})

		it('satisfies linearity and path additivity', () => {
			const alpha = { re: 2, im: -1 }
			const beta = { re: -0.5, im: 3 }
			const f = (z) => cExp(z)
			const g = (z) => cCos(z)
			const z0 = { re: -0.5, im: 0.2 }
			const zMid = { re: 0.4, im: 0.9 }
			const z1 = { re: 1.3, im: -0.6 }

			// Linearity: ∫ (αf + βg) = α∫f + β∫g
			const lhs = integralComplexRecursive(
				(z) => cAdd(cMul(alpha, f(z)), cMul(beta, g(z))),
				z0,
				z1,
			)
			const rhs = cAdd(
				cMul(alpha, integralComplexRecursive(f, z0, z1)),
				cMul(beta, integralComplexRecursive(g, z0, z1)),
			)
			assertComplexClose(lhs, rhs, 1e-9)

			// Path independence / additivity for holomorphic f
			const direct = integralComplexRecursive(f, z0, z1)
			const split = cAdd(
				integralComplexRecursive(f, z0, zMid),
				integralComplexRecursive(f, zMid, z1),
			)
			assertComplexClose(direct, split, 1e-9)
		})

		it('matches independent iterative composite Simpson quadrature across complex integrands', () => {
			const cases = [
				{
					f: (z) => cDiv(cExp(z), cAdd(cPow(z, 2), { re: 4, im: 1 })),
					z0: { re: -1, im: 0.5 },
					z1: { re: 1.5, im: -1.2 },
				},
				{
					f: (z) => cMul(cSin(cPow(z, 2)), cConj(z)),
					z0: { re: 0.2, im: -0.4 },
					z1: { re: 1.1, im: 0.8 },
				},
				{
					f: (z) => ({ re: z.re * z.re + z.im * z.im, im: Math.exp(-z.re) * z.im }),
					z0: { re: -0.7, im: -0.9 },
					z1: { re: 0.9, im: 1.3 },
				},
			]

			for (const { f, z0, z1 } of cases) {
				const recursiveRes = integralComplexRecursive(f, z0, z1, {
					tolerance: 1e-10,
				})
				const iterativeRes = iterativeCompositeSimpson(f, z0, z1, 2000)
				assertComplexClose(recursiveRes, iterativeRes, 1e-9)
			}
		})
	})

	describe('input validation', () => {
		const id = (z) => z
		const a = { re: 0, im: 0 }
		const b = { re: 1, im: 1 }

		it('throws TypeError for non-function f', () => {
			assert.throws(() => integralComplexRecursive(null, a, b), TypeError)
			assert.throws(() => integralComplexRecursive(42, a, b), TypeError)
			assert.throws(() => integralComplexRecursive('z', a, b), TypeError)
		})

		it('throws TypeError / RangeError for invalid z0 or z1', () => {
			assert.throws(() => integralComplexRecursive(id, null, b), TypeError)
			assert.throws(() => integralComplexRecursive(id, [0, 0], b), TypeError)
			assert.throws(() => integralComplexRecursive(id, { re: '0', im: 0 }, b), TypeError)
			assert.throws(() => integralComplexRecursive(id, a, { re: 1 }), TypeError)

			assert.throws(
				() => integralComplexRecursive(id, { re: NaN, im: 0 }, b),
				RangeError,
			)
			assert.throws(
				() => integralComplexRecursive(id, a, { re: 0, im: Infinity }),
				RangeError,
			)
			assert.throws(
				() => integralComplexRecursive(id, { re: -Infinity, im: 0 }, b),
				RangeError,
			)
		})

		it('throws TypeError / RangeError when f(z) returns invalid complex values', () => {
			assert.throws(() => integralComplexRecursive(() => 5, a, b), TypeError)
			assert.throws(() => integralComplexRecursive(() => null, a, b), TypeError)
			assert.throws(
				() => integralComplexRecursive(() => ({ re: 1, im: 'bad' }), a, b),
				TypeError,
			)
			assert.throws(
				() => integralComplexRecursive(() => ({ re: NaN, im: 0 }), a, b),
				RangeError,
			)
			assert.throws(
				() => integralComplexRecursive(() => ({ re: Infinity, im: 0 }), a, a),
				RangeError,
			)
		})

		it('throws TypeError / RangeError for invalid options', () => {
			assert.throws(() => integralComplexRecursive(id, a, b, null), TypeError)
			assert.throws(() => integralComplexRecursive(id, a, b, []), TypeError)
			assert.throws(() => integralComplexRecursive(id, a, b, 1e-6), TypeError)

			assert.throws(
				() => integralComplexRecursive(id, a, b, { tolerance: '1e-6' }),
				TypeError,
			)
			assert.throws(
				() => integralComplexRecursive(id, a, b, { tolerance: 0 }),
				RangeError,
			)
			assert.throws(
				() => integralComplexRecursive(id, a, b, { tolerance: -1e-6 }),
				RangeError,
			)
			assert.throws(
				() => integralComplexRecursive(id, a, b, { tolerance: Infinity }),
				RangeError,
			)

			assert.throws(
				() => integralComplexRecursive(id, a, b, { maxDepth: '10' }),
				TypeError,
			)
			assert.throws(
				() => integralComplexRecursive(id, a, b, { maxDepth: -1 }),
				RangeError,
			)
			assert.throws(
				() => integralComplexRecursive(id, a, b, { maxDepth: 2.5 }),
				RangeError,
			)

			assert.throws(
				() => integralComplexRecursive(id, a, b, { minDepth: '1' }),
				TypeError,
			)
			assert.throws(
				() => integralComplexRecursive(id, a, b, { minDepth: -1 }),
				RangeError,
			)
			assert.throws(
				() => integralComplexRecursive(id, a, b, { maxDepth: 2, minDepth: 3 }),
				RangeError,
			)
		})

		it('throws RangeError when intermediate or final result overflows', () => {
			assert.throws(
				() =>
					integralComplexRecursive(
						() => ({ re: 1e308, im: 0 }),
						{ re: 0, im: 0 },
						{ re: 1e10, im: 0 },
					),
				RangeError,
			)
			assert.throws(
				() =>
					integralComplexRecursive(
						id,
						{ re: -1e308, im: 0 },
						{ re: 1e308, im: 0 },
					),
				RangeError,
			)
		})
	})
})
