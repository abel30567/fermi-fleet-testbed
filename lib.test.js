import { test } from 'node:test'
import assert from 'node:assert'
import { add, curl2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('curl2D of constant field is zero', () => {
	const fx = () => 7
	const fy = () => -3
	assert.ok(Math.abs(curl2D(fx, fy, 1.5, -2.5)) < 1e-12)
})

test('curl2D of rigid rotation field (-y, x) is 2 everywhere', () => {
	const fx = (x, y) => -y
	const fy = (x, y) => x
	assert.ok(Math.abs(curl2D(fx, fy, 0, 0) - 2) < 1e-9)
	assert.ok(Math.abs(curl2D(fx, fy, 3.5, -2.1) - 2) < 1e-8)
})

test('curl2D of conservative gradient field is zero (curl(grad(phi)) = 0)', () => {
	// phi(x, y) = x^2 * y + sin(x * y)
	const fx = (x, y) => 2 * x * y + y * Math.cos(x * y)
	const fy = (x, y) => x * x + x * Math.cos(x * y)
	assert.ok(Math.abs(curl2D(fx, fy, 1.2, 0.7)) < 1e-7)
	assert.ok(Math.abs(curl2D(fx, fy, -2.3, 1.4)) < 1e-7)
})

test('curl2D matches analytical derivative for nonlinear polynomial field', () => {
	// F(x, y) = (x * y^2, x^2 * y^3) => curl = 2*x*y^3 - 2*x*y
	const fx = (x, y) => x * y * y
	const fy = (x, y) => x * x * y * y * y
	const expected1 = 2 * 2 * 27 - 2 * 2 * 3 // 96
	const expected2 = 2 * -1.5 * 8 - 2 * -1.5 * 2 // -18
	assert.ok(Math.abs(curl2D(fx, fy, 2, 3) - expected1) < 1e-5)
	assert.ok(Math.abs(curl2D(fx, fy, -1.5, 2) - expected2) < 1e-6)
})

test('curl2D satisfies linearity identity curl(aF + bG) = a*curl(F) + b*curl(G)', () => {
	const fx1 = (x, y) => Math.sin(y) + x
	const fy1 = (x, y) => Math.cos(x) - y
	const fx2 = (x, y) => Math.exp(x) * y
	const fy2 = (x, y) => x * Math.exp(y)
	const a = 2.5
	const b = -1.75
	const x = 0.6
	const y = -0.4

	const combined = curl2D(
		(u, v) => a * fx1(u, v) + b * fx2(u, v),
		(u, v) => a * fy1(u, v) + b * fy2(u, v),
		x,
		y
	)
	const linear = a * curl2D(fx1, fy1, x, y) + b * curl2D(fx2, fy2, x, y)
	assert.ok(Math.abs(combined - linear) < 1e-7)
})

test('curl2D works with custom step size h on trigonometric field', () => {
	const fx = (x, y) => Math.sin(y)
	const fy = (x, y) => Math.cos(x)
	const x = 0.8
	const y = -1.1
	const expected = -Math.sin(x) - Math.cos(y)
	assert.ok(Math.abs(curl2D(fx, fy, x, y, 1e-5) - expected) < 1e-8)
})

test('curl2D validates invalid arguments', () => {
	const id = (x, y) => x + y
	assert.throws(() => curl2D(null, id, 0, 0), TypeError)
	assert.throws(() => curl2D(id, 42, 0, 0), TypeError)
	assert.throws(() => curl2D(id, id, NaN, 0), RangeError)
	assert.throws(() => curl2D(id, id, 0, Infinity), RangeError)
	assert.throws(() => curl2D(id, id, 0, 0, 0), RangeError)
	assert.throws(() => curl2D(id, id, 0, 0, -1e-6), RangeError)
	assert.throws(() => curl2D(id, id, 0, 0, NaN), RangeError)
})
