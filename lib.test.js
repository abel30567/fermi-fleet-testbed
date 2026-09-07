import { test } from 'node:test'
import assert from 'node:assert'
import { add, momentX2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('momentX2: constant density over unit square is 0.5', () => {
	const result = momentX2(() => 1, 0, 1, 0, 1)
	assert.ok(Math.abs(result - 0.5) < 1e-3)
})

test('momentX2: constant density over [0,2]x[0,2] is 4', () => {
	const result = momentX2(() => 1, 0, 2, 0, 2)
	assert.ok(Math.abs(result - 4) < 1e-3)
})

test('momentX2: non-constant density density(x,y)=x over unit square is 0.25', () => {
	const result = momentX2((x, _y) => x, 0, 1, 0, 1)
	assert.ok(Math.abs(result - 0.25) < 1e-3)
})

test('momentX2: zero density gives zero moment', () => {
	const result = momentX2(() => 0, 0, 1, 0, 1)
	assert.equal(result, 0)
})

test('momentX2: respects custom n subdivisions', () => {
	const result = momentX2(() => 1, 0, 1, 0, 1, 200)
	assert.ok(Math.abs(result - 0.5) < 1e-3)
})
