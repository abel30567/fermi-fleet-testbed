import { test } from 'node:test'
import assert from 'node:assert'
import { add, torsion3D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('torsion3D: circular helix has constant torsion b / (a^2 + b^2)', () => {
	const a = 2
	const b = 3
	const helix = (t) => [a * Math.cos(t), a * Math.sin(t), b * t]
	const expected = b / (a * a + b * b)

	for (const t of [0, 0.7, Math.PI / 2, 2.5]) {
		const tau = torsion3D(helix, t)
		assert.ok(Math.abs(tau - expected) < 1e-5, `at t=${t}: got ${tau}, expected ${expected}`)
	}
})

test('torsion3D: left-handed helix negates torsion (chirality)', () => {
	const a = 1.5
	const b = 2.5
	const rightHelix = (t) => [a * Math.cos(t), a * Math.sin(t), b * t]
	const leftHelix = (t) => [a * Math.cos(t), a * Math.sin(t), -b * t]

	const tauRight = torsion3D(rightHelix, 1.0)
	const tauLeft = torsion3D(leftHelix, 1.0)
	const expected = b / (a * a + b * b)

	assert.ok(Math.abs(tauRight - expected) < 1e-5)
	assert.ok(Math.abs(tauLeft + expected) < 1e-5)
	assert.ok(Math.abs(tauRight + tauLeft) < 1e-6)
})

test('torsion3D: planar curves have zero torsion', () => {
	const circleXY = (t) => [Math.cos(t), Math.sin(t), 0]
	const tiltedCircle = (t) => [
		Math.cos(t),
		Math.sin(t) * Math.SQRT1_2,
		Math.sin(t) * Math.SQRT1_2 + 5,
	]
	const planarParabola = (t) => [t, t * t, 2 * t - 3 * t * t + 1]

	assert.ok(Math.abs(torsion3D(circleXY, 0.5)) < 1e-6)
	assert.ok(Math.abs(torsion3D(tiltedCircle, 1.2)) < 1e-5)
	assert.ok(Math.abs(torsion3D(planarParabola, 0.8)) < 1e-5)
})

test('torsion3D: twisted cubic [t, t^2, t^3] matches analytic formula 3 / (9t^4 + 9t^2 + 1)', () => {
	const twistedCubic = (t) => [t, t * t, t * t * t]
	const analytic = (t) => 3 / (9 * t ** 4 + 9 * t ** 2 + 1)

	for (const t of [0, 0.5, 1, -1.5]) {
		const tau = torsion3D(twistedCubic, t)
		const expected = analytic(t)
		assert.ok(Math.abs(tau - expected) < 1e-5, `at t=${t}: got ${tau}, expected ${expected}`)
	}
})

test('torsion3D: scaling and orientation-preserving reparametrization identities', () => {
	const base = (t) => [Math.cos(t), Math.sin(t), 0.5 * t]
	const scale = 4
	const scaled = (t) => {
		const [x, y, z] = base(t)
		return [scale * x, scale * y, scale * z]
	}

	const tauBase = torsion3D(base, 1.0)
	const tauScaled = torsion3D(scaled, 1.0)
	assert.ok(Math.abs(tauScaled - tauBase / scale) < 1e-5)

	const s = 1.2
	const t = s * s + s
	const reparam = (u) => base(u * u + u)
	const tauReparam = torsion3D(reparam, s, 1e-3)
	const tauAtT = torsion3D(base, t, 1e-3)
	assert.ok(Math.abs(tauReparam - tauAtT) < 1e-4)
})

test('torsion3D: degenerate zero-curvature straight line and invalid inputs', () => {
	const line = (t) => [t, 0, 0]
	assert.equal(torsion3D(line, 0), 0)

	assert.throws(() => torsion3D(null, 0), TypeError)
	assert.throws(() => torsion3D(line, Number.NaN), RangeError)
	assert.throws(() => torsion3D(line, 0, 0), RangeError)
	assert.throws(() => torsion3D(line, 0, -1e-3), RangeError)
})
