import { test } from 'node:test'
import assert from 'node:assert'
import { add, heunODE } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('heunODE: exponential growth dy/dt = y matches Math.E', () => {
	const y = heunODE((_t, y) => y, 0, 1, 1)
	assert.ok(Math.abs(y - Math.E) < 1e-4, `expected ~${Math.E}, got ${y}`)
})

test('heunODE: exact for quadratic solution y(t) = 3t^2 - 2t + 5 in 1 step', () => {
	const y = heunODE((t) => 6 * t - 2, 0, 5, 4, 1)
	const expected = 3 * 16 - 2 * 4 + 5
	assert.ok(Math.abs(y - expected) < 1e-12, `expected ${expected}, got ${y}`)
})

test('heunODE: non-autonomous ODE dy/dt = -2ty matches exp(-t^2)', () => {
	const y = heunODE((t, y) => -2 * t * y, 0, 1, 1.5, 200)
	const expected = Math.exp(-2.25)
	assert.ok(Math.abs(y - expected) < 1e-4, `expected ~${expected}, got ${y}`)
})

test('heunODE: demonstrates second-order O(h^2) convergence', () => {
	const f = (_t, y) => y
	const err10 = Math.abs(heunODE(f, 0, 1, 1, 10) - Math.E)
	const err20 = Math.abs(heunODE(f, 0, 1, 1, 20) - Math.E)
	const ratio = err10 / err20
	assert.ok(ratio > 3.8 && ratio < 4.3, `expected ~4x error reduction, got ${ratio}`)
})

test('heunODE: supports backward integration (tEnd < t0)', () => {
	const y = heunODE((_t, y) => y, 1, Math.E, 0, 100)
	assert.ok(Math.abs(y - 1) < 1e-4, `expected ~1, got ${y}`)
})

test('heunODE: boundary tEnd === t0 returns y0 unchanged', () => {
	let calls = 0
	const y = heunODE(() => {
		calls++
		return 42
	}, 2, -7.5, 2, 50)
	assert.equal(y, -7.5)
	assert.equal(calls, 0)
})

test('heunODE: validates invalid arguments', () => {
	assert.throws(() => heunODE(null, 0, 1, 1), TypeError)
	assert.throws(() => heunODE((_t, y) => y, 0, 1, 1, 0), RangeError)
	assert.throws(() => heunODE((_t, y) => y, 0, 1, 1, -5), RangeError)
	assert.throws(() => heunODE((_t, y) => y, 0, 1, 1, 1.5), RangeError)
	assert.throws(() => heunODE((_t, y) => y, NaN, 1, 1), RangeError)
	assert.throws(() => heunODE((_t, y) => y, 0, Infinity, 1), RangeError)
})
