import { test } from 'node:test'
import assert from 'node:assert'
import { add, monteCarloDouble } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('monteCarloDouble: integral of x*y over [0,1]x[0,1] ~ 0.25', () => {
	const result = monteCarloDouble((x, y) => x * y, 0, 1, 0, 1, 200000, 42)
	assert.ok(Math.abs(result - 0.25) < 0.01, `expected ~0.25, got ${result}`)
})

test('monteCarloDouble: is reproducible with the same seed', () => {
	const a = monteCarloDouble((x, y) => x * y, 0, 1, 0, 1, 5000, 7)
	const b = monteCarloDouble((x, y) => x * y, 0, 1, 0, 1, 5000, 7)
	assert.equal(a, b)
})

test('monteCarloDouble: different seeds can give different results', () => {
	const a = monteCarloDouble((x, y) => x * y, 0, 1, 0, 1, 5000, 1)
	const b = monteCarloDouble((x, y) => x * y, 0, 1, 0, 1, 5000, 2)
	assert.notEqual(a, b)
})

test('monteCarloDouble: constant function integrates to area * constant', () => {
	const result = monteCarloDouble(() => 2, 0, 3, 0, 4, 50000, 1)
	assert.ok(Math.abs(result - 24) < 0.5, `expected ~24, got ${result}`)
})

test('monteCarloDouble: integral of x+y over [0,2]x[0,2] ~ 8', () => {
	const result = monteCarloDouble((x, y) => x + y, 0, 2, 0, 2, 200000, 99)
	assert.ok(Math.abs(result - 8) < 0.1, `expected ~8, got ${result}`)
})

test('monteCarloDouble: works over a non-origin rectangle', () => {
	const result = monteCarloDouble((x, y) => x * y, 1, 2, 1, 2, 200000, 123)
	assert.ok(Math.abs(result - 2.25) < 0.05, `expected ~2.25, got ${result}`)
})

test('monteCarloDouble: falls back to Math.random when no seed given', () => {
	const result = monteCarloDouble((x, y) => x * y, 0, 1, 0, 1, 200000)
	assert.ok(Math.abs(result - 0.25) < 0.02, `expected ~0.25, got ${result}`)
})
