import { test } from 'node:test'
import assert from 'node:assert'
import { add, tripleIntegralMid } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('tripleIntegralMid: constant function 1 over unit cube equals volume', () => {
	const result = tripleIntegralMid(() => 1, 0, 1, 0, 1, 0, 1)
	assert.ok(Math.abs(result - 1) < 1e-6, `expected ~1, got ${result}`)
})

test('tripleIntegralMid: f = x*y*z over [0,1]^3 approximates 0.125', () => {
	const result = tripleIntegralMid((x, y, z) => x * y * z, 0, 1, 0, 1, 0, 1)
	assert.ok(Math.abs(result - 0.125) < 1e-2, `expected ~0.125, got ${result}`)
})

test('tripleIntegralMid: constant function over non-unit box equals volume scaled', () => {
	const result = tripleIntegralMid(() => 2, 0, 2, 0, 3, 0, 1, 10)
	// volume = 2*3*1 = 6, f=2 => integral = 12
	assert.ok(Math.abs(result - 12) < 1e-6, `expected ~12, got ${result}`)
})

test('tripleIntegralMid: f = 1 over a box not starting at origin', () => {
	const result = tripleIntegralMid(() => 1, 1, 3, -1, 1, 2, 5, 20)
	// volume = 2*2*3 = 12
	assert.ok(Math.abs(result - 12) < 1e-6, `expected ~12, got ${result}`)
})

test('tripleIntegralMid: respects custom n parameter for accuracy', () => {
	const coarse = tripleIntegralMid((x, y, z) => x * y * z, 0, 1, 0, 1, 0, 1, 5)
	const fine = tripleIntegralMid((x, y, z) => x * y * z, 0, 1, 0, 1, 0, 1, 50)
	assert.ok(Math.abs(fine - 0.125) < Math.abs(coarse - 0.125) + 1e-9)
})
