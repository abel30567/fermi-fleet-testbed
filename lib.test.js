import { test } from 'node:test'
import assert from 'node:assert'
import { add, rk4ODE } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('rk4ODE solves exponential growth dy/dt = y accurately', () => {
	const result = rk4ODE((_t, y) => y, 0, 1, 1)
	assert.ok(Math.abs(result - Math.E) < 1e-9, `expected ~${Math.E}, got ${result}`)
})

test('rk4ODE is exact for cubic derivative polynomial even in a single step', () => {
	// dy/dt = 4t^3 => y(t) = t^4 + 1, so y(2) = 17
	const result = rk4ODE((t) => 4 * t ** 3, 0, 1, 2, 1)
	assert.ok(Math.abs(result - 17) < 1e-12, `expected 17, got ${result}`)
})

test('rk4ODE solves nonlinear logistic ODE dy/dt = y(1 - y)', () => {
	const tEnd = 2
	const expected = 1 / (1 + Math.exp(-tEnd))
	const result = rk4ODE((_t, y) => y * (1 - y), 0, 0.5, tEnd, 100)
	assert.ok(Math.abs(result - expected) < 1e-9, `expected ${expected}, got ${result}`)
})

test('rk4ODE solves non-autonomous ODE dy/dt = y - t^2 + 1', () => {
	// Exact solution: y(t) = (t + 1)^2 - 0.5 * exp(t)
	const tEnd = 2
	const expected = (tEnd + 1) ** 2 - 0.5 * Math.exp(tEnd)
	const result = rk4ODE((t, y) => y - t * t + 1, 0, 0.5, tEnd, 100)
	assert.ok(Math.abs(result - expected) < 1e-7, `expected ${expected}, got ${result}`)
})

test('rk4ODE exhibits 4th-order convergence rate when halving step size', () => {
	const err10 = Math.abs(rk4ODE((_t, y) => y, 0, 1, 1, 10) - Math.E)
	const err20 = Math.abs(rk4ODE((_t, y) => y, 0, 1, 1, 20) - Math.E)
	const ratio = err10 / err20
	assert.ok(ratio > 15 && ratio < 17, `expected ~16x error reduction, got ${ratio}`)
})

test('rk4ODE handles zero interval and backward time-reversal symmetry', () => {
	assert.equal(rk4ODE((_t, y) => y, 3, 42, 3), 42)
	const f = (t, y) => -2 * t * y
	const y1 = rk4ODE(f, 0, 1, 1, 100)
	assert.ok(Math.abs(y1 - Math.exp(-1)) < 1e-9)
	const yBack = rk4ODE(f, 1, y1, 0, 100)
	assert.ok(Math.abs(yBack - 1) < 1e-8, `expected ~1 after reversal, got ${yBack}`)
})

test('rk4ODE supports vector ODE systems (harmonic oscillator energy conservation)', () => {
	// y1' = y2, y2' = -y1 with y(0) = [1, 0] => y(t) = [cos(t), -sin(t)]
	const [y1, y2] = rk4ODE((_t, [u, v]) => [v, -u], 0, [1, 0], Math.PI / 2, 200)
	assert.ok(Math.abs(y1 - 0) < 1e-8, `expected cos(pi/2) ~ 0, got ${y1}`)
	assert.ok(Math.abs(y2 - -1) < 1e-8, `expected -sin(pi/2) ~ -1, got ${y2}`)
	assert.ok(Math.abs(y1 * y1 + y2 * y2 - 1) < 1e-8)
})

test('rk4ODE validates arguments', () => {
	assert.throws(() => rk4ODE(null, 0, 1, 1), TypeError)
	assert.throws(() => rk4ODE((_t, y) => y, NaN, 1, 1), TypeError)
	assert.throws(() => rk4ODE((_t, y) => y, 0, Infinity, 1), TypeError)
	assert.throws(() => rk4ODE((_t, y) => y, 0, 1, 1, 0), RangeError)
	assert.throws(() => rk4ODE((_t, y) => y, 0, 1, 1, -5), RangeError)
	assert.throws(() => rk4ODE((_t, y) => y, 0, 1, 1, 1.5), RangeError)
})
