import { test } from 'node:test'
import assert from 'node:assert'
import { add, lineIntegralVector } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('lineIntegralVector: P=-y, Q=x around unit circle ~ 2*pi', () => {
	const P = (x, y) => -y
	const Q = (x, y) => x
	const rx = t => Math.cos(t)
	const ry = t => Math.sin(t)
	const result = lineIntegralVector(P, Q, rx, ry, 0, 2 * Math.PI)
	assert.ok(Math.abs(result - 2 * Math.PI) < 1e-2, `expected ~2*pi, got ${result}`)
})

test('lineIntegralVector: conservative field (P=1, Q=0) over straight line depends only on endpoints', () => {
	const P = (x, y) => 1
	const Q = (x, y) => 0
	const rx = t => t
	const ry = t => 0
	const result = lineIntegralVector(P, Q, rx, ry, 0, 5)
	assert.ok(Math.abs(result - 5) < 1e-2, `expected ~5, got ${result}`)
})

test('lineIntegralVector: gradient field of f=xy is path-independent (line vs semicircle, same endpoints)', () => {
	const P = (x, y) => y
	const Q = (x, y) => x
	const straight = lineIntegralVector(P, Q, t => t, t => 0, 0, 1)
	const semicircle = lineIntegralVector(
		P,
		Q,
		t => 0.5 - 0.5 * Math.cos(t),
		t => 0.5 * Math.sin(t),
		0,
		Math.PI
	)
	assert.ok(Math.abs(straight - 0) < 1e-6, `expected 0, got ${straight}`)
	assert.ok(Math.abs(semicircle - 0) < 1e-6, `expected 0, got ${semicircle}`)
})

test('lineIntegralVector: reversing curve direction negates the result', () => {
	const P = (x, y) => -y
	const Q = (x, y) => x
	const forward = lineIntegralVector(P, Q, t => Math.cos(t), t => Math.sin(t), 0, 2 * Math.PI)
	const backward = lineIntegralVector(P, Q, t => Math.cos(t), t => Math.sin(t), 2 * Math.PI, 0)
	assert.ok(Math.abs(forward + backward) < 1e-2, `expected ~0 sum, got ${forward + backward}`)
})

test('lineIntegralVector: zero field gives zero work', () => {
	const P = () => 0
	const Q = () => 0
	const result = lineIntegralVector(P, Q, t => Math.cos(t), t => Math.sin(t), 0, 2 * Math.PI)
	assert.equal(result, 0)
})
