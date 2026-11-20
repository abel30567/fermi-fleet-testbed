import { test } from 'node:test'
import assert from 'node:assert'
import { add, rk4System } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('rk4System solves simple harmonic oscillator and conserves energy', () => {
	const sho = (_t, [x, v]) => [v, -x]
	const atQuarter = rk4System(sho, 0, [1, 0], Math.PI / 2, 100)
	assert.ok(Math.abs(atQuarter[0] - 0) < 1e-8)
	assert.ok(Math.abs(atQuarter[1] - -1) < 1e-8)

	const atFullPeriod = rk4System(sho, 0, [1, 0], 2 * Math.PI, 200)
	assert.ok(Math.abs(atFullPeriod[0] - 1) < 1e-7)
	assert.ok(Math.abs(atFullPeriod[1] - 0) < 1e-7)
	const energy = atFullPeriod[0] ** 2 + atFullPeriod[1] ** 2
	assert.ok(Math.abs(energy - 1) < 1e-7)
})

test('rk4System solves coupled linear exponential system accurately', () => {
	// y0' = y0 + 2*y1, y1' = 2*y0 + y1
	// With y(0) = [1, 0]: y0(t) = 0.5*(e^(3t) + e^(-t)), y1(t) = 0.5*(e^(3t) - e^(-t))
	const system = (_t, [y0, y1]) => [y0 + 2 * y1, 2 * y0 + y1]
	const tEnd = 1
	const result = rk4System(system, 0, [1, 0], tEnd)
	const expected0 = 0.5 * (Math.exp(3 * tEnd) + Math.exp(-tEnd))
	const expected1 = 0.5 * (Math.exp(3 * tEnd) - Math.exp(-tEnd))
	assert.ok(Math.abs(result[0] - expected0) < 1e-6)
	assert.ok(Math.abs(result[1] - expected1) < 1e-6)
})

test('rk4System is exact for degree-3 non-autonomous polynomial system in 1 step', () => {
	// y0' = t, y1' = y0 + t^2 => y0(t) = t^2 / 2, y1(t) = t^3 / 2
	const poly = (t, [y0]) => [t, y0 + t * t]
	const result = rk4System(poly, 0, [0, 0], 2, 1)
	assert.ok(Math.abs(result[0] - 2) < 1e-12)
	assert.ok(Math.abs(result[1] - 4) < 1e-12)
})

test('rk4System supports backward integration and time-reversibility', () => {
	const sho = (_t, [x, v]) => [v, -x]
	const y0 = [2, -1]
	const forward = rk4System(sho, 0, y0, 1.5, 150)
	const back = rk4System(sho, 1.5, forward, 0, 150)
	assert.ok(Math.abs(back[0] - y0[0]) < 1e-8)
	assert.ok(Math.abs(back[1] - y0[1]) < 1e-8)
})

test('rk4System preserves norm for 3D skew-symmetric rotation', () => {
	// dy/dt = omega x y with omega = [0, 0, 1]
	const rot = (_t, [x, y, z]) => [-y, x, 0]
	const y0 = [1, 2, 3]
	const result = rk4System(rot, 0, y0, Math.PI, 200)
	assert.ok(Math.abs(result[0] - -1) < 1e-7)
	assert.ok(Math.abs(result[1] - -2) < 1e-7)
	assert.ok(Math.abs(result[2] - 3) < 1e-12)
	const normSq0 = y0[0] ** 2 + y0[1] ** 2 + y0[2] ** 2
	const normSq1 = result[0] ** 2 + result[1] ** 2 + result[2] ** 2
	assert.ok(Math.abs(normSq1 - normSq0) < 1e-7)
})

test('rk4System handles boundary cases, immutability, and invalid arguments', () => {
	const y0 = [3, 4]
	const sameTime = rk4System((_t, y) => y, 5, y0, 5)
	assert.deepEqual(sameTime, [3, 4])
	assert.notEqual(sameTime, y0)

	const after = rk4System((_t, [a, b]) => [b, a], 0, y0, 1, 50)
	assert.deepEqual(y0, [3, 4])
	assert.equal(after.length, 2)

	assert.deepEqual(rk4System(() => [], 0, [], 1, 10), [])

	assert.throws(() => rk4System(null, 0, [1], 1), TypeError)
	assert.throws(() => rk4System(() => [0], 0, 'bad', 1), TypeError)
	assert.throws(() => rk4System(() => [0], 0, [1], 1, 0), RangeError)
	assert.throws(() => rk4System(() => [0], 0, [1], 1, 2.5), RangeError)
	assert.throws(() => rk4System(() => [0], NaN, [1], 1), RangeError)
})
