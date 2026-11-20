import { test } from 'node:test'
import assert from 'node:assert'
import { add, curvature2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('curvature2D of a circle equals 1/R regardless of t or orientation', () => {
	const R = 4
	const ccw = curvature2D((t) => R * Math.cos(t), (t) => R * Math.sin(t), 1.2)
	const cw = curvature2D((t) => R * Math.cos(-t), (t) => R * Math.sin(-t), 1.2)
	assert.ok(Math.abs(ccw - 1 / R) < 1e-6, `expected ~${1 / R}, got ${ccw}`)
	assert.ok(Math.abs(cw - 1 / R) < 1e-6, `expected ~${1 / R}, got ${cw}`)
})

test('curvature2D of a straight line is zero', () => {
	const k = curvature2D((t) => 3 * t - 5, (t) => -4 * t + 2, 2.5)
	assert.ok(Math.abs(k) < 1e-10, `expected 0, got ${k}`)
})

test('curvature2D of a parabola y = x^2 matches exact formula', () => {
	const rx = (t) => t
	const ry = (t) => t * t
	const k0 = curvature2D(rx, ry, 0)
	const k1 = curvature2D(rx, ry, 1)
	const expected1 = 2 / Math.pow(5, 1.5)
	assert.ok(Math.abs(k0 - 2) < 1e-6, `expected 2, got ${k0}`)
	assert.ok(Math.abs(k1 - expected1) < 1e-6, `expected ${expected1}, got ${k1}`)
})

test('curvature2D of an ellipse matches a/b^2 and b/a^2 at vertices', () => {
	const a = 5
	const b = 2
	const rx = (t) => a * Math.cos(t)
	const ry = (t) => b * Math.sin(t)
	const k0 = curvature2D(rx, ry, 0)
	const kHalfPi = curvature2D(rx, ry, Math.PI / 2)
	assert.ok(Math.abs(k0 - a / (b * b)) < 1e-5, `expected ${a / (b * b)}, got ${k0}`)
	assert.ok(Math.abs(kHalfPi - b / (a * a)) < 1e-6, `expected ${b / (a * a)}, got ${kHalfPi}`)
})

test('curvature2D is invariant under reparametrization and scales as 1/c', () => {
	const rx = (t) => Math.cos(t * t * t + t)
	const ry = (t) => Math.sin(t * t * t + t)
	const kReparam = curvature2D(rx, ry, 0.5)
	assert.ok(Math.abs(kReparam - 1) < 1e-5, `expected 1, got ${kReparam}`)

	const c = 3
	const kBase = curvature2D((t) => t, (t) => Math.sin(t), 0.7, 1e-4)
	const kScaled = curvature2D((t) => c * t, (t) => c * Math.sin(t), 0.7, 1e-4)
	assert.ok(Math.abs(kScaled - kBase / c) < 1e-6, `expected ${kBase / c}, got ${kScaled}`)
})

test('curvature2D validates inputs and throws on zero velocity', () => {
	assert.throws(() => curvature2D(null, (t) => t, 0), TypeError)
	assert.throws(() => curvature2D((t) => t, 'not-a-fn', 0), TypeError)
	assert.throws(() => curvature2D((t) => t, (t) => t, NaN), RangeError)
	assert.throws(() => curvature2D((t) => t, (t) => t, 0, 0), RangeError)
	assert.throws(() => curvature2D((t) => t, (t) => t, 0, -1e-4), RangeError)
	assert.throws(() => curvature2D(() => 5, () => 3, 1), RangeError)
})
