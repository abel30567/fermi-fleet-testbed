import { test } from 'node:test'
import assert from 'node:assert'
import { add, cylindricalToCartesian } from './lib.js'

const assertVecClose = (actual, expected, eps = 1e-12) => {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) < eps,
			`index ${i}: expected ${expected[i]}, got ${actual[i]}`
		)
	}
}

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('cylindricalToCartesian converts cardinal angles', () => {
	assertVecClose(cylindricalToCartesian(3, 0, 4), [3, 0, 4])
	assertVecClose(cylindricalToCartesian(3, Math.PI / 2, 4), [0, 3, 4])
	assertVecClose(cylindricalToCartesian(3, Math.PI, 4), [-3, 0, 4])
	assertVecClose(cylindricalToCartesian(3, (3 * Math.PI) / 2, 4), [0, -3, 4])
})

test('cylindricalToCartesian converts general 3D coordinates', () => {
	assertVecClose(cylindricalToCartesian(2, Math.PI / 3, 5), [1, Math.sqrt(3), 5])
	assertVecClose(
		cylindricalToCartesian(Math.SQRT2, Math.PI / 4, -7),
		[1, 1, -7]
	)
})

test('cylindricalToCartesian satisfies radial and angular identities', () => {
	const cases = [
		[5, 0.7, 2.5],
		[1.25, -2.1, -9.4],
		[10, Math.PI / 6, 0]
	]
	for (const [r, theta, z] of cases) {
		const [x, y, outZ] = cylindricalToCartesian(r, theta, z)
		assert.ok(Math.abs(Math.hypot(x, y) - r) < 1e-12)
		assert.ok(Math.abs(Math.atan2(y, x) - theta) < 1e-12)
		assert.equal(outZ, z)
	}
})

test('cylindricalToCartesian is 2*PI periodic in theta', () => {
	const base = cylindricalToCartesian(4.5, 1.1, -3.2)
	assertVecClose(cylindricalToCartesian(4.5, 1.1 + 2 * Math.PI, -3.2), base)
	assertVecClose(cylindricalToCartesian(4.5, 1.1 - 4 * Math.PI, -3.2), base)
})

test('cylindricalToCartesian handles zero radius and z-axis boundary cases', () => {
	assertVecClose(cylindricalToCartesian(0, 0, 0), [0, 0, 0])
	assertVecClose(cylindricalToCartesian(0, 1.234, 9.5), [0, 0, 9.5])
	assertVecClose(cylindricalToCartesian(0, -Math.PI, -4), [0, 0, -4])
})

test('cylindricalToCartesian satisfies reflection and negative radius symmetries', () => {
	const r = 3.5
	const theta = 0.8
	const z = 6
	const [x, y, outZ] = cylindricalToCartesian(r, theta, z)
	assertVecClose(cylindricalToCartesian(r, -theta, z), [x, -y, outZ])
	assertVecClose(
		cylindricalToCartesian(-r, theta, z),
		cylindricalToCartesian(r, theta + Math.PI, z)
	)
})
