import { test } from 'node:test'
import assert from 'node:assert'
import { add, taylor2Second } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('taylor2Second is exact for a quadratic away from the expansion point', () => {
	const f = (x, y) => x * x + y * y
	const approx = taylor2Second(f, 1, 1, 3, -2)
	const exact = f(3, -2)
	assert.ok(Math.abs(approx - exact) < 1e-2, `expected ${approx} to be within 1e-2 of ${exact}`)
})

test('taylor2Second is exact for a quadratic at the expansion point', () => {
	const f = (x, y) => x * x + y * y
	const approx = taylor2Second(f, 0, 0, 0, 0)
	assert.ok(Math.abs(approx - f(0, 0)) < 1e-2)
})

test('taylor2Second is exact for a mixed quadratic (cross term)', () => {
	const f = (x, y) => x * x + y * y + x * y
	const approx = taylor2Second(f, 2, -1, 5, 4)
	const exact = f(5, 4)
	assert.ok(Math.abs(approx - exact) < 1e-2, `expected ${approx} to be within 1e-2 of ${exact}`)
})

test('taylor2Second respects a custom step size h', () => {
	const f = (x, y) => x * x + y * y
	const approx = taylor2Second(f, 1, 2, 4, -3, 1e-3)
	const exact = f(4, -3)
	assert.ok(Math.abs(approx - exact) < 1e-2)
})

test('taylor2Second matches f(x0, y0) when x=x0 and y=y0', () => {
	const f = (x, y) => Math.sin(x) + y * y
	assert.ok(Math.abs(taylor2Second(f, 0.5, 1.5, 0.5, 1.5) - f(0.5, 1.5)) < 1e-2)
})
