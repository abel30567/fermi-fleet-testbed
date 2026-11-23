import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { curlComplexIterative } from './curlComplexIterative.js'

// Local complex arithmetic helpers for test construction and analytical verification
const c = (re, im = 0) => ({ re, im })
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im })
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im })
const cMul = (a, b) => ({
	re: a.re * b.re - a.im * b.im,
	im: a.re * b.im + a.im * b.re,
})
const cScale = (a, s) => ({ re: a.re * s, im: a.im * s })
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

function assertComplexClose(actual, expected, tol = 1e-6, label = '') {
	const prefix = label ? `${label}: ` : ''
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${prefix}re mismatch: expected ${expected.re}, got ${actual.re} (diff=${Math.abs(actual.re - expected.re)}, tol=${tol})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${prefix}im mismatch: expected ${expected.im}, got ${actual.im} (diff=${Math.abs(actual.im - expected.im)}, tol=${tol})`,
	)
}

function assertVec3Close(actual, expected, tol = 1e-6) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assertComplexClose(actual[i], expected[i], tol, `component[${i}]`)
	}
}

describe('curlComplexIterative — normal cases', () => {
	test('constant complex vector field has zero curl', () => {
		const field = () => [c(3, -2), c(-5, 7), c(0.5, 1.25)]
		const result = curlComplexIterative(field, [c(1, 2), c(-3, 4), c(5, -6)])
		assertVec3Close(result, [c(0, 0), c(0, 0), c(0, 0)], 1e-12)
	})

	test('linear rotational field F(x, y, z) = alpha * (-y, x, 0)', () => {
		const alpha = c(2, -3)
		const field = ([x, y]) => [
			cMul(alpha, cScale(y, -1)),
			cMul(alpha, x),
			c(0, 0),
		]
		const point = [c(1.5, -0.5), c(-2, 4), c(0.25, 3)]
		const result = curlComplexIterative(field, point)
		assertVec3Close(result, [c(0, 0), c(0, 0), cScale(alpha, 2)], 1e-8)
	})

	test('general linear complex field F = A * p matches analytical curl', () => {
		// Fx = (1+i)x + (2-i)y + (3+2i)z
		// Fy = (-1+2i)x + (4)y + (1-3i)z
		// Fz = (2+i)x + (-2+4i)y + (5-i)z
		// curl_x = dFz/dy - dFy/dz = (-2+4i) - (1-3i) = -3 + 7i
		// curl_y = dFx/dz - dFz/dx = (3+2i) - (2+i) = 1 + i
		// curl_z = dFy/dx - dFx/dy = (-1+2i) - (2-i) = -3 + 3i
		const field = ([x, y, z]) => [
			cAdd(cAdd(cMul(c(1, 1), x), cMul(c(2, -1), y)), cMul(c(3, 2), z)),
			cAdd(cAdd(cMul(c(-1, 2), x), cMul(c(4, 0), y)), cMul(c(1, -3), z)),
			cAdd(cAdd(cMul(c(2, 1), x), cMul(c(-2, 4), y)), cMul(c(5, -1), z)),
		]
		const result = curlComplexIterative(field, [c(0.5, -1), c(2, 0.25), c(-1.5, 3)])
		assertVec3Close(result, [c(-3, 7), c(1, 1), c(-3, 3)], 1e-8)
	})

	test('polynomial holomorphic complex field at complex point matches analytical curl', () => {
		// Fx = x*y^2 + i*z^2
		// Fy = y*z^2 + i*x^2
		// Fz = z*x^2 + i*y^2
		// curl_x = 2*i*y - 2*y*z
		// curl_y = 2*i*z - 2*z*x
		// curl_z = 2*i*x - 2*x*y
		const I = c(0, 1)
		const field = ([x, y, z]) => [
			cAdd(cMul(x, cMul(y, y)), cMul(I, cMul(z, z))),
			cAdd(cMul(y, cMul(z, z)), cMul(I, cMul(x, x))),
			cAdd(cMul(z, cMul(x, x)), cMul(I, cMul(y, y))),
		]
		const [x, y, z] = [c(1, 2), c(-3, 1), c(2, -1)]
		const expected = [
			cSub(cMul(c(0, 2), y), cScale(cMul(y, z), 2)),
			cSub(cMul(c(0, 2), z), cScale(cMul(z, x), 2)),
			cSub(cMul(c(0, 2), x), cScale(cMul(x, y), 2)),
		]
		const result = curlComplexIterative(field, [x, y, z])
		assertVec3Close(result, expected, 1e-7)
	})

	test('transcendental holomorphic field matches analytical curl', () => {
		// Fx = sin(z) + i * exp(y)
		// Fy = cos(x) + i * z^3
		// Fz = exp(x*y) + i * sin(x)
		// curl_x = x * exp(x*y) - 3i * z^2
		// curl_y = cos(z) - (y * exp(x*y) + i * cos(x))
		// curl_z = -sin(x) - i * exp(y)
		const I = c(0, 1)
		const field = ([x, y, z]) => [
			cAdd(cSin(z), cMul(I, cExp(y))),
			cAdd(cCos(x), cMul(I, cMul(z, cMul(z, z)))),
			cAdd(cExp(cMul(x, y)), cMul(I, cSin(x))),
		]
		const [x, y, z] = [c(0.4, -0.3), c(-0.2, 0.5), c(0.6, 0.1)]
		const expXY = cExp(cMul(x, y))
		const expected = [
			cSub(cMul(x, expXY), cMul(c(0, 3), cMul(z, z))),
			cSub(cCos(z), cAdd(cMul(y, expXY), cMul(I, cCos(x)))),
			cSub(cScale(cSin(x), -1), cMul(I, cExp(y))),
		]
		const result = curlComplexIterative(field, [x, y, z])
		assertVec3Close(result, expected, 1e-7)
	})

	test('respects custom step size h and does not mutate input point', () => {
		const field = ([x, y, z]) => [
			cMul(y, z),
			cMul(z, cMul(x, x)),
			cMul(x, cMul(y, y)),
		]
		const point = [c(1, 0.5), c(-0.5, 1), c(2, -0.25)]
		const snapshot = structuredClone(point)

		const r1 = curlComplexIterative(field, point, 1e-5)
		const r2 = curlComplexIterative(field, point, 1e-7)

		assert.deepEqual(point, snapshot)
		assertVec3Close(r1, r2, 1e-6)
	})
})

describe('curlComplexIterative — edge cases & input validation', () => {
	test('handles origin point (0, 0, 0) without producing -0', () => {
		const field = ([x, y, z]) => [
			cMul(x, x),
			cMul(y, y),
			cMul(z, z),
		]
		const result = curlComplexIterative(field, [c(0, 0), c(0, 0), c(0, 0)])
		for (const comp of result) {
			assert.ok(Object.is(comp.re, 0))
			assert.ok(Object.is(comp.im, 0))
		}
	})

	test('rejects invalid field argument', () => {
		const pt = [c(0), c(0), c(0)]
		assert.throws(() => curlComplexIterative(null, pt), TypeError)
		assert.throws(() => curlComplexIterative(undefined, pt), TypeError)
		assert.throws(() => curlComplexIterative('not a fn', pt), TypeError)
		assert.throws(() => curlComplexIterative({}, pt), TypeError)
	})

	test('rejects invalid point argument', () => {
		const zero = () => [c(0), c(0), c(0)]
		assert.throws(() => curlComplexIterative(zero, null), TypeError)
		assert.throws(() => curlComplexIterative(zero, 'abc'), TypeError)
		assert.throws(() => curlComplexIterative(zero, [c(0), c(0)]), RangeError)
		assert.throws(() => curlComplexIterative(zero, [c(0), c(0), c(0), c(0)]), RangeError)
		assert.throws(() => curlComplexIterative(zero, [1, 2, 3]), TypeError)
		assert.throws(() => curlComplexIterative(zero, [c(0), null, c(0)]), TypeError)
		assert.throws(() => curlComplexIterative(zero, [c(0), { re: '0', im: 0 }, c(0)]), TypeError)
		assert.throws(() => curlComplexIterative(zero, [c(0), { re: 1 }, c(0)]), TypeError)
		assert.throws(() => curlComplexIterative(zero, [c(NaN, 0), c(0), c(0)]), RangeError)
		assert.throws(() => curlComplexIterative(zero, [c(0), c(0, Infinity), c(0)]), RangeError)
		assert.throws(() => curlComplexIterative(zero, [c(0), c(0), c(-Infinity, 0)]), RangeError)
	})

	test('rejects invalid step size h', () => {
		const zero = () => [c(0), c(0), c(0)]
		const pt = [c(0), c(0), c(0)]
		assert.throws(() => curlComplexIterative(zero, pt, '1e-6'), TypeError)
		assert.throws(() => curlComplexIterative(zero, pt, null), TypeError)
		assert.throws(() => curlComplexIterative(zero, pt, 0), RangeError)
		assert.throws(() => curlComplexIterative(zero, pt, -1e-6), RangeError)
		assert.throws(() => curlComplexIterative(zero, pt, NaN), RangeError)
		assert.throws(() => curlComplexIterative(zero, pt, Infinity), RangeError)
	})

	test('rejects invalid field return values', () => {
		const pt = [c(0), c(0), c(0)]
		assert.throws(() => curlComplexIterative(() => null, pt), TypeError)
		assert.throws(() => curlComplexIterative(() => [c(0), c(0)], pt), RangeError)
		assert.throws(() => curlComplexIterative(() => [c(0), 'bad', c(0)], pt), TypeError)
		assert.throws(() => curlComplexIterative(() => [c(NaN), c(0), c(0)], pt), RangeError)
		assert.throws(() => curlComplexIterative(() => [c(0), c(0, Infinity), c(0)], pt), RangeError)
	})

	test('rejects overflow when perturbing extreme coordinates', () => {
		const zero = () => [c(0), c(0), c(0)]
		assert.throws(
			() => curlComplexIterative(zero, [c(Number.MAX_VALUE, 0), c(0), c(0)], Number.MAX_VALUE),
			RangeError,
		)
	})
})

describe('curlComplexIterative — independent cross-checks', () => {
	test('cross-check: curl of gradient is identically zero (∇ × ∇φ = 0)', () => {
		// Complex scalar potential φ(x, y, z) = x^2 * y * z + i * (x^3 + y^2 * z - z^3)
		// ∇φ = [ 2xyz + i*3x^2, x^2*z + i*2yz, x^2*y + i*(y^2 - 3z^2) ]
		const I = c(0, 1)
		const gradPhi = ([x, y, z]) => [
			cAdd(cScale(cMul(x, cMul(y, z)), 2), cMul(I, cScale(cMul(x, x), 3))),
			cAdd(cMul(cMul(x, x), z), cMul(I, cScale(cMul(y, z), 2))),
			cAdd(cMul(cMul(x, x), y), cMul(I, cSub(cMul(y, y), cScale(cMul(z, z), 3)))),
		]
		const point = [c(1.2, -0.7), c(-0.8, 1.4), c(0.5, 0.9)]
		const result = curlComplexIterative(gradPhi, point)
		assertVec3Close(result, [c(0, 0), c(0, 0), c(0, 0)], 1e-7)
	})

	test('cross-check: divergence of curl is zero (∇ · (∇ × F) = 0)', () => {
		const I = c(0, 1)
		const field = ([x, y, z]) => [
			cAdd(cMul(cSin(y), z), cMul(I, cExp(cMul(x, z)))),
			cAdd(cMul(cCos(z), x), cMul(I, cMul(y, cMul(y, x)))),
			cAdd(cMul(x, cMul(y, z)), cMul(I, cSin(cAdd(x, y)))),
		]

		const hDiv = 1e-4
		const point = [c(0.7, -0.2), c(-0.5, 0.3), c(0.4, -0.6)]

		// Independent numerical divergence of curlComplexIterative
		let div = c(0, 0)
		for (let axis = 0; axis < 3; axis++) {
			const pPlus = point.map((p, k) => (k === axis ? c(p.re + hDiv, p.im) : c(p.re, p.im)))
			const pMinus = point.map((p, k) => (k === axis ? c(p.re - hDiv, p.im) : c(p.re, p.im)))
			const cPlus = curlComplexIterative(field, pPlus, 1e-5)[axis]
			const cMinus = curlComplexIterative(field, pMinus, 1e-5)[axis]
			div = cAdd(div, cScale(cSub(cPlus, cMinus), 1 / (2 * hDiv)))
		}
		assertComplexClose(div, c(0, 0), 1e-5, 'div(curl(F))')
	})

	test('cross-check: real/imaginary split matches independent real-valued 3D curl on R^3', () => {
		const uField = (x, y, z) => [
			Math.sin(y * z) + x * y,
			Math.cos(x * z) - y * z,
			Math.exp(0.2 * x * y) + z * x,
		]
		const vField = (x, y, z) => [
			x * x * z - Math.cos(y),
			Math.sin(x + z) + y * y,
			x * y * z - Math.sin(z),
		]
		const complexField = ([x, y, z]) => {
			const u = uField(x.re, y.re, z.re)
			const v = vField(x.re, y.re, z.re)
			return [c(u[0], v[0]), c(u[1], v[1]), c(u[2], v[2])]
		}

		// Independent 4th-order Richardson-extrapolated real curl
		const realPartial = (f, x, y, z, axis, comp, h = 1e-4) => {
			const evalAt = (delta) => {
				const args = [x, y, z]
				args[axis] += delta
				return f(args[0], args[1], args[2])[comp]
			}
			const d1 = (evalAt(h) - evalAt(-h)) / (2 * h)
			const d2 = (evalAt(h / 2) - evalAt(-h / 2)) / h
			return (4 * d2 - d1) / 3
		}
		const realCurl = (f, x, y, z) => [
			realPartial(f, x, y, z, 1, 2) - realPartial(f, x, y, z, 2, 1),
			realPartial(f, x, y, z, 2, 0) - realPartial(f, x, y, z, 0, 2),
			realPartial(f, x, y, z, 0, 1) - realPartial(f, x, y, z, 1, 0),
		]

		const [x0, y0, z0] = [0.8, -1.1, 0.6]
		const curlU = realCurl(uField, x0, y0, z0)
		const curlV = realCurl(vField, x0, y0, z0)
		const expected = [c(curlU[0], curlV[0]), c(curlU[1], curlV[1]), c(curlU[2], curlV[2])]

		const actual = curlComplexIterative(complexField, [c(x0, 0), c(y0, 0), c(z0, 0)])
		assertVec3Close(actual, expected, 1e-7)
	})

	test('cross-check: imaginary-axis differentiation matches real-axis differentiation for holomorphic field (Cauchy-Riemann)', () => {
		const I = c(0, 1)
		const field = ([x, y, z]) => [
			cAdd(cExp(cMul(y, z)), cMul(I, cCos(x))),
			cAdd(cSin(cMul(x, z)), cMul(I, cMul(y, z))),
			cAdd(cMul(x, cExp(y)), cMul(I, cSin(z))),
		]
		const point = [c(0.3, -0.4), c(-0.5, 0.2), c(0.6, 0.3)]

		// Independent curl computed by perturbing ONLY imaginary parts:
		// ∂F/∂z ≈ (F(p + i*h*e_j) - F(p - i*h*e_j)) / (2*i*h)
		// Dividing (a + b*i) by (2*i*h) yields (b / (2h)) + (-a / (2h))*i.
		const h = 1e-6
		const dImag = (comp, axis) => {
			const pPlus = point.map((p, k) => (k === axis ? c(p.re, p.im + h) : c(p.re, p.im)))
			const pMinus = point.map((p, k) => (k === axis ? c(p.re, p.im - h) : c(p.re, p.im)))
			const diff = cSub(field(pPlus)[comp], field(pMinus)[comp])
			return c(diff.im / (2 * h), -diff.re / (2 * h))
		}
		const imagAxisCurl = [
			cSub(dImag(2, 1), dImag(1, 2)),
			cSub(dImag(0, 2), dImag(2, 0)),
			cSub(dImag(1, 0), dImag(0, 1)),
		]

		const actual = curlComplexIterative(field, point, h)
		assertVec3Close(actual, imagAxisCurl, 1e-7)
	})

	test('cross-check: linearity ∇ × (αF + βG) = α(∇ × F) + β(∇ × G)', () => {
		const alpha = c(1.5, -2.25)
		const beta = c(-0.75, 3.1)
		const F = ([x, y, z]) => [cMul(y, z), cExp(x), cSin(y)]
		const G = ([x, y, z]) => [cCos(z), cMul(x, z), cMul(x, y)]
		const combined = (p) => {
			const f = F(p)
			const g = G(p)
			return [
				cAdd(cMul(alpha, f[0]), cMul(beta, g[0])),
				cAdd(cMul(alpha, f[1]), cMul(beta, g[1])),
				cAdd(cMul(alpha, f[2]), cMul(beta, g[2])),
			]
		}
		const point = [c(0.5, 0.2), c(-0.4, 0.7), c(0.9, -0.3)]

		const curlF = curlComplexIterative(F, point)
		const curlG = curlComplexIterative(G, point)
		const expected = [0, 1, 2].map((i) => cAdd(cMul(alpha, curlF[i]), cMul(beta, curlG[i])))
		const actual = curlComplexIterative(combined, point)

		assertVec3Close(actual, expected, 1e-7)
	})
})
