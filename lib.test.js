import { test } from 'node:test'
import assert from 'node:assert'
import { add, gradientDescent2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('gradientDescent2 converges to the minimum of a paraboloid', () => {
	const f = (x, y) => (x - 1) ** 2 + (y + 2) ** 2
	const [x, y] = gradientDescent2(f, 0, 0)
	assert.ok(Math.abs(x - 1) < 1e-2, `x=${x} not close to 1`)
	assert.ok(Math.abs(y - -2) < 1e-2, `y=${y} not close to -2`)
})

test('gradientDescent2 converges from a different starting point', () => {
	const f = (x, y) => (x - 1) ** 2 + (y + 2) ** 2
	const [x, y] = gradientDescent2(f, 5, 5)
	assert.ok(Math.abs(x - 1) < 1e-2, `x=${x} not close to 1`)
	assert.ok(Math.abs(y - -2) < 1e-2, `y=${y} not close to -2`)
})

test('gradientDescent2 stays put when already at the minimum', () => {
	const f = (x, y) => x ** 2 + y ** 2
	const [x, y] = gradientDescent2(f, 0, 0)
	assert.ok(Math.abs(x) < 1e-2, `x=${x} not close to 0`)
	assert.ok(Math.abs(y) < 1e-2, `y=${y} not close to 0`)
})

test('gradientDescent2 respects custom lr and steps', () => {
	const f = (x, y) => (x - 3) ** 2 + (y - 4) ** 2
	const [x, y] = gradientDescent2(f, 0, 0, 0.2, 500)
	assert.ok(Math.abs(x - 3) < 1e-2, `x=${x} not close to 3`)
	assert.ok(Math.abs(y - 4) < 1e-2, `y=${y} not close to 4`)
})

test('gradientDescent2 handles an asymmetric bowl', () => {
	const f = (x, y) => 3 * (x + 2) ** 2 + 0.5 * (y - 7) ** 2
	const [x, y] = gradientDescent2(f, 0, 0, 0.05, 1000)
	assert.ok(Math.abs(x - -2) < 1e-2, `x=${x} not close to -2`)
	assert.ok(Math.abs(y - 7) < 1e-2, `y=${y} not close to 7`)
})
