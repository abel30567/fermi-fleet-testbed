import { test } from 'node:test'
import assert from 'node:assert'
import { add, hessian2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('hessian2: f = x^2 * y at (2,3) matches analytic Hessian', () => {
	const f = (x, y) => x * x * y
	const [[fxx, fxy], [fyx, fyy]] = hessian2(f, 2, 3)
	// analytic: fxx = 2y = 6, fxy = fyx = 2x = 4, fyy = 0
	assert.ok(Math.abs(fxx - 6) < 1e-2, `fxx=${fxx}`)
	assert.ok(Math.abs(fxy - 4) < 1e-2, `fxy=${fxy}`)
	assert.ok(Math.abs(fyx - 4) < 1e-2, `fyx=${fyx}`)
	assert.ok(Math.abs(fyy - 0) < 1e-2, `fyy=${fyy}`)
})

test('hessian2: mixed partials are symmetric', () => {
	const f = (x, y) => x * x * y
	const [[, fxy], [fyx]] = hessian2(f, 2, 3)
	assert.ok(Math.abs(fxy - fyx) < 1e-6)
})

test('hessian2: f = x^2 + y^2 has constant diagonal Hessian and zero cross terms', () => {
	const f = (x, y) => x * x + y * y
	const [[fxx, fxy], [fyx, fyy]] = hessian2(f, -1, 5)
	assert.ok(Math.abs(fxx - 2) < 1e-2, `fxx=${fxx}`)
	assert.ok(Math.abs(fyy - 2) < 1e-2, `fyy=${fyy}`)
	assert.ok(Math.abs(fxy - 0) < 1e-2, `fxy=${fxy}`)
	assert.ok(Math.abs(fyx - 0) < 1e-2, `fyx=${fyx}`)
})

test('hessian2: respects custom step size h', () => {
	const f = (x, y) => x * y * y
	const [[fxx, fxy], [fyx, fyy]] = hessian2(f, 3, 2, 1e-3)
	// analytic: fxx = 0, fxy = fyx = 2y = 4, fyy = 2x = 6
	assert.ok(Math.abs(fxx - 0) < 1e-2, `fxx=${fxx}`)
	assert.ok(Math.abs(fxy - 4) < 1e-2, `fxy=${fxy}`)
	assert.ok(Math.abs(fyx - 4) < 1e-2, `fyx=${fyx}`)
	assert.ok(Math.abs(fyy - 6) < 1e-2, `fyy=${fyy}`)
})
