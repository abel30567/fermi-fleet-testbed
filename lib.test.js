import { test } from 'node:test'
import assert from 'node:assert'
import { add, normalVector3D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertVecClose(actual, expected, tol = 1e-6) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`component ${i}: expected ${expected[i]}, got ${actual[i]} (diff ${Math.abs(actual[i] - expected[i])})`
		)
	}
}

test('normalVector3D on unit circle points radially inward', () => {
	const circle = (t) => [Math.cos(t), Math.sin(t), 0]
	for (const t of [0, Math.PI / 4, Math.PI / 2, 2.3]) {
		const n = normalVector3D(circle, t)
		assertVecClose(n, [-Math.cos(t), -Math.sin(t), 0])
	}
})

test('normalVector3D on circular helix is inward horizontal independent of pitch', () => {
	const R = 3.5
	const c = 2.0
	const helix = (t) => [R * Math.cos(t), R * Math.sin(t), c * t]
	for (const t of [0, 0.7, Math.PI, -1.25]) {
		const n = normalVector3D(helix, t)
		assertVecClose(n, [-Math.cos(t), -Math.sin(t), 0])
	}
})

test('normalVector3D is invariant under non-constant-speed reparameterization', () => {
	const r = (t) => [Math.cos(t * t), Math.sin(t * t), 0]
	const t = 1.5
	const n = normalVector3D(r, t)
	assertVecClose(n, [-Math.cos(t * t), -Math.sin(t * t), 0], 1e-5)
})

test('normalVector3D matches analytic twisted cubic and satisfies Frenet-Serret identities', () => {
	const cubic = (t) => [t, t * t, t * t * t]
	const t = 1
	const n = normalVector3D(cubic, t)
	const denom = Math.sqrt(266)
	assertVecClose(n, [-11 / denom, -8 / denom, 9 / denom], 1e-6)

	// Unit length and orthogonality to tangent vector T(t)
	const norm = Math.hypot(n[0], n[1], n[2])
	assert.ok(Math.abs(norm - 1) <= 1e-12)

	const tangent = [1, 2, 3]
	const dot = n[0] * tangent[0] + n[1] * tangent[1] + n[2] * tangent[2]
	assert.ok(Math.abs(dot) <= 1e-6)
})

test('normalVector3D works on tilted 3D circle and supports custom step h', () => {
	// Orthonormal basis u, v spanning a tilted plane in R^3
	const u = [1 / Math.sqrt(2), 1 / Math.sqrt(2), 0]
	const v = [-1 / Math.sqrt(6), 1 / Math.sqrt(6), 2 / Math.sqrt(6)]
	const r = (t) => [
		2 + 3 * (Math.cos(t) * u[0] + Math.sin(t) * v[0]),
		-1 + 3 * (Math.cos(t) * u[1] + Math.sin(t) * v[1]),
		4 + 3 * (Math.cos(t) * u[2] + Math.sin(t) * v[2])
	]
	const t = 1.1
	const expected = [
		-(Math.cos(t) * u[0] + Math.sin(t) * v[0]),
		-(Math.cos(t) * u[1] + Math.sin(t) * v[1]),
		-(Math.cos(t) * u[2] + Math.sin(t) * v[2])
	]
	assertVecClose(normalVector3D(r, t, 1e-5), expected, 1e-5)
})

test('normalVector3D throws on zero curvature, singular points, and invalid inputs', () => {
	// Straight line (zero curvature)
	assert.throws(() => normalVector3D((t) => [1 + 2 * t, 3 - 4 * t, 5 + 0.3 * t], 1.2))
	// Inflection point (zero curvature at t = 0)
	assert.throws(() => normalVector3D((t) => [t, t * t * t, 0], 0))
	// Stationary / singular points (zero speed)
	assert.throws(() => normalVector3D(() => [1, 2, 3], 0))
	assert.throws(() => normalVector3D((t) => [t * t, t * t * t * t, 0], 0))
	// Invalid arguments
	assert.throws(() => normalVector3D('not-a-fn', 0), TypeError)
	assert.throws(() => normalVector3D((t) => [t, t * t, 0], NaN), TypeError)
	assert.throws(() => normalVector3D((t) => [t, t * t, 0], 1, 0), RangeError)
	assert.throws(() => normalVector3D((t) => [t, t * t, 0], 1, -1e-4), RangeError)
	assert.throws(() => normalVector3D(() => [1, 2], 0), TypeError)
})
