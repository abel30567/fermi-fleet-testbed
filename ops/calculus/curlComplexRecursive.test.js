import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { curlComplexRecursive } from './curlComplexRecursive.js'

/**
 * Complex helpers for tests (independent of module internals).
 */
const c = (re, im = 0) => ({ re, im })
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im })
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im })
const cMul = (a, b) => ({
	re: a.re * b.re - a.im * b.im,
	im: a.re * b.im + a.im * b.re,
})
const cScale = (a, s) => ({ re: a.re * s, im: a.im * s })
const cExp = (z) => {
	const er = Math.exp(z.re)
	return { re: er * Math.cos(z.im), im: er * Math.sin(z.im) }
}
const cSin = (z) => ({
	re: Math.sin(z.re) * Math.cosh(z.im),
	im: Math.cos(z.re) * Math.sinh(z.im),
})
const cCos = (z) => ({
	re: Math.cos(z.re) * Math.cosh(z.im),
	im: -Math.sin(z.re) * Math.sinh(z.im),
})

function assertComplexClose(actual, expected, tol = 1e-10, label = '') {
	const dRe = Math.abs(actual.re - expected.re)
	const dIm = Math.abs(actual.im - expected.im)
	assert.ok(
		dRe <= tol && dIm <= tol,
		`${label}expected (${expected.re}, ${expected.im}i), got (${actual.re}, ${actual.im}i) (diff: re=${dRe}, im=${dIm}, tol=${tol})`,
	)
}

function assertComplexVec3Close(actual, expected, tol = 1e-10) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assertComplexClose(actual[i], expected[i], tol, `component[${i}]: `)
	}
}

/**
 * Independent non-recursive 4th-order 5-point stencil curl implementation
 * used as an external numerical cross-check.
 */
function independentFivePointCurl(field, point, h = 1e-3) {
	const partial = (comp, axis) => {
		const evalShift = (mult) => {
			const p = point.map((v, idx) => (idx === axis ? { re: v.re + mult * h, im: v.im } : { ...v }))
			return field(p)[comp]
		}
		const fm2 = evalShift(-2)
		const fm1 = evalShift(-1)
		const fp1 = evalShift(1)
		const fp2 = evalShift(2)
		return {
			re: (fm2.re - 8 * fm1.re + 8 * fp1.re - fp2.re) / (12 * h),
			im: (fm2.im - 8 * fm1.im + 8 * fp1.im - fp2.im) / (12 * h),
		}
	}
	return [
		cSub(partial(2, 1), partial(1, 2)),
		cSub(partial(0, 2), partial(2, 0)),
		cSub(partial(1, 0), partial(0, 1)),
	]
}

describe('curlComplexRecursive', () => {
	describe('normal cases', () => {
		it('returns zero vector for a constant complex vector field', () => {
			const field = () => [c(3, -4), c(-1.5, 2.5), c(0, 7)]
			const res = curlComplexRecursive(field, [c(1, 2), c(-3, 4), c(5, -6)])
			assertComplexVec3Close(res, [c(0, 0), c(0, 0), c(0, 0)], 1e-13)
		})

		it('computes curl of a linear complex rotational field (-i*y, i*x, 0)', () => {
			const iUnit = c(0, 1)
			const negI = c(0, -1)
			const field = ([x, y]) => [cMul(negI, y), cMul(iUnit, x), c(0, 0)]
			const res = curlComplexRecursive(field, [c(2, -1), c(4, 3), c(-5, 0.5)])
			assertComplexVec3Close(res, [c(0, 0), c(0, 0), c(0, 2)], 1e-12)
		})

		it('computes exact curl for a nonlinear holomorphic polynomial field at complex coordinates', () => {
			// F(x, y, z) = (y*z^2, x^2*z, x*y^2)
			// curl F = (2*x*y - x^2, 2*y*z - y^2, 2*x*z - z^2)
			const field = ([x, y, z]) => [
				cMul(y, cMul(z, z)),
				cMul(cMul(x, x), z),
				cMul(x, cMul(y, y)),
			]
			const pt = [c(1, 2), c(-3, 1), c(2, -4)]
			const [x, y, z] = pt
			const expected = [
				cSub(cScale(cMul(x, y), 2), cMul(x, x)),
				cSub(cScale(cMul(y, z), 2), cMul(y, y)),
				cSub(cScale(cMul(x, z), 2), cMul(z, z)),
			]
			const res = curlComplexRecursive(field, pt)
			assertComplexVec3Close(res, expected, 1e-10)
		})

		it('computes curl of a complex electromagnetic plane wave E0 * exp(i * (k . r))', () => {
			// Analytic identity: curl(E0 * exp(i * k.r)) = i * (k x E0) * exp(i * k.r)
			const k = [c(1.2, 0), c(-0.7, 0), c(0.5, 0)]
			const E0 = [c(1, 0.5), c(-2, 1), c(0.3, -1.4)]
			const iUnit = c(0, 1)

			const field = ([x, y, z]) => {
				const dot = cAdd(cAdd(cMul(k[0], x), cMul(k[1], y)), cMul(k[2], z))
				const phase = cExp(cMul(iUnit, dot))
				return [cMul(E0[0], phase), cMul(E0[1], phase), cMul(E0[2], phase)]
			}

			const pt = [c(0.4, 0), c(-1.1, 0), c(0.8, 0)]
			const dot = cAdd(cAdd(cMul(k[0], pt[0]), cMul(k[1], pt[1])), cMul(k[2], pt[2]))
			const iPhase = cMul(iUnit, cExp(cMul(iUnit, dot)))
			const kCrossE0 = [
				cSub(cMul(k[1], E0[2]), cMul(k[2], E0[1])),
				cSub(cMul(k[2], E0[0]), cMul(k[0], E0[2])),
				cSub(cMul(k[0], E0[1]), cMul(k[1], E0[0])),
			]
			const expected = kCrossE0.map((v) => cMul(iPhase, v))

			const res = curlComplexRecursive(field, pt)
			assertComplexVec3Close(res, expected, 1e-11)
		})
	})

	describe('independent cross-checks and vector calculus identities', () => {
		it('matches independent 5-point stencil curl on a transcendental holomorphic field', () => {
			// F(x, y, z) = (sin(y*z), exp(0.5*x*z), cos(x + y)*z)
			const field = ([x, y, z]) => [
				cSin(cMul(y, z)),
				cExp(cScale(cMul(x, z), 0.5)),
				cMul(cCos(cAdd(x, y)), z),
			]
			const points = [
				[c(0.3, -0.2), c(-0.4, 0.5), c(0.6, 0.1)],
				[c(-0.7, 0.4), c(0.2, -0.3), c(-0.5, 0.25)],
			]

			for (const pt of points) {
				const recursiveRes = curlComplexRecursive(field, pt)
				const stencilRes = independentFivePointCurl(field, pt, 1e-3)
				assertComplexVec3Close(recursiveRes, stencilRes, 1e-10)
			}
		})

		it('satisfies curl(grad(phi)) = 0 for a nonlinear complex scalar potential', () => {
			// phi(x, y, z) = exp(0.5 * x * y) + z^2 * sin(x) + (1 + i) * y * z
			// grad(phi) = (
			//   0.5 * y * exp(0.5 * x * y) + z^2 * cos(x),
			//   0.5 * x * exp(0.5 * x * y) + (1 + i) * z,
			//   2 * z * sin(x) + (1 + i) * y
			// )
			const alpha = c(1, 1)
			const gradPhi = ([x, y, z]) => {
				const eTerm = cExp(cScale(cMul(x, y), 0.5))
				return [
					cAdd(cMul(cScale(y, 0.5), eTerm), cMul(cMul(z, z), cCos(x))),
					cAdd(cMul(cScale(x, 0.5), eTerm), cMul(alpha, z)),
					cAdd(cMul(cScale(z, 2), cSin(x)), cMul(alpha, y)),
				]
			}
			const pt = [c(0.5, -0.3), c(-0.2, 0.4), c(0.7, 0.2)]
			const res = curlComplexRecursive(gradPhi, pt)
			assertComplexVec3Close(res, [c(0, 0), c(0, 0), c(0, 0)], 1e-10)
		})

		it('satisfies div(curl(F)) = 0 via independent numerical divergence', () => {
			const field = ([x, y, z]) => [
				cSin(cMul(y, z)),
				cExp(cScale(cMul(x, z), 0.4)),
				cMul(cMul(x, y), z),
			]
			const curlField = (p) => curlComplexRecursive(field, p)
			const pt = [c(0.4, 0.2), c(-0.3, 0.5), c(0.6, -0.1)]
			const h = 1e-3

			let div = c(0, 0)
			for (let axis = 0; axis < 3; axis++) {
				const pPlus = pt.map((v, i) => (i === axis ? { re: v.re + h, im: v.im } : { ...v }))
				const pMinus = pt.map((v, i) => (i === axis ? { re: v.re - h, im: v.im } : { ...v }))
				const deriv = cScale(cSub(curlField(pPlus)[axis], curlField(pMinus)[axis]), 1 / (2 * h))
				div = cAdd(div, deriv)
			}
			assertComplexClose(div, c(0, 0), 1e-6, 'div(curl(F)): ')
		})

		it('satisfies complex linearity: curl(a*F + b*G) = a*curl(F) + b*curl(G)', () => {
			const F = ([x, y, z]) => [cMul(y, z), cMul(x, z), cMul(x, y)]
			const G = ([x, y, z]) => [cMul(z, z), cMul(x, x), cMul(y, y)]
			const a = c(2, -3)
			const b = c(-0.5, 4)
			const combined = (pt) => {
				const fv = F(pt)
				const gv = G(pt)
				return [0, 1, 2].map((i) => cAdd(cMul(a, fv[i]), cMul(b, gv[i])))
			}
			const pt = [c(1.5, -0.5), c(-2, 1), c(0.5, 2.5)]
			const curlF = curlComplexRecursive(F, pt)
			const curlG = curlComplexRecursive(G, pt)
			const expected = [0, 1, 2].map((i) => cAdd(cMul(a, curlF[i]), cMul(b, curlG[i])))
			const actual = curlComplexRecursive(combined, pt)
			assertComplexVec3Close(actual, expected, 1e-10)
		})
	})

	describe('edge cases', () => {
		it('works at the origin with purely real and purely imaginary fields', () => {
			const field = ([x, y, z]) => [
				c(y.re, z.re),
				c(z.re, x.re),
				c(x.re, y.re),
			]
			// dFz/dy - dFy/dz = i - 1 = (-1, 1)
			// dFx/dz - dFz/dx = i - 1 = (-1, 1)
			// dFy/dx - dFx/dy = i - 1 = (-1, 1)
			const res = curlComplexRecursive(field, [c(0, 0), c(0, 0), c(0, 0)])
			assertComplexVec3Close(res, [c(-1, 1), c(-1, 1), c(-1, 1)], 1e-12)
		})

		it('supports maxDepth = 0 (base-case single central difference)', () => {
			// Quadratic field: central difference is exact even at maxDepth = 0
			const field = ([x, y, z]) => [cMul(y, y), cMul(z, z), cMul(x, x)]
			const pt = [c(1, 2), c(3, -1), c(-2, 0.5)]
			const expected = [
				cScale(pt[2], -2), // 0 - 2z
				cScale(pt[0], -2), // 0 - 2x
				cScale(pt[1], -2), // 0 - 2y
			]
			const res = curlComplexRecursive(field, pt, { h: 1e-3, maxDepth: 0 })
			assertComplexVec3Close(res, expected, 1e-10)
		})

		it('does not mutate the input point or produce -0 values', () => {
			const pt = [c(1, 0), c(0, -1), c(0, 0)]
			const snapshot = structuredClone(pt)
			const field = () => [c(0, 0), c(0, 0), c(0, 0)]
			const res = curlComplexRecursive(field, pt)

			assert.deepStrictEqual(pt, snapshot)
			for (const comp of res) {
				assert.ok(!Object.is(comp.re, -0), 're should not be -0')
				assert.ok(!Object.is(comp.im, -0), 'im should not be -0')
			}
		})

		it('handles custom options (h, maxDepth, tolerance)', () => {
			const field = ([x, y, z]) => [cSin(y), cSin(z), cSin(x)]
			const pt = [c(0.5, 0.2), c(-0.3, 0.4), c(0.8, -0.1)]
			const expected = [
				cScale(cCos(pt[2]), -1),
				cScale(cCos(pt[0]), -1),
				cScale(cCos(pt[1]), -1),
			]
			const res = curlComplexRecursive(field, pt, {
				h: 0.05,
				maxDepth: 6,
				tolerance: 1e-13,
			})
			assertComplexVec3Close(res, expected, 1e-11)
		})
	})

	describe('invalid input validation', () => {
		const validField = () => [c(0, 0), c(0, 0), c(0, 0)]
		const validPoint = [c(0, 0), c(0, 0), c(0, 0)]

		it('throws TypeError when field is not a function', () => {
			for (const badField of [null, undefined, 42, 'fn', {}, []]) {
				assert.throws(() => curlComplexRecursive(badField, validPoint), TypeError)
			}
		})

		it('throws TypeError or RangeError for invalid point shape or elements', () => {
			assert.throws(() => curlComplexRecursive(validField, null), TypeError)
			assert.throws(() => curlComplexRecursive(validField, 'not-array'), TypeError)
			assert.throws(() => curlComplexRecursive(validField, [c(0, 0), c(0, 0)]), RangeError)
			assert.throws(() => curlComplexRecursive(validField, [c(0, 0), c(0, 0), c(0, 0), c(0, 0)]), RangeError)

			assert.throws(() => curlComplexRecursive(validField, [1, c(0, 0), c(0, 0)]), TypeError)
			assert.throws(() => curlComplexRecursive(validField, [null, c(0, 0), c(0, 0)]), TypeError)
			assert.throws(() => curlComplexRecursive(validField, [[1, 2], c(0, 0), c(0, 0)]), TypeError)
			assert.throws(() => curlComplexRecursive(validField, [{ re: 1 }, c(0, 0), c(0, 0)]), TypeError)
			assert.throws(() => curlComplexRecursive(validField, [{ re: '1', im: 0 }, c(0, 0), c(0, 0)]), TypeError)

			assert.throws(() => curlComplexRecursive(validField, [{ re: Number.NaN, im: 0 }, c(0, 0), c(0, 0)]), RangeError)
			assert.throws(() => curlComplexRecursive(validField, [{ re: 0, im: Number.POSITIVE_INFINITY }, c(0, 0), c(0, 0)]), RangeError)
		})

		it('throws TypeError or RangeError when field returns invalid complex vector', () => {
			assert.throws(() => curlComplexRecursive(() => null, validPoint), TypeError)
			assert.throws(() => curlComplexRecursive(() => [c(0, 0), c(0, 0)], validPoint), RangeError)
			assert.throws(() => curlComplexRecursive(() => [1, 2, 3], validPoint), TypeError)
			assert.throws(() => curlComplexRecursive(() => [c(Number.NaN, 0), c(0, 0), c(0, 0)], validPoint), RangeError)
			assert.throws(() => curlComplexRecursive(() => [c(0, Number.NEGATIVE_INFINITY), c(0, 0), c(0, 0)], validPoint), RangeError)
		})

		it('throws TypeError or RangeError for invalid options', () => {
			assert.throws(() => curlComplexRecursive(validField, validPoint, null), TypeError)
			assert.throws(() => curlComplexRecursive(validField, validPoint, []), TypeError)
			assert.throws(() => curlComplexRecursive(validField, validPoint, 'bad'), TypeError)

			assert.throws(() => curlComplexRecursive(validField, validPoint, { h: '0.01' }), TypeError)
			assert.throws(() => curlComplexRecursive(validField, validPoint, { h: 0 }), RangeError)
			assert.throws(() => curlComplexRecursive(validField, validPoint, { h: -1e-2 }), RangeError)
			assert.throws(() => curlComplexRecursive(validField, validPoint, { h: Number.NaN }), RangeError)
			assert.throws(() => curlComplexRecursive(validField, validPoint, { h: Number.POSITIVE_INFINITY }), RangeError)

			assert.throws(() => curlComplexRecursive(validField, validPoint, { maxDepth: '3' }), TypeError)
			assert.throws(() => curlComplexRecursive(validField, validPoint, { maxDepth: -1 }), RangeError)
			assert.throws(() => curlComplexRecursive(validField, validPoint, { maxDepth: 2.5 }), RangeError)
			assert.throws(() => curlComplexRecursive(validField, validPoint, { maxDepth: 99 }), RangeError)

			assert.throws(() => curlComplexRecursive(validField, validPoint, { tolerance: '1e-9' }), TypeError)
			assert.throws(() => curlComplexRecursive(validField, validPoint, { tolerance: -1e-9 }), RangeError)
			assert.throws(() => curlComplexRecursive(validField, validPoint, { tolerance: Number.NaN }), RangeError)
		})
	})
})
