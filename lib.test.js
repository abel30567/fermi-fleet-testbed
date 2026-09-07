import { test } from 'node:test'
import assert from 'node:assert'
import { add, greenCirculation } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('greenCirculation: P=-y, Q=x over unit square ~ 2', () => {
	const P = (x, y) => -y
	const Q = (x, y) => x
	const result = greenCirculation(P, Q, 0, 1, 0, 1)
	assert.ok(Math.abs(result - 2) < 1e-2, `expected ~2, got ${result}`)
})

test('greenCirculation: P=0, Q=0 gives 0', () => {
	const P = () => 0
	const Q = () => 0
	const result = greenCirculation(P, Q, 0, 1, 0, 1)
	assert.ok(Math.abs(result) < 1e-2, `expected ~0, got ${result}`)
})

test('greenCirculation: conservative field (P=y, Q=x) gives 0 (Qx=1, Py=1)', () => {
	const P = (x, y) => y
	const Q = (x, y) => x
	const result = greenCirculation(P, Q, -1, 1, -1, 2)
	assert.ok(Math.abs(result) < 1e-2, `expected ~0, got ${result}`)
})

test('greenCirculation: P=0, Q=x^2 over [0,2]x[0,3] equals area*2*avg(x) analytically = 24', () => {
	// Qx = 2x, Py = 0 -> integral over rectangle of 2x dA = (by-ay) * integral_ax^bx 2x dx
	const P = () => 0
	const Q = (x, y) => x * x
	const result = greenCirculation(P, Q, 0, 2, 0, 3, 200)
	// integral_0^2 2x dx = 4, times height 3 = 12
	assert.ok(Math.abs(result - 12) < 1e-2, `expected ~12, got ${result}`)
})

test('greenCirculation: scales with rectangle not centered at origin', () => {
	const P = (x, y) => -y
	const Q = (x, y) => x
	// Qx - Py = 2 everywhere, so integral = 2 * area
	const result = greenCirculation(P, Q, 5, 8, -2, 1, 50)
	const area = (8 - 5) * (1 - (-2))
	assert.ok(Math.abs(result - 2 * area) < 1e-2, `expected ~${2 * area}, got ${result}`)
})
