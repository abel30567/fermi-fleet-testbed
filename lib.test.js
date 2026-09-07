import { test } from 'node:test'
import assert from 'node:assert'
import { add, curvature2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('curvature2: circle of radius 2 has curvature ~0.5', () => {
	const r = 2
	const rx = (t) => r * Math.cos(t)
	const ry = (t) => r * Math.sin(t)
	const k = curvature2(rx, ry, 0.7)
	assert.ok(Math.abs(k - 0.5) < 1e-2, `expected ~0.5, got ${k}`)
})

test('curvature2: circle curvature is constant across t (1/r)', () => {
	const r = 3
	const rx = (t) => r * Math.cos(t)
	const ry = (t) => r * Math.sin(t)
	for (const t of [0, 0.5, 1, 2, 3.5, 5]) {
		const k = curvature2(rx, ry, t)
		assert.ok(Math.abs(k - 1 / r) < 1e-2, `at t=${t} expected ~${1 / r}, got ${k}`)
	}
})

test('curvature2: straight line has zero curvature', () => {
	const rx = (t) => 2 * t + 1
	const ry = (t) => -3 * t + 5
	const k = curvature2(rx, ry, 1.234)
	assert.ok(Math.abs(k) < 1e-6, `expected ~0, got ${k}`)
})

test('curvature2: smaller radius circle has larger curvature', () => {
	const rxSmall = (t) => 1 * Math.cos(t)
	const rySmall = (t) => 1 * Math.sin(t)
	const rxBig = (t) => 5 * Math.cos(t)
	const ryBig = (t) => 5 * Math.sin(t)
	const kSmall = curvature2(rxSmall, rySmall, 1)
	const kBig = curvature2(rxBig, ryBig, 1)
	assert.ok(kSmall > kBig)
	assert.ok(Math.abs(kSmall - 1) < 1e-2)
	assert.ok(Math.abs(kBig - 0.2) < 1e-2)
})

test('curvature2: accepts custom step size h', () => {
	const r = 2
	const rx = (t) => r * Math.cos(t)
	const ry = (t) => r * Math.sin(t)
	const k = curvature2(rx, ry, 0.7, 1e-3)
	assert.ok(Math.abs(k - 0.5) < 1e-2, `expected ~0.5, got ${k}`)
})
