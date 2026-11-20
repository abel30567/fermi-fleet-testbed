import { test } from 'node:test'
import assert from 'node:assert'
import { add, curvature3D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('curvature3D: straight line has zero curvature', () => {
	const line = (t) => [1 + 2 * t, -3 + 4 * t, 5 - t]
	assert.ok(Math.abs(curvature3D(line, 0)) < 1e-6)
	assert.ok(Math.abs(curvature3D(line, 3.5)) < 1e-6)
})

test('curvature3D: circle of radius R has constant curvature 1/R', () => {
	const R = 5
	const circle = (t) => [R * Math.cos(t), R * Math.sin(t), 2]
	for (const t of [0, Math.PI / 4, 1.7, -2.3]) {
		assert.ok(Math.abs(curvature3D(circle, t) - 1 / R) < 1e-6)
	}
})

test('curvature3D: circular helix matches analytical formula a / (a^2 + b^2)', () => {
	const a = 3
	const b = 4
	const expected = a / (a * a + b * b)
	const helix = (t) => [a * Math.cos(t), a * Math.sin(t), b * t]
	for (const t of [-1.2, 0, 2.5]) {
		assert.ok(Math.abs(curvature3D(helix, t) - expected) < 1e-6)
	}
})

test('curvature3D: twisted cubic matches exact formula at multiple points', () => {
	const twistedCubic = (t) => [t, t * t, t * t * t]
	const exact = (t) =>
		(2 * Math.sqrt(9 * t ** 4 + 9 * t ** 2 + 1)) /
		Math.pow(1 + 4 * t ** 2 + 9 * t ** 4, 1.5)

	for (const t of [0, 0.5, 1, -1.5]) {
		assert.ok(Math.abs(curvature3D(twistedCubic, t) - exact(t)) < 1e-5)
	}
})

test('curvature3D: invariant under reparameterization and scales inversely with curve scale', () => {
	const base = (t) => [Math.cos(t), Math.sin(t), 0.5 * t]
	const reparam = (u) => base(u * u * u + u)
	const u = 0.8
	const t = u * u * u + u

	const kBase = curvature3D(base, t)
	const kReparam = curvature3D(reparam, u)
	assert.ok(Math.abs(kBase - kReparam) < 1e-5)

	const scale = 3.5
	const scaled = (s) => base(s).map((v) => v * scale)
	const kScaled = curvature3D(scaled, t)
	assert.ok(Math.abs(kScaled - kBase / scale) < 1e-6)
})

test('curvature3D: custom step size h and boundary/invalid input handling', () => {
	const circle = (t) => [Math.cos(t), Math.sin(t), 0]
	assert.ok(Math.abs(curvature3D(circle, 0.5, 1e-5) - 1) < 1e-5)

	const constantPoint = () => [1, 2, 3]
	assert.ok(Number.isNaN(curvature3D(constantPoint, 0)))

	assert.throws(() => curvature3D('not-a-fn', 0), TypeError)
	assert.throws(() => curvature3D(circle, Number.NaN), TypeError)
	assert.throws(() => curvature3D(circle, 0, 0), RangeError)
	assert.throws(() => curvature3D(circle, 0, -1e-4), RangeError)
	assert.throws(() => curvature3D(() => [1, 2], 0), TypeError)
})
