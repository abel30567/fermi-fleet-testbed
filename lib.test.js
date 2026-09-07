import { test } from 'node:test'
import assert from 'node:assert'
import { add, unitNormal2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

const cos = Math.cos
const sin = Math.sin

test('unitNormal2: magnitude ~1 on unit circle at t=0', () => {
	const [nx, ny] = unitNormal2(cos, sin, 0)
	const mag = Math.hypot(nx, ny)
	assert.ok(Math.abs(mag - 1) < 1e-6, `expected magnitude ~1, got ${mag}`)
})

test('unitNormal2: perpendicular to tangent on unit circle at t=0', () => {
	const h = 1e-4
	const tx = (cos(h) - cos(-h)) / (2 * h)
	const ty = (sin(h) - sin(-h)) / (2 * h)
	const tlen = Math.hypot(tx, ty)
	const tux = tx / tlen
	const tuy = ty / tlen

	const [nx, ny] = unitNormal2(cos, sin, 0)
	const dot = tux * nx + tuy * ny
	assert.ok(Math.abs(dot) < 1e-6, `expected dot product ~0, got ${dot}`)
})

test('unitNormal2: points toward center on unit circle at t=0', () => {
	// at t=0, position is (1, 0); inward normal is (-1, 0)
	const [nx, ny] = unitNormal2(cos, sin, 0)
	assert.ok(Math.abs(nx - -1) < 1e-6, `expected nx ~ -1, got ${nx}`)
	assert.ok(Math.abs(ny - 0) < 1e-6, `expected ny ~ 0, got ${ny}`)
})

test('unitNormal2: perpendicular and unit length at another point (t=pi/2)', () => {
	const t = Math.PI / 2
	const h = 1e-4
	const tx = (cos(t + h) - cos(t - h)) / (2 * h)
	const ty = (sin(t + h) - sin(t - h)) / (2 * h)
	const tlen = Math.hypot(tx, ty)
	const tux = tx / tlen
	const tuy = ty / tlen

	const [nx, ny] = unitNormal2(cos, sin, t)
	const mag = Math.hypot(nx, ny)
	const dot = tux * nx + tuy * ny

	assert.ok(Math.abs(mag - 1) < 1e-6, `expected magnitude ~1, got ${mag}`)
	assert.ok(Math.abs(dot) < 1e-6, `expected dot product ~0, got ${dot}`)
})

test('unitNormal2: respects custom step size h', () => {
	const [nx, ny] = unitNormal2(cos, sin, 0, 1e-3)
	assert.ok(Math.abs(Math.hypot(nx, ny) - 1) < 1e-6)
	assert.ok(Math.abs(nx - -1) < 1e-4)
	assert.ok(Math.abs(ny - 0) < 1e-4)
})
