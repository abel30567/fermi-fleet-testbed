import { test, describe } from 'node:test'
import assert from 'node:assert'
import { divergenceComplexSeries } from './divergenceComplexSeries.js'

// Local complex arithmetic helpers for tests (zero dependencies)
const c = (re, im = 0) => ({ re, im })
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im })
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im })
const cMul = (a, b) => ({
	re: a.re * b.re - a.im * b.im,
	im: a.re * b.im + a.im * b.re,
})
const cConj = (a) => ({ re: a.re, im: -a.im })
const cScale = (a, s) => ({ re: a.re * s, im: a.im * s })
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
const cPow = (z, n) => {
	let acc = c(1, 0)
	for (let i = 0; i < n; i++) acc = cMul(acc, z)
	return acc
}

function assertComplexClose(actual, expected, tol = 1e-9, msg = '') {
	const errRe = Math.abs(actual.re - expected.re)
	const errIm = Math.abs(actual.im - expected.im)
	assert.ok(
		errRe <= tol && errIm <= tol,
		`${msg ? msg + ': ' : ''}expected {re: ${expected.re}, im: ${expected.im}} ± ${tol}, ` +
			`got {re: ${actual.re}, im: ${actual.im}} (|Δre|=${errRe}, |Δim|=${errIm})`
	)
}

describe('divergenceComplexSeries - normal cases', () => {
	test('linear field F(z) = A * z has divergence equal to tr(A) in 2D', () => {
		const A = [
			[c(2, -1), c(3, 4)],
			[c(-5, 2), c(-1.5, 3.25)],
		]
		const field = (z) =>
			A.map((row) =>
				row.reduce((acc, aij, j) => cAdd(acc, cMul(aij, z[j])), c(0, 0))
			)
		const expectedTrace = cAdd(A[0][0], A[1][1]) // { re: 0.5, im: 2.25 }

		for (const pt of [
			[c(0, 0), c(0, 0)],
			[c(1.2, -3.4), c(5.6, 0.7)],
			[c(-2, 4), c(3, -1)],
		]) {
			const result = divergenceComplexSeries(field, pt)
			assertComplexClose(result, expectedTrace, 1e-10)
		}
	})

	test('linear field F(z) = A * z has divergence equal to tr(A) in 3D', () => {
		const A = [
			[c(1, 2), c(-3, 0.5), c(0, -1)],
			[c(4, -2), c(-2.5, 1.5), c(7, 3)],
			[c(-1, -1), c(2, 2), c(3.25, -4.75)],
		]
		const field = (z) =>
			A.map((row) =>
				row.reduce((acc, aij, j) => cAdd(acc, cMul(aij, z[j])), c(0, 0))
			)
		const expectedTrace = cAdd(cAdd(A[0][0], A[1][1]), A[2][2])

		const result = divergenceComplexSeries(field, [c(1, -1), c(2, 3), c(-0.5, 0.25)])
		assertComplexClose(result, expectedTrace, 1e-10)
	})

	test('2D polynomial complex vector field', () => {
		// F(z1, z2) = [z1^3 * z2 + (1+i)*z1, z1^2 * z2^2 - i*z2^4]
		// dF1/dz1 = 3*z1^2*z2 + (1+i)
		// dF2/dz2 = 2*z1^2*z2 - 4i*z2^3
		// div(F) = 5*z1^2*z2 + (1+i) - 4i*z2^3
		const field = ([z1, z2]) => [
			cAdd(cMul(cPow(z1, 3), z2), cMul(c(1, 1), z1)),
			cSub(cMul(cPow(z1, 2), cPow(z2, 2)), cMul(c(0, 1), cPow(z2, 4))),
		]
		const pt = [c(1.5, -0.5), c(-0.75, 1.25)]
		const [z1, z2] = pt
		const expected = cSub(
			cAdd(cScale(cMul(cPow(z1, 2), z2), 5), c(1, 1)),
			cMul(c(0, 4), cPow(z2, 3))
		)

		const actual = divergenceComplexSeries(field, pt)
		assertComplexClose(actual, expected, 1e-9)
	})

	test('3D polynomial complex vector field', () => {
		// F(z1, z2, z3) = [z1^2*z2 + z3^3, z2^3 - z1*z3, z1*z2*z3^2 + (2-3i)*z3]
		// dF1/dz1 = 2*z1*z2
		// dF2/dz2 = 3*z2^2
		// dF3/dz3 = 2*z1*z2*z3 + (2-3i)
		const field = ([z1, z2, z3]) => [
			cAdd(cMul(cPow(z1, 2), z2), cPow(z3, 3)),
			cSub(cPow(z2, 3), cMul(z1, z3)),
			cAdd(cMul(cMul(z1, z2), cPow(z3, 2)), cMul(c(2, -3), z3)),
		]
		const pt = [c(0.8, 1.1), c(-1.2, 0.4), c(0.5, -0.9)]
		const [z1, z2, z3] = pt
		const d1 = cScale(cMul(z1, z2), 2)
		const d2 = cScale(cPow(z2, 2), 3)
		const d3 = cAdd(cScale(cMul(cMul(z1, z2), z3), 2), c(2, -3))
		const expected = cAdd(cAdd(d1, d2), d3)

		const actual = divergenceComplexSeries(field, pt)
		assertComplexClose(actual, expected, 1e-9)
	})

	test('1D complex field reduces to complex derivative', () => {
		const field = ([z]) => [cExp(cMul(c(1, 2), z))]
		const pt = [c(0.5, -0.7)]
		const expected = cMul(c(1, 2), cExp(cMul(c(1, 2), pt[0])))

		const actual = divergenceComplexSeries(field, pt)
		assertComplexClose(actual, expected, 1e-9)
	})

	test('non-holomorphic field computes true Wirtinger divergence', () => {
		// F(z1, z2) = [conj(z1), |z2|^2] = [conj(z1), z2 * conj(z2)]
		// ∂(conj(z1))/∂z1 = 0
		// ∂(z2 * conj(z2))/∂z2 = conj(z2)
		// div(F) = conj(z2)
		const field = ([z1, z2]) => [
			cConj(z1),
			c(z2.re * z2.re + z2.im * z2.im, 0),
		]
		const pt = [c(2.5, -1.5), c(-3.2, 4.7)]
		const actual = divergenceComplexSeries(field, pt)
		assertComplexClose(actual, cConj(pt[1]), 1e-10)
	})

	test('respects custom step size options.h', () => {
		const field = ([z1, z2]) => [cExp(z1), cSin(z2)]
		const pt = [c(0.3, 0.4), c(-0.6, 0.2)]
		const expected = cAdd(cExp(pt[0]), cCos(pt[1]))

		const actual = divergenceComplexSeries(field, pt, { h: 1e-3 })
		assertComplexClose(actual, expected, 1e-10)
	})
})

describe('divergenceComplexSeries - edge cases', () => {
	test('constant field has zero divergence', () => {
		const field = () => [c(42, -17), c(0, 3.14), c(-1, 2)]
		const actual = divergenceComplexSeries(field, [c(1, 2), c(3, 4), c(5, 6)])
		assert.deepStrictEqual(actual, { re: 0, im: 0 })
	})

	test('divergence-free (solenoidal) 2D and 3D fields return ~0', () => {
		// 2D Hamiltonian/solenoidal field: F = [z1*z2^2, -(1/3)*z2^3 + z1^3]
		// dF1/dz1 = z2^2, dF2/dz2 = -z2^2 -> div = 0
		const field2D = ([z1, z2]) => [
			cMul(z1, cPow(z2, 2)),
			cAdd(cScale(cPow(z2, 3), -1 / 3), cPow(z1, 3)),
		]
		assertComplexClose(
			divergenceComplexSeries(field2D, [c(1.3, -0.8), c(-0.9, 1.4)]),
			c(0, 0),
			1e-10
		)

		// 3D curl of G(z) = [z2*z3^2, z3*exp(z1), z1^2*sin(z2)]:
		// F = curl(G) = [dG3/dz2 - dG2/dz3, dG1/dz3 - dG3/dz1, dG2/dz1 - dG1/dz2]
		//             = [z1^2*cos(z2) - exp(z1), 2*z2*z3 - 2*z1*sin(z2), z3*exp(z1) - z3^2]
		// div(curl(G)) === 0 identically
		const curlField3D = ([z1, z2, z3]) => [
			cSub(cMul(cPow(z1, 2), cCos(z2)), cExp(z1)),
			cSub(cScale(cMul(z2, z3), 2), cScale(cMul(z1, cSin(z2)), 2)),
			cSub(cMul(z3, cExp(z1)), cPow(z3, 2)),
		]
		assertComplexClose(
			divergenceComplexSeries(curlField3D, [c(0.4, -0.5), c(0.7, 0.3), c(-0.2, 0.9)]),
			c(0, 0),
			1e-9
		)
	})

	test('does not mutate the input point array or its elements', () => {
		const p0 = { re: 1, im: -2 }
		const p1 = { re: 3, im: 4 }
		const pt = [p0, p1]
		const field = (z) => {
			// Mutate argument defensively to verify caller point is isolated
			z[0].re += 999
			return [cMul(c(2, 0), z[0]), cMul(c(3, 0), z[1])]
		}
		divergenceComplexSeries(field, pt)
		assert.deepStrictEqual(pt, [{ re: 1, im: -2 }, { re: 3, im: 4 }])
		assert.deepStrictEqual(p0, { re: 1, im: -2 })
		assert.deepStrictEqual(p1, { re: 3, im: 4 })
	})

	test('throws on invalid inputs', () => {
		const validField = (z) => z
		const validPoint = [c(1, 0)]

		// Invalid field
		assert.throws(() => divergenceComplexSeries(null, validPoint), TypeError)
		assert.throws(() => divergenceComplexSeries(123, validPoint), TypeError)
		assert.throws(() => divergenceComplexSeries('fn', validPoint), TypeError)

		// Invalid point
		assert.throws(() => divergenceComplexSeries(validField, null), TypeError)
		assert.throws(() => divergenceComplexSeries(validField, c(1, 0)), TypeError)
		assert.throws(() => divergenceComplexSeries(validField, []), RangeError)
		assert.throws(() => divergenceComplexSeries(validField, [null]), TypeError)
		assert.throws(() => divergenceComplexSeries(validField, [1]), TypeError)
		assert.throws(() => divergenceComplexSeries(validField, [{ re: 1 }]), TypeError)
		assert.throws(() => divergenceComplexSeries(validField, [{ re: NaN, im: 0 }]), RangeError)
		assert.throws(() => divergenceComplexSeries(validField, [{ re: 0, im: Infinity }]), RangeError)
		assert.throws(() => divergenceComplexSeries(validField, [{ re: -Infinity, im: 1 }]), RangeError)

		// Invalid options / step h
		assert.throws(() => divergenceComplexSeries(validField, validPoint, null), TypeError)
		assert.throws(() => divergenceComplexSeries(validField, validPoint, []), TypeError)
		assert.throws(() => divergenceComplexSeries(validField, validPoint, 1e-4), TypeError)
		assert.throws(() => divergenceComplexSeries(validField, validPoint, { h: 0 }), RangeError)
		assert.throws(() => divergenceComplexSeries(validField, validPoint, { h: -1e-4 }), RangeError)
		assert.throws(() => divergenceComplexSeries(validField, validPoint, { h: NaN }), RangeError)
		assert.throws(() => divergenceComplexSeries(validField, validPoint, { h: Infinity }), RangeError)
		assert.throws(() => divergenceComplexSeries(validField, validPoint, { h: '1e-4' }), TypeError)
	})

	test('throws on mismatched or invalid field output', () => {
		const pt2 = [c(1, 0), c(0, 1)]
		assert.throws(() => divergenceComplexSeries(() => 'not-an-array', pt2), TypeError)
		assert.throws(() => divergenceComplexSeries(() => [c(1, 0)], pt2), RangeError)
		assert.throws(() => divergenceComplexSeries(() => [c(1, 0), c(2, 0), c(3, 0)], pt2), RangeError)
		assert.throws(() => divergenceComplexSeries(() => [c(1, 0), null], pt2), TypeError)
		assert.throws(() => divergenceComplexSeries(() => [c(1, 0), { re: NaN, im: 0 }], pt2), RangeError)
		assert.throws(() => divergenceComplexSeries(() => [c(Infinity, 0), c(0, 0)], pt2), RangeError)
	})
})

describe('divergenceComplexSeries - cross-checks & identities', () => {
	test('cross-check against exact analytic trace of Jacobian for 3D mixed transcendental field', () => {
		// F1(z) = exp(z1 * z2) + sin(z3)
		// F2(z) = z1 * cos(z2) + z2^3 * z3
		// F3(z) = sin(z1 + z3) * z2 + z3^2 * exp(z2)
		const field = ([z1, z2, z3]) => [
			cAdd(cExp(cMul(z1, z2)), cSin(z3)),
			cAdd(cMul(z1, cCos(z2)), cMul(cPow(z2, 3), z3)),
			cAdd(cMul(cSin(cAdd(z1, z3)), z2), cMul(cPow(z3, 2), cExp(z2))),
		]

		// Analytic Jacobian diagonal entries:
		// J_11 = dF1/dz1 = z2 * exp(z1 * z2)
		// J_22 = dF2/dz2 = -z1 * sin(z2) + 3 * z2^2 * z3
		// J_33 = dF3/dz3 = cos(z1 + z3) * z2 + 2 * z3 * exp(z2)
		const analyticTrace = ([z1, z2, z3]) => {
			const j11 = cMul(z2, cExp(cMul(z1, z2)))
			const j22 = cAdd(cScale(cMul(z1, cSin(z2)), -1), cScale(cMul(cPow(z2, 2), z3), 3))
			const j33 = cAdd(cMul(cCos(cAdd(z1, z3)), z2), cScale(cMul(z3, cExp(z2)), 2))
			return cAdd(cAdd(j11, j22), j33)
		}

		const testPoints = [
			[c(0.5, -0.3), c(-0.4, 0.8), c(0.6, 0.2)],
			[c(-0.7, 0.9), c(0.3, -0.5), c(-0.2, -0.4)],
			[c(0, 0), c(1, 0), c(0, 1)],
		]

		for (const pt of testPoints) {
			assertComplexClose(
				divergenceComplexSeries(field, pt),
				analyticTrace(pt),
				1e-9,
				'analytic Jacobian trace cross-check'
			)
		}
	})

	test('product rule identity: div(f * F) = grad(f) . F + f * div(F)', () => {
		// Scalar field f(z1, z2, z3) = exp(z1) * z2 + z3^2
		// Analytic grad(f) = [exp(z1) * z2, exp(z1), 2 * z3]
		const f = ([z1, z2, z3]) => cAdd(cMul(cExp(z1), z2), cPow(z3, 2))
		const gradF = ([z1, z2, z3]) => [cMul(cExp(z1), z2), cExp(z1), cScale(z3, 2)]

		// Vector field F(z1, z2, z3) = [z1^2 * z3, sin(z2) + z1, z2 * exp(z3)]
		const F = ([z1, z2, z3]) => [
			cMul(cPow(z1, 2), z3),
			cAdd(cSin(z2), z1),
			cMul(z2, cExp(z3)),
		]

		const scaledField = (z) => {
			const s = f(z)
			return F(z).map((comp) => cMul(s, comp))
		}

		const pt = [c(0.4, -0.6), c(-0.5, 0.7), c(0.3, 0.2)]

		const lhs = divergenceComplexSeries(scaledField, pt)

		const fVal = f(pt)
		const FVal = F(pt)
		const gVal = gradF(pt)
		const divF = divergenceComplexSeries(F, pt)
		const gradDotF = gVal.reduce((acc, gk, k) => cAdd(acc, cMul(gk, FVal[k])), c(0, 0))
		const rhs = cAdd(gradDotF, cMul(fVal, divF))

		assertComplexClose(lhs, rhs, 1e-9, 'product rule identity div(f*F) = grad(f).F + f*div(F)')
	})

	test('linearity identity: div(alpha * F + beta * G) = alpha * div(F) + beta * div(G)', () => {
		const alpha = c(2.5, -1.75)
		const beta = c(-0.8, 3.1)
		const F = ([z1, z2]) => [cExp(z1), cMul(z1, cPow(z2, 2))]
		const G = ([z1, z2]) => [cSin(cMul(z1, z2)), cCos(z2)]
		const combo = (z) => {
			const fz = F(z)
			const gz = G(z)
			return fz.map((v, i) => cAdd(cMul(alpha, v), cMul(beta, gz[i])))
		}
		const pt = [c(0.6, -0.4), c(-0.3, 0.9)]

		const lhs = divergenceComplexSeries(combo, pt)
		const rhs = cAdd(
			cMul(alpha, divergenceComplexSeries(F, pt)),
			cMul(beta, divergenceComplexSeries(G, pt))
		)
		assertComplexClose(lhs, rhs, 1e-9, 'linearity identity')
	})

	test('exhibits 4th-order O(h^4) truncation convergence as h is halved', () => {
		// Use z^6 so the 5th derivative is nonzero and truncation error dominates at h=0.2, 0.1
		const field = ([z]) => [cPow(z, 6)]
		const pt = [c(1.1, -0.7)]
		const exact = cScale(cPow(pt[0], 5), 6)

		const err = (h) => {
			const got = divergenceComplexSeries(field, pt, { h })
			return Math.hypot(got.re - exact.re, got.im - exact.im)
		}

		const e1 = err(0.2)
		const e2 = err(0.1)
		const ratio = e1 / e2
		// For O(h^4), halving h reduces error by ~2^4 = 16
		assert.ok(ratio > 15 && ratio < 17, `expected 4th-order ratio ~16, got ${ratio}`)
	})
})
