import { test } from 'node:test'
import assert from 'node:assert'
import { add, lineIntegralScalar } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('lineIntegralScalar: f=1 along unit circle equals circumference 2*pi', () => {
	const f = () => 1
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const result = lineIntegralScalar(f, rx, ry, 0, 2 * Math.PI)
	assert.ok(Math.abs(result - 2 * Math.PI) < 1e-2)
})

test('lineIntegralScalar: f=1 along straight line equals segment length', () => {
	const f = () => 1
	const rx = (t) => t
	const ry = (t) => 0
	const result = lineIntegralScalar(f, rx, ry, 0, 5)
	assert.ok(Math.abs(result - 5) < 1e-6)
})

test('lineIntegralScalar: f(x,y)=x along unit circle equals 0', () => {
	const f = (x, y) => x
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const result = lineIntegralScalar(f, rx, ry, 0, 2 * Math.PI)
	assert.ok(Math.abs(result - 0) < 1e-2)
})

test('lineIntegralScalar: f(x,y)=x*y along quarter unit circle', () => {
	// integral of cos(t)*sin(t) ds, ds = dt on unit circle, t in [0, pi/2]
	// = [sin^2(t)/2] from 0 to pi/2 = 1/2
	const f = (x, y) => x * y
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const result = lineIntegralScalar(f, rx, ry, 0, Math.PI / 2)
	assert.ok(Math.abs(result - 0.5) < 1e-2)
})

test('lineIntegralScalar: respects custom n parameter', () => {
	const f = () => 1
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const result = lineIntegralScalar(f, rx, ry, 0, 2 * Math.PI, 5000)
	assert.ok(Math.abs(result - 2 * Math.PI) < 1e-3)
})
