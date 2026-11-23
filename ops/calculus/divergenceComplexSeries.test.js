import { test } from 'node:test'
import assert from 'node:assert/strict'
import { divergenceComplexSeries } from './divergenceComplexSeries.js'

// Local complex arithmetic helpers for test construction and independent cross-checks
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
const cPow = (a, n) => {
	let res = c(1, 0)
	for (let i = 0; i < n; i++) res = cMul(res, a)
	return res
}
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

function assertComplexClose(actual, expected, tol = 1e-9, message = '') {
	assert.equal(typeof actual.re, 'number', `${message} re must be number`)
	assert.equal(typeof actual.im, 'number', `${message} im must be number`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${message} expected re ~ ${expected.re}, got ${actual.re} (diff ${Math.abs(actual.re - expected.re)})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${message} expected im ~ ${expected.im}, got ${actual.im} (diff ${Math.abs(actual.im - expected.im)})`
	)
}

/**
 * Independent Wirtinger central-difference divergence:
 * dF_k / dz_k = 0.5 * (dF_k / dx_k - i * dF_k / dy_k)
 */
function wirtingerFiniteDiffDivergence(fieldFn, point, h = 1e-6) {
	let re = 0
	let im = 0
	for (let k = 0; k < point.length; k++) {
		const pxPlus = point.map((p, idx) => (idx === k ? { re: p.re + h, im: p.im } : p))
		const pxMinus = point.map((p, idx) => (idx === k ? { re: p.re - h, im: p.im } : p))
		const pyPlus = point.map((p, idx) => (idx === k ? { re: p.re, im: p.im + h } : p))
		const pyMinus = point.map((p, idx) => (idx === k ? { re: p.re, im: p.im - h } : p))

		const dfdx = cDiv(cSub(fieldFn(pxPlus)[k], fieldFn(pxMinus)[k]), c(2 * h, 0))
		const dfdy = cDiv(cSub(fieldFn(pyPlus)[k], fieldFn(pyMinus)[k]), c(2 * h, 0))
		const dfdz = cMul(c(0.5, 0), cSub(dfdx, cMul(c(0, 1), dfdy)))
		re += dfdz.re
		im += dfdz.im
	}
	return { re, im }
}

test('constant complex vector field has zero divergence', () => {
	const field = () => [c(5, -3), c(-2, 7), c(100, 200)]
	const res = divergenceComplexSeries(field, [c(1, 2), c(-3, 4), c(0, -1)])
	assertComplexClose(res, c(0, 0), 1e-12)
})

test('radial identity field F(z) = z in C^n has divergence n', () => {
	for (const dim of [1, 2, 3, 5]) {
		const point = Array.from({ length: dim }, (_, k) => c(k - 1.5, 0.5 * k + 0.25))
		const res = divergenceComplexSeries((z) => z, point)
		assertComplexClose(res, c(dim, 0), 1e-11, `dim=${dim}`)
	}
})

test('linear field F(z) = A*z has divergence equal to complex trace tr(A)', () => {
	const A = [
		[c(2, 1), c(-1, 3), c(0.5, -0.5)],
		[c(4, -2), c(-3, 2.5), c(1, 1)],
		[c(0, 2), c(-1, -1), c(1.5, -4)],
	]
	const field = (z) =>
		A.map((row) =>
			row.reduce((acc, aij, j) => cAdd(acc, cMul(aij, z[j])), c(0, 0))
		)
	const expectedTrace = cAdd(cAdd(A[0][0], A[1][1]), A[2][2]) // (0.5, -0.5)
	const res = divergenceComplexSeries(field, [c(1, -2), c(3, 0.5), c(-1.5, 2)])
	assertComplexClose(res, expectedTrace, 1e-10)
})

test('holomorphic polynomial and transcendental vector field matches closed-form derivative', () => {
	// F0 = e^{z0} * z1, F1 = sin(z1) + z0^2, F2 = cos(z2) * z0 + z2^4
	// div F = e^{z0} * z1 + cos(z1) - sin(z2) * z0 + 4 * z2^3
	const field = ([z0, z1, z2]) => [
		cMul(cExp(z0), z1),
		cAdd(cSin(z1), cPow(z0, 2)),
		cAdd(cMul(cCos(z2), z0), cPow(z2, 4)),
	]
	const pt = [c(0.5, -0.7), c(-1.1, 0.4), c(0.8, 0.9)]
	const expected = cAdd(
		cAdd(cMul(cExp(pt[0]), pt[1]), cCos(pt[1])),
		cAdd(
			cSub(c(0, 0), cMul(cSin(pt[2]), pt[0])),
			cMul(c(4, 0), cPow(pt[2], 3))
		)
	)

	const res = divergenceComplexSeries(field, pt)
	assertComplexClose(res, expected, 1e-10)
})

test('supports array of component functions matching vector-function form', () => {
	const components = [
		([z0, z1]) => cMul(cPow(z0, 3), z1),
		([z0, z1]) => cAdd(cExp(z1), z0),
	]
	const vectorFn = (z) => components.map((fn) => fn(z))
	const pt = [c(1.2, -0.5), c(-0.3, 1.4)]

	const resArray = divergenceComplexSeries(components, pt)
	const resFn = divergenceComplexSeries(vectorFn, pt)

	// Analytic: 3 * z0^2 * z1 + e^{z1}
	const expected = cAdd(cMul(c(3, 0), cMul(cPow(pt[0], 2), pt[1])), cExp(pt[1]))
	assertComplexClose(resArray, expected, 1e-10)
	assertComplexClose(resArray, resFn, 1e-14)
})

test('rational vector field with poles away from evaluation point', () => {
	// F0 = 1 / z0, F1 = 1 / (z1 - i)
	// div F = -1 / z0^2 - 1 / (z1 - i)^2
	const field = ([z0, z1]) => [
		cDiv(c(1, 0), z0),
		cDiv(c(1, 0), cSub(z1, c(0, 1))),
	]
	const pt = [c(2, 1), c(-1, 3)]
	const expected = cSub(
		cSub(c(0, 0), cDiv(c(1, 0), cPow(pt[0], 2))),
		cDiv(c(1, 0), cPow(cSub(pt[1], c(0, 1)), 2))
	)
	const res = divergenceComplexSeries(field, pt)
	assertComplexClose(res, expected, 1e-10)
})

test('handles 1D complex function and evaluation at the origin', () => {
	// F(z) = z^5 + 2i * z + 7  => F'(0) = 2i
	const field = ([z]) => [cAdd(cAdd(cPow(z, 5), cMul(c(0, 2), z)), c(7, 0))]
	const res = divergenceComplexSeries(field, [c(0, 0)])
	assertComplexClose(res, c(0, 2), 1e-11)
})

test('handles large-magnitude coordinates via adaptive default radius', () => {
	// F(z0, z1) = [z0^2, z1^2] => div F = 2*z0 + 2*z1
	const field = ([z0, z1]) => [cPow(z0, 2), cPow(z1, 2)]
	const pt = [c(1e4, -2e4), c(-5e3, 3e3)]
	const expected = cMul(c(2, 0), cAdd(pt[0], pt[1]))
	const res = divergenceComplexSeries(field, pt)
	assertComplexClose(res, expected, 1e-6)
})

test('non-holomorphic field yields Wirtinger divergence', () => {
	// F0 = conj(z0) => dF0/dz0 = 0
	// F1 = |z1|^2 = z1 * conj(z1) => dF1/dz1 = conj(z1)
	const field = ([z0, z1]) => [cConj(z0), cMul(z1, cConj(z1))]
	const pt = [c(2, -3), c(4, 5)]
	const res = divergenceComplexSeries(field, pt)
	assertComplexClose(res, cConj(pt[1]), 1e-10)
})

test('independent cross-check: matches Wirtinger finite-difference divergence', () => {
	const field = ([z0, z1, z2]) => [
		cMul(cSin(z0), cExp(z1)),
		cDiv(cPow(z1, 2), cAdd(z2, c(3, 1))),
		cMul(z0, cCos(cMul(z1, z2))),
	]
	const pt = [c(0.4, 0.6), c(-0.5, 0.3), c(0.7, -0.2)]

	const seriesRes = divergenceComplexSeries(field, pt)
	const fdRes = wirtingerFiniteDiffDivergence(field, pt, 1e-6)
	assertComplexClose(seriesRes, fdRes, 1e-7)
})

test('independent cross-check: vector calculus identities (div(curl A) = 0, linearity, product rule)', () => {
	// 1. div(curl(A)) = 0 for A = (z1 * e^{z2}, z2 * sin(z0), z0^2 * z1)
	// curl(A) = (dA2/dz1 - dA1/dz2, dA0/dz2 - dA2/dz0, dA1/dz0 - dA0/dz1)
	//         = (z0^2 - sin(z0), z1 * e^{z2} - 2 * z0 * z1, z2 * cos(z0) - e^{z2})
	const curlA = ([z0, z1, z2]) => [
		cSub(cPow(z0, 2), cSin(z0)),
		cSub(cMul(z1, cExp(z2)), cMul(c(2, 0), cMul(z0, z1))),
		cSub(cMul(z2, cCos(z0)), cExp(z2)),
	]
	const pt3 = [c(0.6, -0.4), c(-0.8, 1.1), c(0.3, 0.5)]
	assertComplexClose(divergenceComplexSeries(curlA, pt3), c(0, 0), 1e-10, 'div(curl A)')

	// 2. Linearity: div(alpha * F + beta * G) = alpha * div(F) + beta * div(G)
	const F = ([z0, z1]) => [cExp(z0), cMul(z0, cPow(z1, 2))]
	const G = ([z0, z1]) => [cSin(cAdd(z0, z1)), cCos(z1)]
	const alpha = c(2, -1.5)
	const beta = c(-0.5, 3)
	const combo = (z) => {
		const fv = F(z)
		const gv = G(z)
		return fv.map((fvk, k) => cAdd(cMul(alpha, fvk), cMul(beta, gv[k])))
	}
	const pt2 = [c(0.7, 0.2), c(-0.4, 0.9)]
	const lhs = divergenceComplexSeries(combo, pt2)
	const rhs = cAdd(
		cMul(alpha, divergenceComplexSeries(F, pt2)),
		cMul(beta, divergenceComplexSeries(G, pt2))
	)
	assertComplexClose(lhs, rhs, 1e-10, 'linearity')

	// 3. Product rule: div(g * F) = grad(g) . F + g * div(F)
	// g(z0, z1) = z0^2 * z1 + e^{z1}, grad(g) = (2 * z0 * z1, z0^2 + e^{z1})
	const g = ([z0, z1]) => cAdd(cMul(cPow(z0, 2), z1), cExp(z1))
	const gradG = ([z0, z1]) => [cMul(c(2, 0), cMul(z0, z1)), cAdd(cPow(z0, 2), cExp(z1))]
	const gF = (z) => {
		const gv = g(z)
		return F(z).map((fk) => cMul(gv, fk))
	}
	const divGF = divergenceComplexSeries(gF, pt2)
	const fAtPt = F(pt2)
	const gradAtPt = gradG(pt2)
	const dot = cAdd(cMul(gradAtPt[0], fAtPt[0]), cMul(gradAtPt[1], fAtPt[1]))
	const expectedProductRule = cAdd(dot, cMul(g(pt2), divergenceComplexSeries(F, pt2)))
	assertComplexClose(divGF, expectedProductRule, 1e-10, 'product rule')
})

test('supports custom options and does not mutate input point', () => {
	const field = ([z0, z1]) => [cExp(z0), cSin(z1)]
	const pt = [c(0.5, -0.5), c(1.0, 0.25)]
	const snapshot = JSON.stringify(pt)

	const res = divergenceComplexSeries(field, pt, { radius: 1e-3, terms: 24 })
	const expected = cAdd(cExp(pt[0]), cCos(pt[1]))
	assertComplexClose(res, expected, 1e-12)
	assert.equal(JSON.stringify(pt), snapshot)
})

test('validates inputs and throws clear errors on invalid arguments', () => {
	const validPt = [c(1, 0), c(0, 1)]
	const validField = (z) => z

	assert.throws(() => divergenceComplexSeries(null, validPt), TypeError)
	assert.throws(() => divergenceComplexSeries(123, validPt), TypeError)
	assert.throws(() => divergenceComplexSeries([validField], validPt), RangeError)
	assert.throws(() => divergenceComplexSeries([() => c(0, 0), 'bad'], validPt), TypeError)

	assert.throws(() => divergenceComplexSeries(validField, []), TypeError)
	assert.throws(() => divergenceComplexSeries(validField, null), TypeError)
	assert.throws(() => divergenceComplexSeries(validField, [{ re: NaN, im: 0 }]), RangeError)
	assert.throws(() => divergenceComplexSeries(validField, [{ re: 1, im: Infinity }]), RangeError)
	assert.throws(() => divergenceComplexSeries(validField, [42]), TypeError)

	assert.throws(() => divergenceComplexSeries(validField, validPt, null), TypeError)
	assert.throws(() => divergenceComplexSeries(validField, validPt, { radius: 0 }), RangeError)
	assert.throws(() => divergenceComplexSeries(validField, validPt, { radius: -1e-4 }), RangeError)
	assert.throws(() => divergenceComplexSeries(validField, validPt, { radius: NaN }), RangeError)
	assert.throws(() => divergenceComplexSeries(validField, validPt, { terms: 2 }), RangeError)
	assert.throws(() => divergenceComplexSeries(validField, validPt, { terms: 4.5 }), RangeError)

	assert.throws(
		() => divergenceComplexSeries(() => [c(1, 0)], validPt),
		RangeError
	)
	assert.throws(
		() => divergenceComplexSeries(() => [c(NaN, 0), c(0, 0)], validPt),
		RangeError
	)
})
