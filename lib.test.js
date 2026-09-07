import { test } from 'node:test'
import assert from 'node:assert'
import { add, curvature3 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('curvature3: unit circle in xy-plane has curvature ~1', () => {
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const rz = (t) => 0
	for (const t of [0, 0.5, 1, Math.PI / 2, 3]) {
		assert.ok(Math.abs(curvature3(rx, ry, rz, t) - 1) < 1e-2)
	}
})

test('curvature3: circle of radius R has curvature ~1/R', () => {
	const R = 5
	const rx = (t) => R * Math.cos(t)
	const ry = (t) => R * Math.sin(t)
	const rz = (t) => 0
	assert.ok(Math.abs(curvature3(rx, ry, rz, 1) - 1 / R) < 1e-2)
})

test('curvature3: straight line has curvature 0', () => {
	const rx = (t) => t
	const ry = (t) => 2 * t + 1
	const rz = (t) => -3 * t
	assert.ok(Math.abs(curvature3(rx, ry, rz, 2)) < 1e-6)
})

test('curvature3: helix has constant known curvature', () => {
	// r(t) = (a cos t, a sin t, b t) has curvature a / (a^2 + b^2)
	const a = 2
	const b = 1
	const rx = (t) => a * Math.cos(t)
	const ry = (t) => a * Math.sin(t)
	const rz = (t) => b * t
	const expected = a / (a * a + b * b)
	for (const t of [0, 1, 2.5]) {
		assert.ok(Math.abs(curvature3(rx, ry, rz, t) - expected) < 1e-2)
	}
})

test('curvature3: accepts a custom step size h', () => {
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const rz = (t) => 0
	assert.ok(Math.abs(curvature3(rx, ry, rz, 0.3, 1e-3) - 1) < 1e-2)
})
