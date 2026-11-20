import { test } from 'node:test'
import assert from 'node:assert'
import { add, arcLength3D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('arcLength3D computes exact length of 3D line segments', () => {
	const line = (t) => [1 + 3 * t, -2 + 4 * t, 5 + 12 * t]
	// Direction vector (3, 4, 12) has norm 13; over [0, 2] length is 26
	assert.ok(Math.abs(arcLength3D(line, 0, 2) - 26) < 1e-12)
	// Even with n = 1, straight line is exact
	assert.ok(Math.abs(arcLength3D(line, 0, 2, 1) - 26) < 1e-12)
})

test('arcLength3D computes length of a 3D circular helix', () => {
	const R = 3
	const c = 4
	const helix = (t) => [R * Math.cos(t), R * Math.sin(t), c * t]
	// Speed is sqrt(R^2 + c^2) = 5; over [0, 2*pi] length is 10*pi
	const expected = 2 * Math.PI * Math.hypot(R, c)
	const actual = arcLength3D(helix, 0, 2 * Math.PI)
	assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`)
})

test('arcLength3D matches analytical arc length of twisted cubic and parabola', () => {
	// Twisted cubic r(t) = [t, t^2, (2/3) t^3] has speed 1 + 2t^2
	// Integral of (1 + 2t^2) from 0 to 3 is [t + (2/3)t^3]_0^3 = 3 + 18 = 21
	const twistedCubic = (t) => [t, t * t, (2 / 3) * t * t * t]
	const actualCubic = arcLength3D(twistedCubic, 0, 3)
	assert.ok(Math.abs(actualCubic - 21) < 1e-8, `expected 21, got ${actualCubic}`)

	// Parabola r(t) = [t, t^2, 0] on [0, 1]
	const parabola = (t) => [t, t * t, 0]
	const expectedParabola = Math.sqrt(5) / 2 + Math.asinh(2) / 4
	const actualParabola = arcLength3D(parabola, 0, 1)
	assert.ok(
		Math.abs(actualParabola - expectedParabola) < 1e-10,
		`expected ${expectedParabola}, got ${actualParabola}`
	)
})

test('arcLength3D satisfies mathematical identities (additivity, reparameterization, reversal, scaling)', () => {
	const curve = (t) => [Math.cos(t), Math.sin(2 * t), t * t]

	// Additivity: L(a, c) = L(a, b) + L(b, c)
	const full = arcLength3D(curve, 0, 2)
	const part1 = arcLength3D(curve, 0, 0.7)
	const part2 = arcLength3D(curve, 0.7, 2)
	assert.ok(Math.abs(full - (part1 + part2)) < 1e-9)

	// Reversal invariance: L(t1, t0) === L(t0, t1)
	const reversed = arcLength3D(curve, 2, 0)
	assert.ok(Math.abs(full - reversed) < 1e-12)

	// Uniform scaling: scaling curve by k scales arc length by |k|
	const k = 3.5
	const scaledCurve = (t) => curve(t).map((v) => v * k)
	assert.ok(Math.abs(arcLength3D(scaledCurve, 0, 2) - k * full) < 1e-9)

	// Reparameterization invariance: u = t^2 over [0, sqrt(2)] -> t in [0, 2]
	const reparam = (u) => curve(u * u)
	assert.ok(Math.abs(arcLength3D(reparam, 0, Math.SQRT2) - full) < 1e-8)
})

test('arcLength3D handles boundary and degenerate cases', () => {
	const helix = (t) => [Math.cos(t), Math.sin(t), t]

	// Degenerate interval t0 === t1 returns 0
	assert.equal(arcLength3D(helix, 1.5, 1.5), 0)

	// Constant curve has 0 arc length
	const constant = () => [42, -7, 3.14]
	assert.equal(arcLength3D(constant, -10, 10), 0)

	// Curve defined only on [0, 1] (no out-of-bounds evaluations)
	const sqrtCurve = (t) => [t, Math.sqrt(t), 0]
	const len = arcLength3D(sqrtCurve, 0, 1)
	assert.ok(Number.isFinite(len) && len > Math.SQRT2)
})

test('arcLength3D validates arguments', () => {
	const line = (t) => [t, 0, 0]
	assert.throws(() => arcLength3D(null, 0, 1), TypeError)
	assert.throws(() => arcLength3D(line, NaN, 1), RangeError)
	assert.throws(() => arcLength3D(line, 0, Infinity), RangeError)
	assert.throws(() => arcLength3D(line, 0, 1, 0), RangeError)
	assert.throws(() => arcLength3D(line, 0, 1, -5), RangeError)
	assert.throws(() => arcLength3D(line, 0, 1, 2.5), RangeError)
})
