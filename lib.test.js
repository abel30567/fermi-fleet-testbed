import { test } from 'node:test'
import assert from 'node:assert'
import { add, gradient3D } from './lib.js'

const assertVecClose = (actual, expected, tol = 1e-7) => {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff ${Math.abs(actual[i] - expected[i])})`
		)
	}
}

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('gradient3D: linear function', () => {
	const f = (x, y, z) => 3 * x - 4 * y + 5 * z + 7
	assertVecClose(gradient3D(f, 1, -2, 3), [3, -4, 5])
	assertVecClose(gradient3D(f, 0, 0, 0), [3, -4, 5])
})

test('gradient3D: constant function has zero gradient', () => {
	const f = () => 42
	assertVecClose(gradient3D(f, 10, -5, 2.5), [0, 0, 0], 0)
})

test('gradient3D: quadratic and cross-term polynomial', () => {
	const f = (x, y, z) => x * x + 2 * y * y + 3 * z * z + x * y - y * z
	const x = 2
	const y = -1
	const z = 3
	const expected = [2 * x + y, 4 * y + x - z, 6 * z - y]
	assertVecClose(gradient3D(f, x, y, z), expected)
})

test('gradient3D: trigonometric and exponential scalar field', () => {
	const f = (x, y, z) => Math.sin(x) * Math.cos(y) + Math.exp(z)
	const x = 0.5
	const y = 1.0
	const z = -0.5
	const expected = [
		Math.cos(x) * Math.cos(y),
		-Math.sin(x) * Math.sin(y),
		Math.exp(z)
	]
	assertVecClose(gradient3D(f, x, y, z), expected)
})

test('gradient3D: linearity and product rule identities', () => {
	const f = (x, y, z) => x * x * y + Math.sin(z)
	const g = (x, y, z) => y * z - Math.cos(x)
	const a = 2.5
	const b = -1.75
	const x = 1.2
	const y = -0.8
	const z = 0.6

	const gradF = gradient3D(f, x, y, z)
	const gradG = gradient3D(g, x, y, z)

	const gradLinear = gradient3D((px, py, pz) => a * f(px, py, pz) + b * g(px, py, pz), x, y, z)
	const expectedLinear = gradF.map((v, i) => a * v + b * gradG[i])
	assertVecClose(gradLinear, expectedLinear)

	const fx = f(x, y, z)
	const gx = g(x, y, z)
	const gradProd = gradient3D((px, py, pz) => f(px, py, pz) * g(px, py, pz), x, y, z)
	const expectedProd = gradF.map((v, i) => gx * v + fx * gradG[i])
	assertVecClose(gradProd, expectedProd)
})

test('gradient3D: radial distance unit gradient and custom step size', () => {
	const r = (x, y, z) => Math.hypot(x, y, z)
	const x = 3
	const y = 4
	const z = 12
	const norm = 13
	const expected = [x / norm, y / norm, z / norm]
	assertVecClose(gradient3D(r, x, y, z), expected)
	assertVecClose(gradient3D(r, x, y, z, 1e-5), expected)
	assertVecClose(gradient3D(r, x, y, z, 1e-4), expected, 1e-6)
})

test('gradient3D: validates arguments', () => {
	assert.throws(() => gradient3D(null, 0, 0, 0), TypeError)
	assert.throws(() => gradient3D((x, y, z) => x + y + z, 0, 0, 0, 0), RangeError)
	assert.throws(() => gradient3D((x, y, z) => x + y + z, 0, 0, 0, -1e-6), RangeError)
	assert.throws(() => gradient3D((x, y, z) => x + y + z, 0, 0, 0, Number.NaN), RangeError)
	assert.throws(() => gradient3D((x, y, z) => x + y + z, 0, 0, 0, Number.POSITIVE_INFINITY), RangeError)
})
