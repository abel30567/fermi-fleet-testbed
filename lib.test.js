import { test } from 'node:test'
import assert from 'node:assert'
import { add, jacobianDet2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('jacobianDet2D - linear transformation matches ad - bc', () => {
	const u = (x, y) => 3 * x + 2 * y + 5
	const v = (x, y) => -4 * x + 7 * y - 1
	const det = jacobianDet2D(u, v, 1.5, -2.5)
	assert.ok(Math.abs(det - (3 * 7 - 2 * -4)) < 1e-7)
})

test('jacobianDet2D - polar to cartesian Jacobian equals r', () => {
	const u = (r, theta) => r * Math.cos(theta)
	const v = (r, theta) => r * Math.sin(theta)
	for (const [r, theta] of [
		[0, 0.5],
		[2.5, Math.PI / 4],
		[5, -1.2],
	]) {
		const det = jacobianDet2D(u, v, r, theta)
		assert.ok(Math.abs(det - r) < 1e-7, `expected ${r}, got ${det}`)
	}
})

test('jacobianDet2D - rotation preserves area (det = 1) and reflection flips orientation (det = -1)', () => {
	const angle = 0.73
	const c = Math.cos(angle)
	const s = Math.sin(angle)
	const rotU = (x, y) => c * x - s * y
	const rotV = (x, y) => s * x + c * y
	assert.ok(Math.abs(jacobianDet2D(rotU, rotV, 3, -4) - 1) < 1e-7)

	const reflU = (x, y) => y
	const reflV = (x, y) => x
	assert.ok(Math.abs(jacobianDet2D(reflU, reflV, 10, -2) - -1) < 1e-7)
})

test('jacobianDet2D - holomorphic squaring map f(z)=z^2 satisfies det(J)=4(x^2+y^2)', () => {
	const u = (x, y) => x * x - y * y
	const v = (x, y) => 2 * x * y
	const x = 1.5
	const y = -2.0
	const expected = 4 * (x * x + y * y)
	const det = jacobianDet2D(u, v, x, y)
	assert.ok(Math.abs(det - expected) < 1e-6, `expected ${expected}, got ${det}`)
})

test('jacobianDet2D - degenerate and constant maps yield 0 determinant', () => {
	const u = (x, y) => Math.sin(x + y)
	const v = (x, y) => 3 * Math.sin(x + y)
	assert.ok(Math.abs(jacobianDet2D(u, v, 0.4, 0.9)) < 1e-7)

	const constU = () => 42
	const constV = (x, y) => x * y
	assert.equal(jacobianDet2D(constU, constV, 2, 3), 0)
})

test('jacobianDet2D - custom step size h and input validation', () => {
	const u = (x, y) => Math.exp(x) * Math.cos(y)
	const v = (x, y) => Math.exp(x) * Math.sin(y)
	// Cauchy-Riemann: det(J) = exp(2x)
	const x = 0.5
	const y = 1.1
	const det = jacobianDet2D(u, v, x, y, 1e-5)
	assert.ok(Math.abs(det - Math.exp(2 * x)) < 1e-7)

	assert.throws(() => jacobianDet2D(null, v, 0, 0), TypeError)
	assert.throws(() => jacobianDet2D(u, 'not-a-fn', 0, 0), TypeError)
	assert.throws(() => jacobianDet2D(u, v, NaN, 0), RangeError)
	assert.throws(() => jacobianDet2D(u, v, 0, Infinity), RangeError)
	assert.throws(() => jacobianDet2D(u, v, 0, 0, 0), RangeError)
	assert.throws(() => jacobianDet2D(u, v, 0, 0, -1e-6), RangeError)
})
