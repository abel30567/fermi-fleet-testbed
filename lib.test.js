import { test } from 'node:test'
import assert from 'node:assert'
import { add, tangentPlaneZ } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('tangentPlaneZ is exact for affine planes', () => {
	const plane = (x, y) => 3 * x - 4 * y + 7
	const z = tangentPlaneZ(plane, 1, -2, 10, 5)
	assert.ok(Math.abs(z - plane(10, 5)) < 1e-8)
})

test('tangentPlaneZ matches analytical tangent plane of paraboloid', () => {
	const f = (x, y) => x * x + y * y
	// At (1, 2): f = 5, fx = 2, fy = 4 => L(3, -1) = 5 + 2*(2) + 4*(-3) = -3
	const z = tangentPlaneZ(f, 1, 2, 3, -1)
	assert.ok(Math.abs(z - -3) < 1e-7)
})

test('tangentPlaneZ matches analytical tangent plane of saddle and trig surfaces', () => {
	const saddle = (x, y) => x * y
	// At (2, 3): f = 6, fx = 3, fy = 2 => L(4, 1) = 6 + 3*2 + 2*(-2) = 8
	assert.ok(Math.abs(tangentPlaneZ(saddle, 2, 3, 4, 1) - 8) < 1e-7)

	const trig = (x, y) => Math.sin(x) * Math.cos(y)
	// At (0, 0): f = 0, fx = 1, fy = 0 => L(x, y) = x
	assert.ok(Math.abs(tangentPlaneZ(trig, 0, 0, 2.5, -1.7) - 2.5) < 1e-8)
})

test('tangentPlaneZ satisfies base-point and linearity identities', () => {
	const f = (x, y) => Math.exp(x * 0.5) + y * y * y - 2 * x * y
	const x0 = 1.2
	const y0 = -0.8

	// At (x0, y0), tangent plane equals f(x0, y0)
	assert.equal(tangentPlaneZ(f, x0, y0, x0, y0), f(x0, y0))

	// Linearity along rays from (x0, y0)
	const dx = 0.7
	const dy = -0.4
	const z0 = f(x0, y0)
	const z1 = tangentPlaneZ(f, x0, y0, x0 + dx, y0 + dy)
	const z3 = tangentPlaneZ(f, x0, y0, x0 + 3 * dx, y0 + 3 * dy)
	assert.ok(Math.abs((z3 - z0) - 3 * (z1 - z0)) < 1e-9)
})

test('tangentPlaneZ achieves O(delta^2) local approximation and supports custom h', () => {
	const f = (x, y) => Math.sin(x + y) + x * x * y
	const x0 = 0.5
	const y0 = 1.0
	const d1 = 1e-2
	const d2 = 1e-3
	const err1 = Math.abs(f(x0 + d1, y0 + d1) - tangentPlaneZ(f, x0, y0, x0 + d1, y0 + d1, 1e-5))
	const err2 = Math.abs(f(x0 + d2, y0 + d2) - tangentPlaneZ(f, x0, y0, x0 + d2, y0 + d2, 1e-5))
	// Shrinking delta by 10x shrinks error by ~100x
	assert.ok(err2 < err1 / 50)
})

test('tangentPlaneZ handles constant functions and validates invalid arguments', () => {
	const constant = () => 42
	assert.equal(tangentPlaneZ(constant, 0, 0, 100, -50), 42)

	assert.throws(() => tangentPlaneZ('not-a-fn', 0, 0, 1, 1), TypeError)
	assert.throws(() => tangentPlaneZ(constant, NaN, 0, 1, 1), RangeError)
	assert.throws(() => tangentPlaneZ(constant, 0, 0, Infinity, 1), RangeError)
	assert.throws(() => tangentPlaneZ(constant, 0, 0, 1, 1, 0), RangeError)
	assert.throws(() => tangentPlaneZ(constant, 0, 0, 1, 1, -1e-6), RangeError)
})
