import { test } from 'node:test'
import assert from 'node:assert'
import { add, partialI } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('partialI: df/dx0 of x0*x1 at [2,3] is ~3', () => {
	const f = (v) => v[0] * v[1]
	assert.ok(Math.abs(partialI(f, [2, 3], 0) - 3) < 1e-6)
})

test('partialI: df/dx1 of x0*x1 at [2,3] is ~2', () => {
	const f = (v) => v[0] * v[1]
	assert.ok(Math.abs(partialI(f, [2, 3], 1) - 2) < 1e-6)
})

test('partialI: partial of x0^2 wrt x0 at [4] is ~2*4', () => {
	const f = (v) => v[0] * v[0]
	assert.ok(Math.abs(partialI(f, [4], 0) - 8) < 1e-4)
})

test('partialI: partial wrt a variable the function ignores is 0', () => {
	const f = (v) => v[0] * v[0]
	assert.ok(Math.abs(partialI(f, [4, 99], 1) - 0) < 1e-9)
})

test('partialI: custom h still approximates the derivative', () => {
	const f = (v) => v[0] * v[1]
	assert.ok(Math.abs(partialI(f, [2, 3], 0, 1e-3) - 3) < 1e-3)
})

test('partialI: does not mutate the input point', () => {
	const f = (v) => v[0] * v[1]
	const point = [2, 3]
	partialI(f, point, 0)
	assert.deepEqual(point, [2, 3])
})
