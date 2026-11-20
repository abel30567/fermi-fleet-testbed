import { test } from 'node:test'
import assert from 'node:assert'
import { add, curveSpeed } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('curveSpeed: 2D circle and 3D helix have constant exact speeds', () => {
	const circle = (t) => [3 * Math.cos(2 * t), 3 * Math.sin(2 * t)]
	for (const t of [0, 0.7, Math.PI / 3, -2.5]) {
		assert.ok(Math.abs(curveSpeed(circle, t) - 6) < 1e-8)
	}

	const helix = (t) => [4 * Math.cos(t), 4 * Math.sin(t), 3 * t]
	for (const t of [-1.2, 0, 2.3]) {
		assert.ok(Math.abs(curveSpeed(helix, t) - 5) < 1e-8)
	}
})

test("curveSpeed: twisted cubic and 1D curve match analytical |r'(t)|", () => {
	const twistedCubic = (t) => [t, t * t, t * t * t]
	for (const t of [-2, -0.5, 0, 1.5, 3]) {
		const expected = Math.sqrt(1 + 4 * t * t + 9 * t ** 4)
		assert.ok(Math.abs(curveSpeed(twistedCubic, t) - expected) < 1e-7)
	}

	const oneD = (t) => [Math.sin(t) + t ** 2]
	const expected1D = Math.abs(Math.cos(1.2) + 2 * 1.2)
	assert.ok(Math.abs(curveSpeed(oneD, 1.2) - expected1D) < 1e-8)
})

test('curveSpeed: n-dimensional linear motion and constant curve', () => {
	const v = [1, -2, 3, -4, 5]
	const p0 = [10, -20, 30, -40, 50]
	const line5D = (t) => p0.map((c, i) => c + v[i] * t)
	const expected = Math.hypot(...v)
	assert.ok(Math.abs(curveSpeed(line5D, 4.2) - expected) < 1e-8)

	const constant = () => [7, -3, 0, 12]
	assert.equal(curveSpeed(constant, 1.5), 0)
})

test('curveSpeed: scaling and reparametrization identities', () => {
	const r = (t) => [Math.exp(0.5 * t), Math.sin(t), Math.cos(2 * t), t * t]
	const t = 0.8
	const c = -3.5
	const k = 2.4

	const baseSpeed = curveSpeed(r, t)
	const scaledCurve = (u) => r(u).map((x) => c * x)
	assert.ok(Math.abs(curveSpeed(scaledCurve, t) - Math.abs(c) * baseSpeed) < 1e-7)

	const reparam = (u) => r(k * u)
	assert.ok(Math.abs(curveSpeed(reparam, t) - Math.abs(k) * curveSpeed(r, k * t)) < 1e-7)
})

test('curveSpeed: custom h, typed arrays, empty dimension, and large magnitude stability', () => {
	const typed = (t) => new Float64Array([Math.cos(t), Math.sin(t)])
	assert.ok(Math.abs(curveSpeed(typed, 0.5, 1e-5) - 1) < 1e-8)

	const empty = () => []
	assert.equal(curveSpeed(empty, 0), 0)

	const large = (t) => [1e200 * t, 1e200 * t]
	const speed = curveSpeed(large, 1, 1e-4)
	assert.ok(Number.isFinite(speed))
	assert.ok(Math.abs(speed / (Math.SQRT2 * 1e200) - 1) < 1e-8)
})

test('curveSpeed: validates invalid inputs', () => {
	const valid = (t) => [t]
	assert.throws(() => curveSpeed('not-a-fn', 0), TypeError)
	assert.throws(() => curveSpeed(valid, NaN), TypeError)
	assert.throws(() => curveSpeed(valid, Infinity), TypeError)
	assert.throws(() => curveSpeed(valid, 0, 0), RangeError)
	assert.throws(() => curveSpeed(valid, 0, -1e-6), RangeError)
	assert.throws(() => curveSpeed(() => 42, 0), TypeError)
	assert.throws(() => curveSpeed((t) => (t > 0 ? [1, 2] : [1]), 0), RangeError)
	assert.throws(() => curveSpeed(() => [NaN], 0), TypeError)
})
