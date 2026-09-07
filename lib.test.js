import { test } from 'node:test'
import assert from 'node:assert'
import { add, polarJacobian } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('polarJacobian: matches spec example', () => {
	assert.equal(polarJacobian(3), 3)
})

test('polarJacobian: closed form is identity in r', () => {
	assert.equal(polarJacobian(1), 1)
	assert.equal(polarJacobian(0), 0)
	assert.equal(polarJacobian(10), 10)
})

test('polarJacobian: handles non-integer r', () => {
	assert.ok(Math.abs(polarJacobian(2.5) - 2.5) < 1e-9)
})

test('polarJacobian: handles negative r', () => {
	assert.ok(Math.abs(polarJacobian(-4) - -4) < 1e-9)
})

test('polarJacobian: agrees with a manual finite-difference Jacobian at several r', () => {
	const theta = 1.1
	const h = 1e-6
	const x = (r, t) => r * Math.cos(t)
	const y = (r, t) => r * Math.sin(t)

	for (const r of [0.5, 1, 3, 7.25]) {
		const dxdr = (x(r + h, theta) - x(r - h, theta)) / (2 * h)
		const dydr = (y(r + h, theta) - y(r - h, theta)) / (2 * h)
		const dxdt = (x(r, theta + h) - x(r, theta - h)) / (2 * h)
		const dydt = (y(r, theta + h) - y(r, theta - h)) / (2 * h)
		const numericJacobian = dxdr * dydt - dydr * dxdt

		assert.ok(Math.abs(polarJacobian(r) - numericJacobian) < 1e-3)
	}
})
