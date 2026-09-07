import { test } from 'node:test'
import assert from 'node:assert'
import { add, richardsonPartialX } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('richardsonPartialX: f = sin(x)*y at (1,2) matches 2*cos(1)', () => {
	const f = (x, y) => Math.sin(x) * y
	const result = richardsonPartialX(f, 1, 2)
	assert.ok(Math.abs(result - 2 * Math.cos(1)) < 1e-6)
})

test('richardsonPartialX: default h can be overridden', () => {
	const f = (x, y) => Math.sin(x) * y
	const result = richardsonPartialX(f, 1, 2, 1e-2)
	assert.ok(Math.abs(result - 2 * Math.cos(1)) < 1e-6)
})

test('richardsonPartialX: f = x^2 * y has exact partial derivative 2*x*y', () => {
	const f = (x, y) => x * x * y
	const result = richardsonPartialX(f, 3, 4)
	assert.ok(Math.abs(result - 2 * 3 * 4) < 1e-9)
})

test('richardsonPartialX: f = x*y (linear in x) gives exact partial derivative y', () => {
	const f = (x, y) => x * y
	const result = richardsonPartialX(f, 5, 7)
	assert.ok(Math.abs(result - 7) < 1e-9)
})

test('richardsonPartialX: partial derivative independent of x when f has no x term', () => {
	const f = (x, y) => y * y
	const result = richardsonPartialX(f, 2, 3)
	assert.ok(Math.abs(result - 0) < 1e-9)
})

test('richardsonPartialX: f = e^x * y at (0,1) matches y', () => {
	const f = (x, y) => Math.exp(x) * y
	const result = richardsonPartialX(f, 0, 1)
	assert.ok(Math.abs(result - 1) < 1e-6)
})
