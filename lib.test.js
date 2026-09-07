import { test } from 'node:test'
import assert from 'node:assert'
import { add, newtonOptStep2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('newtonOptStep2: single step on quadratic lands near the minimum', () => {
	const f = (x, y) => (x - 1) ** 2 + (y + 1) ** 2
	const [x, y] = newtonOptStep2(f, 0, 0)
	assert.ok(Math.abs(x - 1) < 1e-2, `x=${x} not close to 1`)
	assert.ok(Math.abs(y - -1) < 1e-2, `y=${y} not close to -1`)
})

test('newtonOptStep2: already at the minimum stays put', () => {
	const f = (x, y) => (x - 1) ** 2 + (y + 1) ** 2
	const [x, y] = newtonOptStep2(f, 1, -1)
	assert.ok(Math.abs(x - 1) < 1e-2, `x=${x} not close to 1`)
	assert.ok(Math.abs(y - -1) < 1e-2, `y=${y} not close to -1`)
})

test('newtonOptStep2: converges from an arbitrary starting point', () => {
	const f = (x, y) => (x - 3) ** 2 + (y - 2) ** 2
	const [x, y] = newtonOptStep2(f, 10, -5)
	assert.ok(Math.abs(x - 3) < 1e-2, `x=${x} not close to 3`)
	assert.ok(Math.abs(y - 2) < 1e-2, `y=${y} not close to 2`)
})

test('newtonOptStep2: accepts a custom step size h', () => {
	const f = (x, y) => (x - 1) ** 2 + (y + 1) ** 2
	const [x, y] = newtonOptStep2(f, 0, 0, 1e-3)
	assert.ok(Math.abs(x - 1) < 1e-2, `x=${x} not close to 1`)
	assert.ok(Math.abs(y - -1) < 1e-2, `y=${y} not close to -1`)
})

test('newtonOptStep2: throws RangeError when the Hessian is singular', () => {
	const linear = (x, y) => 2 * x + 3 * y
	assert.throws(() => newtonOptStep2(linear, 0, 0), RangeError)
})
