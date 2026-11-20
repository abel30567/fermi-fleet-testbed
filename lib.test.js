import { test } from 'node:test'
import assert from 'node:assert'
import { add, eulerODE } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('eulerODE is exact for constant derivative dy/dt = c', () => {
	const result = eulerODE(() => 3, 0, 2, 5, 10)
	assert.ok(Math.abs(result - 17) < 1e-12)
})

test('eulerODE matches exact algebraic Euler identity for dy/dt = y', () => {
	const steps = 100
	const result = eulerODE((_t, y) => y, 0, 1, 1)
	const expected = (1 + 1 / steps) ** steps
	assert.ok(Math.abs(result - expected) < 1e-12)
	const highRes = eulerODE((_t, y) => y, 0, 1, 1, 10000)
	assert.ok(Math.abs(highRes - Math.E) < 1e-3)
})

test('eulerODE solves exponential decay dy/dt = -y', () => {
	const result = eulerODE((_t, y) => -y, 0, 1, 1, 1000)
	assert.ok(Math.abs(result - Math.exp(-1)) < 1e-3)
})

test('eulerODE solves time-dependent ODE dy/dt = 2t with exact step-sum identity', () => {
	const steps = 200
	const tEnd = 3
	const result = eulerODE((t) => 2 * t, 0, 0, tEnd, steps)
	const expected = tEnd * tEnd * (1 - 1 / steps)
	assert.ok(Math.abs(result - expected) < 1e-12)
})

test('eulerODE supports backward integration when tEnd < t0', () => {
	const linearBack = eulerODE(() => 2, 5, 10, 2, 30)
	assert.ok(Math.abs(linearBack - 4) < 1e-12)
	const expBack = eulerODE((_t, y) => y, 1, Math.E, 0, 1000)
	assert.ok(Math.abs(expBack - 1) < 1e-2)
})

test('eulerODE handles boundary cases tEnd === t0 and single step', () => {
	assert.equal(eulerODE(() => 999, 2, 7.5, 2), 7.5)
	const singleStep = eulerODE((t, y) => t + y, 1, 2, 3, 1)
	assert.equal(singleStep, 2 + 2 * (1 + 2))
})

test('eulerODE validates arguments and throws on invalid inputs', () => {
	assert.throws(() => eulerODE(null, 0, 1, 1), TypeError)
	assert.throws(() => eulerODE(() => 1, Number.NaN, 1, 1), TypeError)
	assert.throws(() => eulerODE(() => 1, 0, Number.POSITIVE_INFINITY, 1), TypeError)
	assert.throws(() => eulerODE(() => 1, 0, 1, 1, 0), RangeError)
	assert.throws(() => eulerODE(() => 1, 0, 1, 1, -5), RangeError)
	assert.throws(() => eulerODE(() => 1, 0, 1, 1, 2.5), RangeError)
})
