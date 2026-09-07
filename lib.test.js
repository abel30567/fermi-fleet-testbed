import { test } from 'node:test'
import assert from 'node:assert'
import { add, unitTangent2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('unitTangent2: unit circle at t=0 ~ [0,1]', () => {
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const [ux, uy] = unitTangent2(rx, ry, 0)
	assert.ok(Math.abs(ux - 0) < 1e-4)
	assert.ok(Math.abs(uy - 1) < 1e-4)
})

test('unitTangent2: unit circle at t=Math.PI/2 ~ [-1,0]', () => {
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const [ux, uy] = unitTangent2(rx, ry, Math.PI / 2)
	assert.ok(Math.abs(ux - -1) < 1e-4)
	assert.ok(Math.abs(uy - 0) < 1e-4)
})

test('unitTangent2: returned vector has unit length', () => {
	const rx = (t) => t * t
	const ry = (t) => t * t * t
	const [ux, uy] = unitTangent2(rx, ry, 1.3)
	assert.ok(Math.abs(Math.hypot(ux, uy) - 1) < 1e-6)
})

test('unitTangent2: straight line direction is normalized velocity', () => {
	const rx = (t) => 3 * t + 1
	const ry = (t) => 4 * t - 2
	const [ux, uy] = unitTangent2(rx, ry, 5)
	assert.ok(Math.abs(ux - 0.6) < 1e-4)
	assert.ok(Math.abs(uy - 0.8) < 1e-4)
})

test('unitTangent2: throws RangeError when speed is ~0 (stationary point)', () => {
	const rx = () => 5
	const ry = () => -2
	assert.throws(() => unitTangent2(rx, ry, 0), RangeError)
})

test('unitTangent2: throws RangeError at a cusp with zero velocity', () => {
	const rx = (t) => t * t * t
	const ry = (t) => t * t
	assert.throws(() => unitTangent2(rx, ry, 0), RangeError)
})

test('unitTangent2: respects custom step size h', () => {
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const [ux, uy] = unitTangent2(rx, ry, 0, 1e-3)
	assert.ok(Math.abs(ux - 0) < 1e-3)
	assert.ok(Math.abs(uy - 1) < 1e-3)
})
