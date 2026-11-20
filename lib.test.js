import { test } from 'node:test'
import assert from 'node:assert'
import { add, binormalVector3D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertVecClose(actual, expected, tol = 1e-6) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`Component ${i}: expected ${expected[i]}, got ${actual[i]} (diff ${Math.abs(actual[i] - expected[i])})`
		)
	}
}

test('binormalVector3D: circle in XY plane has constant +/-z binormal', () => {
	const ccwCircle = (t) => [Math.cos(t), Math.sin(t), 0]
	const cwCircle = (t) => [Math.cos(t), -Math.sin(t), 0]

	for (const t of [0, Math.PI / 4, Math.PI / 2, 2.3]) {
		assertVecClose(binormalVector3D(ccwCircle, t), [0, 0, 1])
		assertVecClose(binormalVector3D(cwCircle, t), [0, 0, -1])
	}
})

test('binormalVector3D: circular helix matches analytic formula', () => {
	const a = 3
	const b = 4
	const norm = Math.hypot(a, b)
	const helix = (t) => [a * Math.cos(t), a * Math.sin(t), b * t]

	for (const t of [0, Math.PI / 6, Math.PI / 2, -1.2]) {
		const expected = [(b * Math.sin(t)) / norm, (-b * Math.cos(t)) / norm, a / norm]
		assertVecClose(binormalVector3D(helix, t), expected)
	}
})

test('binormalVector3D: twisted cubic curve at t = 0 and t = 1', () => {
	const twistedCubic = (t) => [t, t * t, t * t * t]

	assertVecClose(binormalVector3D(twistedCubic, 0), [0, 0, 1])

	const s19 = Math.sqrt(19)
	assertVecClose(binormalVector3D(twistedCubic, 1), [3 / s19, -3 / s19, 1 / s19])
})

test('binormalVector3D: Frenet-Serret identities (unit length, orthogonality, right-handedness)', () => {
	const curve = (t) => [Math.cos(t), Math.sin(t), 0.5 * t * t]
	const t = 1.1
	const B = binormalVector3D(curve, t)

	const normB = Math.hypot(B[0], B[1], B[2])
	assert.ok(Math.abs(normB - 1) < 1e-12, `Expected unit length, got ${normB}`)

	// Analytic r'(t) and r''(t)
	const rp = [-Math.sin(t), Math.cos(t), t]
	const rpp = [-Math.cos(t), -Math.sin(t), 1]

	const dotRp = B[0] * rp[0] + B[1] * rp[1] + B[2] * rp[2]
	const dotRpp = B[0] * rpp[0] + B[1] * rpp[1] + B[2] * rpp[2]
	assert.ok(Math.abs(dotRp) < 1e-6, `Expected B·r' ≈ 0, got ${dotRp}`)
	assert.ok(Math.abs(dotRpp) < 1e-6, `Expected B·r'' ≈ 0, got ${dotRpp}`)

	// Right-handed orientation: (r' × r'') · B > 0
	const cross = [
		rp[1] * rpp[2] - rp[2] * rpp[1],
		rp[2] * rpp[0] - rp[0] * rpp[2],
		rp[0] * rpp[1] - rp[1] * rpp[0],
	]
	const triple = cross[0] * B[0] + cross[1] * B[1] + cross[2] * B[2]
	assert.ok(triple > 0, `Expected positive orientation, got ${triple}`)
})

test('binormalVector3D: reparameterization invariance and orientation reversal', () => {
	const helix = (u) => [2 * Math.cos(u), 2 * Math.sin(u), 1.5 * u]
	const phi = (t) => t * t + t
	const reparam = (t) => helix(phi(t))
	const reversed = (t) => helix(-t)

	const t = 0.7
	const bOrig = binormalVector3D(helix, phi(t))
	const bReparam = binormalVector3D(reparam, t)
	assertVecClose(bReparam, bOrig, 1e-5)

	const bForward = binormalVector3D(helix, t)
	const bBackward = binormalVector3D(reversed, -t)
	assertVecClose(bBackward, [-bForward[0], -bForward[1], -bForward[2]])
})

test('binormalVector3D: custom step size h and tilted planar curve', () => {
	// Circle in the plane x + y + z = 0 using orthonormal basis u, v
	const u = [1 / Math.sqrt(2), -1 / Math.sqrt(2), 0]
	const v = [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)]
	const tiltedCircle = (t) => [
		Math.cos(t) * u[0] + Math.sin(t) * v[0],
		Math.cos(t) * u[1] + Math.sin(t) * v[1],
		Math.cos(t) * u[2] + Math.sin(t) * v[2],
	]
	const expectedNormal = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]
	assertVecClose(binormalVector3D(tiltedCircle, 0.9, 1e-5), expectedNormal)
})

test('binormalVector3D: throws on degenerate curves and invalid inputs', () => {
	const line = (t) => [1 + 2 * t, -3 + 4 * t, 5 - t]
	assert.throws(() => binormalVector3D(line, 1.3), /curvature/i)

	const constant = () => [1, 2, 3]
	assert.throws(() => binormalVector3D(constant, 0), /velocity/i)

	const helix = (t) => [Math.cos(t), Math.sin(t), t]
	assert.throws(() => binormalVector3D(null, 0), TypeError)
	assert.throws(() => binormalVector3D(helix, Number.NaN), RangeError)
	assert.throws(() => binormalVector3D(helix, 0, 0), RangeError)
	assert.throws(() => binormalVector3D(helix, 0, -1e-4), RangeError)
	assert.throws(() => binormalVector3D(() => [1, 2], 0), TypeError)
	assert.throws(() => binormalVector3D(() => [1, Number.NaN, 3], 0), TypeError)
})
