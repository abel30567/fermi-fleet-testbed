import { test } from 'node:test'
import assert from 'node:assert'
import { add, velocity2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('velocity2: circle at t=0 ~ [0, 1]', () => {
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const [vx, vy] = velocity2(rx, ry, 0)
	assert.ok(Math.abs(vx - 0) < 1e-3, `vx=${vx}`)
	assert.ok(Math.abs(vy - 1) < 1e-3, `vy=${vy}`)
})

test('velocity2: circle at t=Math.PI/2 ~ [-1, 0]', () => {
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const [vx, vy] = velocity2(rx, ry, Math.PI / 2)
	assert.ok(Math.abs(vx - -1) < 1e-3, `vx=${vx}`)
	assert.ok(Math.abs(vy - 0) < 1e-3, `vy=${vy}`)
})

test('velocity2: straight line has constant velocity', () => {
	const rx = (t) => 3 * t + 1
	const ry = (t) => -2 * t + 5
	const [vx, vy] = velocity2(rx, ry, 7)
	assert.ok(Math.abs(vx - 3) < 1e-6, `vx=${vx}`)
	assert.ok(Math.abs(vy - -2) < 1e-6, `vy=${vy}`)
})

test('velocity2: accepts a custom step size h', () => {
	const rx = (t) => t * t
	const ry = (t) => t * t * t
	const [vx, vy] = velocity2(rx, ry, 2, 1e-4)
	assert.ok(Math.abs(vx - 4) < 1e-3, `vx=${vx}`)
	assert.ok(Math.abs(vy - 12) < 1e-3, `vy=${vy}`)
})
