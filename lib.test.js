import { test } from 'node:test'
import assert from 'node:assert'
import { add, centerOfMass2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('centerOfMass2: uniform density over [0,2]x[0,4] is the geometric center', () => {
	const [xbar, ybar] = centerOfMass2(() => 1, 0, 2, 0, 4)
	assert.ok(Math.abs(xbar - 1) < 1e-2)
	assert.ok(Math.abs(ybar - 2) < 1e-2)
})

test('centerOfMass2: uniform density over a square centered at origin is [0,0]', () => {
	const [xbar, ybar] = centerOfMass2(() => 5, -3, 3, -3, 3)
	assert.ok(Math.abs(xbar) < 1e-2)
	assert.ok(Math.abs(ybar) < 1e-2)
})

test('centerOfMass2: density weighted toward larger x pulls xbar above the midpoint', () => {
	const [xbar, ybar] = centerOfMass2((x, y) => x, 0, 2, 0, 4)
	// For density = x over [0,2]x[0,4]: xbar = (2/3)*2 = 4/3, ybar = 2 (symmetric in y)
	assert.ok(Math.abs(xbar - 4 / 3) < 1e-2)
	assert.ok(Math.abs(ybar - 2) < 1e-2)
})

test('centerOfMass2: density = x*y over [0,1]x[0,1] gives xbar=ybar=2/3', () => {
	const [xbar, ybar] = centerOfMass2((x, y) => x * y, 0, 1, 0, 1)
	assert.ok(Math.abs(xbar - 2 / 3) < 1e-2)
	assert.ok(Math.abs(ybar - 2 / 3) < 1e-2)
})

test('centerOfMass2: respects a custom n', () => {
	const [xbar, ybar] = centerOfMass2(() => 1, 0, 2, 0, 4, 10)
	assert.ok(Math.abs(xbar - 1) < 1e-2)
	assert.ok(Math.abs(ybar - 2) < 1e-2)
})
