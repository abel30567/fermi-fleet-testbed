import { test } from 'node:test'
import assert from 'node:assert'
import { add, tangentVector3D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertVecClose(actual, expected, tol = 1e-8) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`component ${i}: expected ${expected[i]}, got ${actual[i]}`
		)
	}
}

test('tangentVector3D: straight line in 3D', () => {
	const line = (t) => [1 + 3 * t, -2 + 4 * t, 5 + 12 * t]
	const T = tangentVector3D(line, 2.5)
	assertVecClose(T, [3 / 13, 4 / 13, 12 / 13])
	assert.ok(Math.abs(Math.hypot(...T) - 1) <= 1e-12)
})

test('tangentVector3D: circular helix', () => {
	const helix = (t) => [Math.cos(t), Math.sin(t), t]
	for (const t of [0, Math.PI / 4, Math.PI / 2, 2.1]) {
		const T = tangentVector3D(helix, t)
		const expected = [-Math.sin(t) / Math.SQRT2, Math.cos(t) / Math.SQRT2, 1 / Math.SQRT2]
		assertVecClose(T, expected)
		assert.ok(Math.abs(Math.hypot(...T) - 1) <= 1e-12)
	}
})

test('tangentVector3D: twisted cubic curve', () => {
	const cubic = (t) => [t, t * t, t * t * t]
	const t = 2
	const norm = Math.hypot(1, 2 * t, 3 * t * t)
	const T = tangentVector3D(cubic, t)
	assertVecClose(T, [1 / norm, (2 * t) / norm, (3 * t * t) / norm])
})

test('tangentVector3D: mathematical identities (unit norm, orthogonality on sphere, reparameterization)', () => {
	const circle = (t) => [3 * Math.cos(t), 3 * Math.sin(t), 0]
	const t = 1.23
	const pos = circle(t)
	const T = tangentVector3D(circle, t)
	const dot = pos[0] * T[0] + pos[1] * T[1] + pos[2] * T[2]
	assert.ok(Math.abs(dot) <= 1e-8)
	assert.ok(Math.abs(Math.hypot(...T) - 1) <= 1e-12)

	const curve = (s) => [Math.cos(s), Math.sin(s), 0.5 * s * s]
	const reparamPos = (u) => curve(Math.exp(u))
	const u = 0.7
	assertVecClose(tangentVector3D(reparamPos, u), tangentVector3D(curve, Math.exp(u)), 1e-7)

	const reparamNeg = (u) => curve(-2 * u)
	const tPos = tangentVector3D(curve, -2 * u)
	const tNeg = tangentVector3D(reparamNeg, u)
	assertVecClose(tNeg, [-tPos[0], -tPos[1], -tPos[2]], 1e-7)
})

test('tangentVector3D: custom step size h', () => {
	const curve = (t) => [Math.sin(t), Math.cos(t), Math.sin(2 * t)]
	const t = 0.5
	const dx = Math.cos(t)
	const dy = -Math.sin(t)
	const dz = 2 * Math.cos(2 * t)
	const norm = Math.hypot(dx, dy, dz)
	assertVecClose(tangentVector3D(curve, t, 1e-5), [dx / norm, dy / norm, dz / norm], 1e-8)
})

test('tangentVector3D: boundary and invalid inputs throw errors', () => {
	assert.throws(() => tangentVector3D(() => [1, 2, 3], 0), RangeError)
	assert.throws(() => tangentVector3D((t) => [t * t, t * t, t * t], 0), RangeError)
	assert.throws(() => tangentVector3D(null, 0), TypeError)
	assert.throws(() => tangentVector3D((t) => [t, 0, 0], NaN), TypeError)
	assert.throws(() => tangentVector3D((t) => [t, 0, 0], Infinity), TypeError)
	assert.throws(() => tangentVector3D((t) => [t, 0, 0], 1, 0), RangeError)
	assert.throws(() => tangentVector3D((t) => [t, 0, 0], 1, -1e-6), RangeError)
	assert.throws(() => tangentVector3D((t) => [t, 0], 1), TypeError)
	assert.throws(() => tangentVector3D(() => [NaN, 0, 0], 1), RangeError)
})
