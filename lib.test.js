import { test } from 'node:test'
import assert from 'node:assert'
import { add, surfaceAreaGraph } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('surfaceAreaGraph: flat plane f=0 over unit square is ~1', () => {
	const area = surfaceAreaGraph(() => 0, 0, 1, 0, 1)
	assert.ok(Math.abs(area - 1) < 1e-2, `expected ~1, got ${area}`)
})

test('surfaceAreaGraph: tilted plane f=x over unit square is ~sqrt(2)', () => {
	const area = surfaceAreaGraph((x, y) => x, 0, 1, 0, 1)
	assert.ok(Math.abs(area - Math.sqrt(2)) < 1e-2, `expected ~${Math.sqrt(2)}, got ${area}`)
})

test('surfaceAreaGraph: flat plane over a non-unit rectangle equals its area', () => {
	const area = surfaceAreaGraph(() => 5, -1, 2, 0, 4)
	assert.ok(Math.abs(area - 12) < 1e-2, `expected ~12, got ${area}`)
})

test('surfaceAreaGraph: tilted plane f=x+y over unit square is ~sqrt(3)', () => {
	const area = surfaceAreaGraph((x, y) => x + y, 0, 1, 0, 1)
	assert.ok(Math.abs(area - Math.sqrt(3)) < 1e-2, `expected ~${Math.sqrt(3)}, got ${area}`)
})

test('surfaceAreaGraph: custom n parameter still converges', () => {
	const area = surfaceAreaGraph((x, y) => x, 0, 1, 0, 1, 200)
	assert.ok(Math.abs(area - Math.sqrt(2)) < 1e-2, `expected ~${Math.sqrt(2)}, got ${area}`)
})
