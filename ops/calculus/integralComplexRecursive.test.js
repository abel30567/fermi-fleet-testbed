import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { integralComplexRecursive } from './integralComplexRecursive.js'

/**
 * Helper to assert two complex numbers are approximately equal.
 *
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [eps=1e-7]
 */
function assertComplexClose(actual, expected, eps = 1e-7) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`real part mismatch: expected ${expected.re}, got ${actual.re} (diff ${Math.abs(actual.re - expected.re)} > ${eps})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`imag part mismatch: expected ${expected.im}, got ${actual.im} (diff ${Math.abs(actual.im - expected.im)} > ${eps})`,
	)
}

/** Complex arithmetic helpers for tests */
const cAdd = (u, v) => ({ re: u.re + v.re, im: u.im + v.im })
const cSub = (u, v) => ({ re: u.re - v.re, im: u.im - v.im })
const cMul = (u, v) => ({ re: u.re * v.re - u.im * v.im, im: u.re * v.im + u.im * v.re })
const cDiv = (u, v) => {
	const d = v.re * v.re + v.im * v.im
	return { re: (u.re * v.re + u.im * v.im) / d, im: (u.im * v.re - u.re * v.im) / d }
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
const cLog = (z) => ({
	re: Math.log(Math.hypot(z.re, z.im)),
	im: Math.atan2(z.im, z.re),
})

describe('integralComplexRecursive', () => {
	describe('normal cases', () => {
		it('integrates a constant complex function along a diagonal path', () => {
			const c = { re: 3, im: -4 }
			const a = { re: 1, im: 2 }
			const b = { re: 4, im: -1 }
			const res = integralComplexRecursive(() => c, a, b)
			const expected = cMul(c, cSub(b, a))
			assertComplexClose(res, expected, 1e-12)
		})

		it('integrates a complex polynomial against its exact antiderivative', () => {
			// f(z) = z^2 + (1 + i)z - 2i
			// F(z) = z^3 / 3 + (1 + i)z^2 / 2 - 2i * z
			const f = (z) => {
				const z2 = cMul(z, z)
				const lin = cMul({ re: 1, im: 1 }, z)
				return cAdd(cAdd(z2, lin), { re: 0, im: -2 })
			}
			const F = (z) => {
				const z2 = cMul(z, z)
				const z3 = cMul(z2, z)
				const t1 = { re: z3.re / 3, im: z3.im / 3 }
				const t2 = cMul({ re: 0.5, im: 0.5 }, z2)
				const t3 = cMul({ re: 0, im: -2 }, z)
				return cAdd(cAdd(t1, t2), t3)
			}
			const a = { re: -1.5, im: 0.5 }
			const b = { re: 2.0, im: 1.5 }
			const res = integralComplexRecursive(f, a, b)
			assertComplexClose(res, cSub(F(b), F(a)), 1e-11)
		})

		it('integrates exp(z) along a complex diagonal segment', () => {
			const a = { re: 0.25, im: -0.5 }
			const b = { re: 1.5, im: 1.25 }
			const res = integralComplexRecursive(cExp, a, b)
			assertComplexClose(res, cSub(cExp(b), cExp(a)), 1e-9)
		})

		it('integrates cos(z) against sin(b) - sin(a)', () => {
			const a = { re: -0.5, im: 0.3 }
			const b = { re: 1.1, im: -0.7 }
			const res = integralComplexRecursive(cCos, a, b)
			assertComplexClose(res, cSub(cSin(b), cSin(a)), 1e-9)
		})

		it('integrates exp(i*x) along the real axis [0, pi] to 2i', () => {
			const res = integralComplexRecursive(
				(z) => cExp(cMul({ re: 0, im: 1 }, z)),
				{ re: 0, im: 0 },
				{ re: Math.PI, im: 0 },
			)
			assertComplexClose(res, { re: 0, im: 2 }, 1e-9)
		})

		it('integrates exp(z) along the imaginary axis [0, i*pi/2]', () => {
			const a = { re: 0, im: 0 }
			const b = { re: 0, im: Math.PI / 2 }
			const res = integralComplexRecursive(cExp, a, b)
			// exp(i*pi/2) - exp(0) = i - 1
			assertComplexClose(res, { re: -1, im: 1 }, 1e-9)
		})

		it('satisfies Cauchy integral theorem on a closed square contour for holomorphic exp(z)', () => {
			const vertices = [
				{ re: 1, im: -1 },
				{ re: 1, im: 1 },
				{ re: -1, im: 1 },
				{ re: -1, im: -1 },
			]
			let total = { re: 0, im: 0 }
			for (let i = 0; i < vertices.length; i++) {
				const seg = integralComplexRecursive(cExp, vertices[i], vertices[(i + 1) % vertices.length])
				total = cAdd(total, seg)
			}
			assertComplexClose(total, { re: 0, im: 0 }, 1e-9)
		})

		it('satisfies Cauchy residue theorem: contour integral of 1/z around origin equals 2*pi*i', () => {
			const inv = (z) => cDiv({ re: 1, im: 0 }, z)
			const vertices = [
				{ re: 1, im: -1 },
				{ re: 1, im: 1 },
				{ re: -1, im: 1 },
				{ re: -1, im: -1 },
			]
			let total = { re: 0, im: 0 }
			for (let i = 0; i < vertices.length; i++) {
				const seg = integralComplexRecursive(inv, vertices[i], vertices[(i + 1) % vertices.length])
				total = cAdd(total, seg)
			}
			assertComplexClose(total, { re: 0, im: 2 * Math.PI }, 1e-8)
		})

		it('satisfies path independence for holomorphic z^3', () => {
			const cube = (z) => cMul(cMul(z, z), z)
			const a = { re: 0, im: 0 }
			const mid = { re: 2, im: -1 }
			const b = { re: 1, im: 2 }
			const direct = integralComplexRecursive(cube, a, b)
			const twoStep = cAdd(
				integralComplexRecursive(cube, a, mid),
				integralComplexRecursive(cube, mid, b),
			)
			assertComplexClose(direct, twoStep, 1e-10)
		})

		it('adaptively resolves a sharply peaked near-pole integrand', () => {
			// Integral of 1 / (z - p) from a to b where p = 0.5 + 0.05i is very close to [0, 1]
			const p = { re: 0.5, im: 0.05 }
			const a = { re: 0, im: 0 }
			const b = { re: 1, im: 0 }
			const f = (z) => cDiv({ re: 1, im: 0 }, cSub(z, p))
			const res = integralComplexRecursive(f, a, b, { tolerance: 1e-9 })
			const expected = cSub(cLog(cSub(b, p)), cLog(cSub(a, p)))
			assertComplexClose(res, expected, 1e-7)
		})

		it('respects linearity over complex scalars', () => {
			const a = { re: -0.5, im: 0.2 }
			const b = { re: 0.8, im: 0.9 }
			const c1 = { re: 2, im: -1 }
			const c2 = { re: -0.5, im: 3 }
			const f = cExp
			const g = (z) => cMul(z, z)
			const combined = integralComplexRecursive(
				(z) => cAdd(cMul(c1, f(z)), cMul(c2, g(z))),
				a,
				b,
			)
			const separated = cAdd(
				cMul(c1, integralComplexRecursive(f, a, b)),
				cMul(c2, integralComplexRecursive(g, a, b)),
			)
			assertComplexClose(combined, separated, 1e-9)
		})
	})

	describe('edge cases', () => {
		it('returns { re: 0, im: 0 } when endpoints are identical', () => {
			const p = { re: 2.5, im: -3.5 }
			const res = integralComplexRecursive(cExp, p, p)
			assert.deepStrictEqual(res, { re: 0, im: 0 })
			assert.ok(!Object.is(res.re, -0))
			assert.ok(!Object.is(res.im, -0))
		})

		it('negates the integral when endpoints are reversed', () => {
			const a = { re: -1, im: 2 }
			const b = { re: 1.5, im: -0.5 }
			const forward = integralComplexRecursive(cExp, a, b)
			const backward = integralComplexRecursive(cExp, b, a)
			assertComplexClose(cAdd(forward, backward), { re: 0, im: 0 }, 1e-9)
		})

		it('returns exact +0 components for the zero function', () => {
			const res = integralComplexRecursive(
				() => ({ re: -0, im: -0 }),
				{ re: 0, im: 0 },
				{ re: 1, im: 1 },
			)
			assert.deepStrictEqual(res, { re: 0, im: 0 })
			assert.ok(!Object.is(res.re, -0))
			assert.ok(!Object.is(res.im, -0))
		})

		it('supports maxDepth: 0 (base Simpson rule, exact for degree <= 3)', () => {
			const cubic = (z) => cMul(cMul(z, z), z)
			const a = { re: 0, im: 0 }
			const b = { re: 1, im: 1 }
			// (1+i)^4 / 4 = -4 / 4 = -1
			const res = integralComplexRecursive(cubic, a, b, { maxDepth: 0 })
			assertComplexClose(res, { re: -1, im: 0 }, 1e-12)
		})

		it('handles periodic function without premature aliasing termination', () => {
			// Integral of sin^2(2*pi*x) on [0, 1] is 0.5
			const f = (z) => {
				const s = Math.sin(2 * Math.PI * z.re)
				return { re: s * s, im: 0 }
			}
			const res = integralComplexRecursive(f, { re: 0, im: 0 }, { re: 1, im: 0 })
			assertComplexClose(res, { re: 0.5, im: 0 }, 1e-9)
		})

		it('handles very small intervals accurately', () => {
			const a = { re: 1, im: 1 }
			const b = { re: 1 + 1e-10, im: 1 + 1e-10 }
			const res = integralComplexRecursive(cExp, a, b)
			const expected = cSub(cExp(b), cExp(a))
			assertComplexClose(res, expected, 1e-15)
		})
	})

	describe('input validation', () => {
		const id = (z) => z
		const zero = { re: 0, im: 0 }
		const one = { re: 1, im: 0 }

		it('throws TypeError for non-function fn', () => {
			assert.throws(() => integralComplexRecursive(null, zero, one), TypeError)
			assert.throws(() => integralComplexRecursive(42, zero, one), TypeError)
			assert.throws(() => integralComplexRecursive('z => z', zero, one), TypeError)
		})

		it('throws TypeError for invalid a or b shapes/types', () => {
			assert.throws(() => integralComplexRecursive(id, null, one), TypeError)
			assert.throws(() => integralComplexRecursive(id, zero, undefined), TypeError)
			assert.throws(() => integralComplexRecursive(id, [0, 0], one), TypeError)
			assert.throws(() => integralComplexRecursive(id, { re: '0', im: 0 }, one), TypeError)
			assert.throws(() => integralComplexRecursive(id, zero, { re: 1 }), TypeError)
		})

		it('throws RangeError for non-finite a or b components', () => {
			assert.throws(() => integralComplexRecursive(id, { re: NaN, im: 0 }, one), RangeError)
			assert.throws(() => integralComplexRecursive(id, zero, { re: 1, im: Infinity }), RangeError)
			assert.throws(() => integralComplexRecursive(id, { re: -Infinity, im: 0 }, one), RangeError)
		})

		it('throws TypeError or RangeError for invalid options', () => {
			assert.throws(() => integralComplexRecursive(id, zero, one, null), TypeError)
			assert.throws(() => integralComplexRecursive(id, zero, one, []), TypeError)
			assert.throws(() => integralComplexRecursive(id, zero, one, { tolerance: '1e-6' }), TypeError)
			assert.throws(() => integralComplexRecursive(id, zero, one, { tolerance: 0 }), RangeError)
			assert.throws(() => integralComplexRecursive(id, zero, one, { tolerance: -1e-6 }), RangeError)
			assert.throws(() => integralComplexRecursive(id, zero, one, { tolerance: Infinity }), RangeError)
			assert.throws(() => integralComplexRecursive(id, zero, one, { maxDepth: '5' }), TypeError)
			assert.throws(() => integralComplexRecursive(id, zero, one, { maxDepth: -1 }), RangeError)
			assert.throws(() => integralComplexRecursive(id, zero, one, { maxDepth: 2.5 }), RangeError)
			assert.throws(() => integralComplexRecursive(id, zero, one, { minDepth: '1' }), TypeError)
			assert.throws(() => integralComplexRecursive(id, zero, one, { minDepth: -1 }), RangeError)
			assert.throws(
				() => integralComplexRecursive(id, zero, one, { maxDepth: 3, minDepth: 4 }),
				RangeError,
			)
		})

		it('throws when fn returns an invalid or non-finite complex value', () => {
			assert.throws(() => integralComplexRecursive(() => null, zero, one), TypeError)
			assert.throws(() => integralComplexRecursive(() => 123, zero, one), TypeError)
			assert.throws(() => integralComplexRecursive(() => ({ re: NaN, im: 0 }), zero, one), RangeError)
			assert.throws(
				() => integralComplexRecursive(() => ({ re: 0, im: Infinity }), zero, one),
				RangeError,
			)
		})
	})

	describe('independent cross-check', () => {
		it('matches an independent iterative composite midpoint rule on exp(z^2)', () => {
			// Non-elementary complex integrand f(z) = exp(z^2)
			const f = (z) => cExp(cMul(z, z))
			const a = { re: 0.2, im: -0.4 }
			const b = { re: 0.9, im: 0.6 }

			const recursiveResult = integralComplexRecursive(f, a, b, { tolerance: 1e-10 })

			// Independent iterative composite midpoint quadrature with N = 10_000 panels
			const N = 10_000
			const dz = { re: (b.re - a.re) / N, im: (b.im - a.im) / N }
			let sum = { re: 0, im: 0 }
			for (let k = 0; k < N; k++) {
				const t = (k + 0.5) / N
				const z = { re: a.re + t * (b.re - a.re), im: a.im + t * (b.im - a.im) }
				sum = cAdd(sum, f(z))
			}
			const midpointResult = cMul(sum, dz)

			assertComplexClose(recursiveResult, midpointResult, 1e-6)
		})
	})
})
