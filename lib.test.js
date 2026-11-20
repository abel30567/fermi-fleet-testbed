import { test } from 'node:test'
import assert from 'node:assert'
import { add, sphericalToCartesian } from './lib.js'

const EPS = 1e-12

function assertVecClose(actual, expected, eps = EPS) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`index ${i}: expected ${expected[i]}, got ${actual[i]}`
		)
	}
}

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('sphericalToCartesian maps cardinal axes and poles', () => {
	assertVecClose(sphericalToCartesian(5, 0, 0), [0, 0, 5])
	assertVecClose(sphericalToCartesian(5, 1.23, 0), [0, 0, 5])
	assertVecClose(sphericalToCartesian(5, 0, Math.PI), [0, 0, -5])
	assertVecClose(sphericalToCartesian(3, 0, Math.PI / 2), [3, 0, 0])
	assertVecClose(sphericalToCartesian(3, Math.PI / 2, Math.PI / 2), [0, 3, 0])
	assertVecClose(sphericalToCartesian(3, Math.PI, Math.PI / 2), [-3, 0, 0])
	assertVecClose(sphericalToCartesian(3, (3 * Math.PI) / 2, Math.PI / 2), [0, -3, 0])
})

test('sphericalToCartesian converts general octant coordinates', () => {
	assertVecClose(sphericalToCartesian(2, Math.PI / 4, Math.PI / 3), [
		Math.sqrt(6) / 2,
		Math.sqrt(6) / 2,
		1,
	])
	assertVecClose(sphericalToCartesian(4, (5 * Math.PI) / 6, (2 * Math.PI) / 3), [
		-3,
		Math.sqrt(3),
		-2,
	])
})

test('sphericalToCartesian preserves Euclidean norm identity', () => {
	const samples = [
		[1, 0.3, 0.7],
		[7.5, -2.1, 1.9],
		[0.001, 4.2, 2.8],
		[123.456, 10.5, 0.123],
	]
	for (const [rho, theta, phi] of samples) {
		const [x, y, z] = sphericalToCartesian(rho, theta, phi)
		const norm = Math.hypot(x, y, z)
		assert.ok(
			Math.abs(norm - Math.abs(rho)) <= 1e-10,
			`expected norm ${Math.abs(rho)}, got ${norm}`
		)
	}
})

test('sphericalToCartesian handles zero radius and avoids negative zero', () => {
	assert.deepStrictEqual(sphericalToCartesian(0, 0, 0), [0, 0, 0])
	assert.deepStrictEqual(sphericalToCartesian(0, Math.PI, Math.PI), [0, 0, 0])
	assert.deepStrictEqual(sphericalToCartesian(0, -1.5, 0.75), [0, 0, 0])
})

test('sphericalToCartesian obeys periodicity and symmetry identities', () => {
	const [x1, y1, z1] = sphericalToCartesian(3.2, 0.8, 1.1)
	assertVecClose(sphericalToCartesian(3.2, 0.8 + 2 * Math.PI, 1.1), [x1, y1, z1])
	assertVecClose(sphericalToCartesian(3.2, 0.8 + Math.PI, Math.PI - 1.1), [-x1, -y1, -z1])
	assertVecClose(sphericalToCartesian(-3.2, 0.8, 1.1), [-x1, -y1, -z1])
})

test('sphericalToCartesian handles negative angles', () => {
	assertVecClose(sphericalToCartesian(2, -Math.PI / 2, Math.PI / 2), [0, -2, 0])
	assertVecClose(sphericalToCartesian(2, 0, -Math.PI / 2), [-2, 0, 0])
})
