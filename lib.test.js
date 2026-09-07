import { test } from 'node:test'
import assert from 'node:assert'
import { add, mixedPartialXY } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('mixedPartialXY: f = x^2*y at (2,3) matches d/dy(2xy) = 2x = 4', () => {
	const f = (x, y) => x * x * y
	const result = mixedPartialXY(f, 2, 3)
	assert.ok(Math.abs(result - 4) < 1e-2, `expected ~4, got ${result}`)
})

test('mixedPartialXY: f = x*y at (1,1) matches d2f/dxdy = 1', () => {
	const f = (x, y) => x * y
	const result = mixedPartialXY(f, 1, 1)
	assert.ok(Math.abs(result - 1) < 1e-2, `expected ~1, got ${result}`)
})

test('mixedPartialXY: f = sin(x)*cos(y) at (0,0) matches d2f/dxdy = 0', () => {
	const f = (x, y) => Math.sin(x) * Math.cos(y)
	const result = mixedPartialXY(f, 0, 0)
	assert.ok(Math.abs(result - 0) < 1e-2, `expected ~0, got ${result}`)
})

test('mixedPartialXY: f = x^2*y^2 at (2,3) matches d2f/dxdy = 4xy = 24', () => {
	const f = (x, y) => x * x * y * y
	const result = mixedPartialXY(f, 2, 3)
	assert.ok(Math.abs(result - 24) < 1e-2, `expected ~24, got ${result}`)
})

test('mixedPartialXY: respects custom h parameter', () => {
	const f = (x, y) => x * x * y
	const result = mixedPartialXY(f, 2, 3, 1e-3)
	assert.ok(Math.abs(result - 4) < 1e-2, `expected ~4, got ${result}`)
})
