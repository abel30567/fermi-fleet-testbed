import { test } from 'node:test'
import assert from 'node:assert'
import { add, surfaceNormal } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertVecClose(actual, expected, tol = 1e-8) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`index ${i}: expected ${expected[i]}, got ${actual[i]}`
		)
	}
}

test('surfaceNormal: horizontal plane has vertical unit normal [0, 0, 1]', () => {
	const n = surfaceNormal(() => 42, 3.5, -2.1)
	assert.deepStrictEqual(n, [0, 0, 1])
	assert.ok(Object.is(n[0], 0))
	assert.ok(Object.is(n[1], 0))
})

test('surfaceNormal: tilted plane matches exact analytical normal', () => {
	const f = (x, y) => 3 * x - 4 * y + 7
	const n = surfaceNormal(f, 1.25, -3.75)
	const norm = Math.sqrt(3 * 3 + 4 * 4 + 1)
	assertVecClose(n, [-3 / norm, 4 / norm, 1 / norm], 1e-8)
	assert.ok(n[2] > 0)
	assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-12)
})

test('surfaceNormal: paraboloid origin and tangent-plane orthogonality identity', () => {
	const f = (x, y) => x * x + y * y
	assertVecClose(surfaceNormal(f, 0, 0), [0, 0, 1], 1e-12)

	const x = 1.5
	const y = -2.0
	const fx = 2 * x
	const fy = 2 * y
	const n = surfaceNormal(f, x, y)
	const norm = Math.hypot(fx, fy, 1)
	assertVecClose(n, [-fx / norm, -fy / norm, 1 / norm], 1e-8)

	// Normal must be orthogonal to tangent vectors [1, 0, fx] and [0, 1, fy]
	const dotTx = n[0] * 1 + n[1] * 0 + n[2] * fx
	const dotTy = n[0] * 0 + n[1] * 1 + n[2] * fy
	assert.ok(Math.abs(dotTx) < 1e-8)
	assert.ok(Math.abs(dotTy) < 1e-8)
})

test('surfaceNormal: upper hemisphere normal equals radial unit vector', () => {
	const R = 5
	const f = (x, y) => Math.sqrt(R * R - x * x - y * y)
	const points = [
		[0, 0],
		[3, 0],
		[1, 2],
		[-2.5, 1.5],
	]
	for (const [x, y] of points) {
		const z = f(x, y)
		const n = surfaceNormal(f, x, y)
		assertVecClose(n, [x / R, y / R, z / R], 1e-8)
		assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-12)
	}
})

test('surfaceNormal: trigonometric surface with default and custom step size h', () => {
	const f = (x, y) => Math.sin(x) * Math.cos(y)
	const x = 0.7
	const y = -0.4
	const fx = Math.cos(x) * Math.cos(y)
	const fy = -Math.sin(x) * Math.sin(y)
	const norm = Math.hypot(fx, fy, 1)
	const expected = [-fx / norm, -fy / norm, 1 / norm]

	assertVecClose(surfaceNormal(f, x, y), expected, 1e-8)
	assertVecClose(surfaceNormal(f, x, y, 1e-5), expected, 1e-8)
})

test('surfaceNormal: steep gradient and invalid input validation', () => {
	const steep = surfaceNormal((x) => 1e8 * x, 0, 0, 1e-6)
	assert.ok(Math.abs(Math.hypot(...steep) - 1) < 1e-12)
	assert.ok(steep[0] < -0.999999)
	assert.ok(steep[2] > 0)

	assert.throws(() => surfaceNormal(null, 0, 0), TypeError)
	assert.throws(() => surfaceNormal(() => 0, NaN, 0), RangeError)
	assert.throws(() => surfaceNormal(() => 0, 0, Infinity), RangeError)
	assert.throws(() => surfaceNormal(() => 0, 0, 0, 0), RangeError)
	assert.throws(() => surfaceNormal(() => 0, 0, 0, -1e-6), RangeError)
	assert.throws(() => surfaceNormal(() => NaN, 0, 0), RangeError)
})
