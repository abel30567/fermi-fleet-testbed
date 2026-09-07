import { test } from 'node:test'
import assert from 'node:assert'
import { add, mass2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('mass2: density=1 over unit square ~ 1', () => {
	const m = mass2(() => 1, 0, 1, 0, 1)
	assert.ok(Math.abs(m - 1) < 1e-3, `expected ~1, got ${m}`)
})

test('mass2: density=x+y over [0,1]^2 ~ 1', () => {
	const m = mass2((x, y) => x + y, 0, 1, 0, 1)
	assert.ok(Math.abs(m - 1) < 1e-3, `expected ~1, got ${m}`)
})

test('mass2: density=1 over [0,2]x[0,3] ~ 6', () => {
	const m = mass2(() => 1, 0, 2, 0, 3)
	assert.ok(Math.abs(m - 6) < 1e-3, `expected ~6, got ${m}`)
})

test('mass2: respects custom n', () => {
	const m = mass2((x, y) => x * y, 0, 1, 0, 1, 200)
	assert.ok(Math.abs(m - 0.25) < 1e-3, `expected ~0.25, got ${m}`)
})
