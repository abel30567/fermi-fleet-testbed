import { test } from 'node:test'
import assert from 'node:assert'
import { add, doubleIntegralPolar } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('doubleIntegralPolar: f=1 over full disk r in [0,1] ~ pi', () => {
	const result = doubleIntegralPolar(() => 1, 0, 1, 0, 2 * Math.PI)
	assert.ok(Math.abs(result - Math.PI) < 1e-2, `expected ~pi, got ${result}`)
})

test('doubleIntegralPolar: f=1 over half disk r in [0,1] ~ pi/2', () => {
	const result = doubleIntegralPolar(() => 1, 0, 1, 0, Math.PI)
	assert.ok(Math.abs(result - Math.PI / 2) < 1e-2, `expected ~pi/2, got ${result}`)
})

test('doubleIntegralPolar: f=1 over annulus r in [1,2] ~ 3*pi', () => {
	const result = doubleIntegralPolar(() => 1, 1, 2, 0, 2 * Math.PI)
	assert.ok(Math.abs(result - 3 * Math.PI) < 1e-2, `expected ~3pi, got ${result}`)
})

test('doubleIntegralPolar: f=r over full disk r in [0,1] ~ 2*pi/3', () => {
	const result = doubleIntegralPolar((r) => r, 0, 1, 0, 2 * Math.PI)
	assert.ok(Math.abs(result - (2 * Math.PI) / 3) < 1e-2, `expected ~2pi/3, got ${result}`)
})

test('doubleIntegralPolar: matches cartesian area of disk radius 2 (pi*r^2)', () => {
	const result = doubleIntegralPolar(() => 1, 0, 2, 0, 2 * Math.PI)
	assert.ok(Math.abs(result - Math.PI * 4) < 1e-2, `expected ~4pi, got ${result}`)
})

test('doubleIntegralPolar: respects custom n for accuracy', () => {
	const coarse = doubleIntegralPolar(() => 1, 0, 1, 0, 2 * Math.PI, 10)
	const fine = doubleIntegralPolar(() => 1, 0, 1, 0, 2 * Math.PI, 500)
	assert.ok(Math.abs(fine - Math.PI) < Math.abs(coarse - Math.PI) + 1e-6)
})
