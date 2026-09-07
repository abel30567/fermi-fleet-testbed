import { test } from 'node:test'
import assert from 'node:assert'
import { add, acceleration2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('acceleration2: unit circle at t=0', () => {
	const rx = Math.cos
	const ry = Math.sin
	const [ax, ay] = acceleration2(rx, ry, 0)
	assert.ok(Math.abs(ax - -1) < 1e-2, `ax=${ax}`)
	assert.ok(Math.abs(ay - 0) < 1e-2, `ay=${ay}`)
})

test('acceleration2: unit circle matches -[cos t, sin t] across t', () => {
	const rx = Math.cos
	const ry = Math.sin
	for (const t of [0, Math.PI / 4, Math.PI / 2, Math.PI, 3.7]) {
		const [ax, ay] = acceleration2(rx, ry, t)
		assert.ok(Math.abs(ax - -Math.cos(t)) < 1e-2, `t=${t} ax=${ax}`)
		assert.ok(Math.abs(ay - -Math.sin(t)) < 1e-2, `t=${t} ay=${ay}`)
	}
})

test('acceleration2: constant velocity line has zero acceleration', () => {
	const rx = (t) => 2 * t + 1
	const ry = (t) => -3 * t + 5
	const [ax, ay] = acceleration2(rx, ry, 2)
	assert.ok(Math.abs(ax) < 1e-2, `ax=${ax}`)
	assert.ok(Math.abs(ay) < 1e-2, `ay=${ay}`)
})

test('acceleration2: constant acceleration parabola', () => {
	// r(t) = [t^2, 3t^2] has acceleration [2, 6] everywhere
	const rx = (t) => t * t
	const ry = (t) => 3 * t * t
	const [ax, ay] = acceleration2(rx, ry, 1.5)
	assert.ok(Math.abs(ax - 2) < 1e-2, `ax=${ax}`)
	assert.ok(Math.abs(ay - 6) < 1e-2, `ay=${ay}`)
})

test('acceleration2: custom h still approximates well', () => {
	const rx = Math.cos
	const ry = Math.sin
	const [ax, ay] = acceleration2(rx, ry, Math.PI / 3, 1e-3)
	assert.ok(Math.abs(ax - -Math.cos(Math.PI / 3)) < 1e-2, `ax=${ax}`)
	assert.ok(Math.abs(ay - -Math.sin(Math.PI / 3)) < 1e-2, `ay=${ay}`)
})
