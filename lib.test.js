import { test } from 'node:test'
import assert from 'node:assert'
import { add, greenFlux } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('greenFlux: P=x, Q=y over unit square ~ 2', () => {
	const flux = greenFlux((x, y) => x, (x, y) => y, 0, 1, 0, 1)
	assert.ok(Math.abs(flux - 2) < 1e-2, `expected ~2, got ${flux}`)
})

test('greenFlux: P=x^2, Q=y^2 over unit square ~ 2', () => {
	// Px = 2x, Qy = 2y, integral over [0,1]x[0,1] = 1 + 1 = 2
	const flux = greenFlux((x, y) => x * x, (x, y) => y * y, 0, 1, 0, 1)
	assert.ok(Math.abs(flux - 2) < 1e-2, `expected ~2, got ${flux}`)
})

test('greenFlux: P=0, Q=0 is exactly 0', () => {
	const flux = greenFlux(() => 0, () => 0, 0, 1, 0, 1)
	assert.ok(Math.abs(flux - 0) < 1e-6, `expected ~0, got ${flux}`)
})

test('greenFlux: scales with non-unit rectangle', () => {
	// Px = 1, Qy = 1, integral of 2 over [1,3]x[-1,2] (area 6) = 12
	const flux = greenFlux((x, y) => x, (x, y) => y, 1, 3, -1, 2)
	assert.ok(Math.abs(flux - 12) < 1e-2, `expected ~12, got ${flux}`)
})

test('greenFlux: respects custom n', () => {
	const flux = greenFlux((x, y) => x, (x, y) => y, 0, 1, 0, 1, 25)
	assert.ok(Math.abs(flux - 2) < 1e-2, `expected ~2, got ${flux}`)
})
