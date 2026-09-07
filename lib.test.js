import { test } from 'node:test'
import assert from 'node:assert'
import { add, fluxThroughCurve } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('fluxThroughCurve: P=x, Q=y across unit circle ~ 2*pi', () => {
	const P = (x, y) => x
	const Q = (x, y) => y
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const flux = fluxThroughCurve(P, Q, rx, ry, 0, 2 * Math.PI)
	assert.ok(Math.abs(flux - 2 * Math.PI) < 1e-2, `expected ~2*pi, got ${flux}`)
})

test('fluxThroughCurve: P=x, Q=y across circle of radius r scales as 2*pi*r^2', () => {
	const r = 3
	const P = (x, y) => x
	const Q = (x, y) => y
	const rx = (t) => r * Math.cos(t)
	const ry = (t) => r * Math.sin(t)
	const flux = fluxThroughCurve(P, Q, rx, ry, 0, 2 * Math.PI)
	const expected = 2 * Math.PI * r * r
	assert.ok(Math.abs(flux - expected) < 1e-1, `expected ~${expected}, got ${flux}`)
})

test('fluxThroughCurve: constant field has zero flux across closed curve', () => {
	const P = (x, y) => 5
	const Q = (x, y) => -3
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const flux = fluxThroughCurve(P, Q, rx, ry, 0, 2 * Math.PI)
	assert.ok(Math.abs(flux) < 1e-2, `expected ~0, got ${flux}`)
})

test('fluxThroughCurve: zero field gives zero flux', () => {
	const P = () => 0
	const Q = () => 0
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const flux = fluxThroughCurve(P, Q, rx, ry, 0, 2 * Math.PI)
	assert.equal(flux, 0)
})

test('fluxThroughCurve: respects custom n parameter', () => {
	const P = (x, y) => x
	const Q = (x, y) => y
	const rx = (t) => Math.cos(t)
	const ry = (t) => Math.sin(t)
	const flux = fluxThroughCurve(P, Q, rx, ry, 0, 2 * Math.PI, 5000)
	assert.ok(Math.abs(flux - 2 * Math.PI) < 1e-2, `expected ~2*pi, got ${flux}`)
})
