import { test } from 'node:test'
import assert from 'node:assert'
import { add, speed2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('speed2: unit circle speed is ~1 everywhere', () => {
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	for (const t of [0, 0.5, 1, Math.PI / 2, Math.PI, 2 * Math.PI, -1.3]) {
		assert.ok(Math.abs(speed2(rx, ry, t) - 1) < 1e-6)
	}
})

test('speed2: straight horizontal line has constant speed equal to rate', () => {
	const rx = (t) => 3 * t
	const ry = (t) => 0
	assert.ok(Math.abs(speed2(rx, ry, 2) - 3) < 1e-6)
})

test('speed2: 3-4-5 straight diagonal line has speed 5', () => {
	const rx = (t) => 3 * t
	const ry = (t) => 4 * t
	assert.ok(Math.abs(speed2(rx, ry, 0.7) - 5) < 1e-6)
})

test('speed2: stationary point (constant curve) has zero speed', () => {
	const rx = (t) => 2
	const ry = (t) => -1
	assert.equal(speed2(rx, ry, 5), 0)
})

test('speed2: circle of radius R has speed |a|*R', () => {
	const R = 4
	const w = 2
	const rx = (t) => R * Math.cos(w * t)
	const ry = (t) => R * Math.sin(w * t)
	assert.ok(Math.abs(speed2(rx, ry, 1) - R * w) < 1e-4)
})

test('speed2: respects custom h step size', () => {
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	assert.ok(Math.abs(speed2(rx, ry, 0.3, 1e-3) - 1) < 1e-4)
})
