import { test } from 'node:test'
import assert from 'node:assert'
import { add, lineIntegralScalar } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('lineIntegralScalar computes arc length and weighted integral on a 2D circle', () => {
	const R = 3
	const circle = (t) => [R * Math.cos(t), R * Math.sin(t)]

	const arcLength = lineIntegralScalar(() => 1, circle, 0, 2 * Math.PI)
	assert.ok(Math.abs(arcLength - 2 * Math.PI * R) < 1e-10)

	const weighted = lineIntegralScalar(([x, y]) => x * x + y * y, circle, 0, 2 * Math.PI)
	assert.ok(Math.abs(weighted - 2 * Math.PI * R ** 3) < 1e-9)
})

test('lineIntegralScalar computes 3D helix and straight segment integrals', () => {
	const helix = (t) => [Math.cos(t), Math.sin(t), t]
	const helixIntegral = lineIntegralScalar(([, , z]) => z, helix, 0, 2 * Math.PI)
	const expectedHelix = 2 * Math.PI * Math.PI * Math.SQRT2
	assert.ok(Math.abs(helixIntegral - expectedHelix) < 1e-10)

	const segment = (t) => [1 + 2 * t, 2 + 3 * t, 3 + 6 * t]
	const segIntegral = lineIntegralScalar(([x, y, z]) => x + y + z, segment, 0, 1)
	assert.ok(Math.abs(segIntegral - 80.5) < 1e-10)
})

test('lineIntegralScalar is invariant under monotone and reversed reparameterizations', () => {
	const f = ([x, y]) => Math.exp(-x) + y
	const r1 = (t) => [t, t * t]
	const r2 = (u) => [2 * u * u, 4 * u ** 4]
	const rRev = (t) => [2 - t, (2 - t) * (2 - t)]

	const val1 = lineIntegralScalar(f, r1, 0, 2)
	const val2 = lineIntegralScalar(f, r2, 0, 1)
	const valRev = lineIntegralScalar(f, rRev, 0, 2)

	assert.ok(Math.abs(val1 - val2) < 1e-8)
	assert.ok(Math.abs(val1 - valRev) < 1e-10)
})

test('lineIntegralScalar satisfies linearity and interval additivity', () => {
	const curve = (t) => [t, Math.sin(t), Math.cos(t)]
	const f = ([x, y, z]) => x * y + z
	const g = ([x, y, z]) => x * x - y + 2 * z
	const a = 2.5
	const b = -1.75

	const lhs = lineIntegralScalar((p) => a * f(p) + b * g(p), curve, 0, Math.PI)
	const rhs =
		a * lineIntegralScalar(f, curve, 0, Math.PI) +
		b * lineIntegralScalar(g, curve, 0, Math.PI)
	assert.ok(Math.abs(lhs - rhs) < 1e-10)

	const split = 1.2
	const whole = lineIntegralScalar(f, curve, 0, Math.PI)
	const parts =
		lineIntegralScalar(f, curve, 0, split) +
		lineIntegralScalar(f, curve, split, Math.PI)
	assert.ok(Math.abs(whole - parts) < 1e-10)
})

test('lineIntegralScalar handles boundary cases, open-domain endpoints, and validation', () => {
	const line = (t) => [t, 2 * t]
	assert.equal(lineIntegralScalar(() => 5, line, 1, 1), 0)

	const constantCurve = () => [3, 4, 5]
	assert.equal(lineIntegralScalar(([x]) => x * x, constantCurve, 0, 10), 0)

	const forward = lineIntegralScalar(([x, y]) => x + y, line, 0, 2)
	const backward = lineIntegralScalar(([x, y]) => x + y, line, 2, 0)
	assert.ok(Math.abs(forward + backward) < 1e-10)

	// Curve with sqrt(t) undefined for t < 0 must not evaluate outside (t0, t1)
	const sqrtCurve = (t) => [t, Math.sqrt(t)]
	const sqrtIntegral = lineIntegralScalar(([, y]) => y, sqrtCurve, 0, 1)
	assert.ok(Number.isFinite(sqrtIntegral) && sqrtIntegral > 0)

	assert.throws(() => lineIntegralScalar(null, line, 0, 1), TypeError)
	assert.throws(() => lineIntegralScalar(() => 1, null, 0, 1), TypeError)
	assert.throws(() => lineIntegralScalar(() => 1, line, NaN, 1), TypeError)
	assert.throws(() => lineIntegralScalar(() => 1, line, 0, Infinity), TypeError)
	assert.throws(() => lineIntegralScalar(() => 1, line, 0, 1, 0), RangeError)
	assert.throws(() => lineIntegralScalar(() => 1, line, 0, 1, 2.5), RangeError)
	assert.throws(() => lineIntegralScalar(() => 1, () => [], 0, 1), TypeError)
})
