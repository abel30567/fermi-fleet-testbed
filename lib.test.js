import { test } from 'node:test'
import assert from 'node:assert'
import { add, fivePointPartialX } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('fivePointPartialX: f=x^4*y at (1,1) ~ 4', () => {
	const f = (x, y) => x ** 4 * y
	const result = fivePointPartialX(f, 1, 1)
	assert.ok(Math.abs(result - 4) < 1e-6, `expected ~4, got ${result}`)
})

test('fivePointPartialX: f=x^4*y at (2,3), df/dx = 4*x^3*y = 96', () => {
	const f = (x, y) => x ** 4 * y
	const result = fivePointPartialX(f, 2, 3)
	assert.ok(Math.abs(result - 96) < 1e-6, `expected ~96, got ${result}`)
})

test('fivePointPartialX: f=x*y at (5,7), df/dx = y = 7', () => {
	const f = (x, y) => x * y
	const result = fivePointPartialX(f, 5, 7)
	assert.ok(Math.abs(result - 7) < 1e-6, `expected ~7, got ${result}`)
})

test('fivePointPartialX: f=sin(x)*y at (0,2), df/dx = cos(x)*y = 2', () => {
	const f = (x, y) => Math.sin(x) * y
	const result = fivePointPartialX(f, 0, 2)
	assert.ok(Math.abs(result - 2) < 1e-6, `expected ~2, got ${result}`)
})

test('fivePointPartialX: constant in x, df/dx = 0', () => {
	const f = (x, y) => y * y
	const result = fivePointPartialX(f, 3, 4)
	assert.ok(Math.abs(result - 0) < 1e-9, `expected ~0, got ${result}`)
})

test('fivePointPartialX: custom step size h', () => {
	const f = (x, y) => x ** 3 + y
	const result = fivePointPartialX(f, 2, 1, 1e-2)
	assert.ok(Math.abs(result - 12) < 1e-6, `expected ~12, got ${result}`)
})
