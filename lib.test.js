import { test } from 'node:test'
import assert from 'node:assert'
import { add, curl3 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertClose(actual, expected, tol = 1e-3) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) < tol,
			`index ${i}: expected ${expected[i]}, got ${actual[i]}`
		)
	}
}

test('curl3 of rotational field P=-y, Q=x, R=0 is [0, 0, 2]', () => {
	const P = (x, y, z) => -y
	const Q = (x, y, z) => x
	const R = (x, y, z) => 0
	assertClose(curl3(P, Q, R, 1, 2, 3), [0, 0, 2])
	assertClose(curl3(P, Q, R, 0, 0, 0), [0, 0, 2])
})

test('curl3 of a conservative (gradient) field is [0, 0, 0]', () => {
	// gradient of f = x^2 + y^2 + z^2 is (2x, 2y, 2z), which is curl-free
	const P = (x, y, z) => 2 * x
	const Q = (x, y, z) => 2 * y
	const R = (x, y, z) => 2 * z
	assertClose(curl3(P, Q, R, 1, 1, 1), [0, 0, 0])
})

test('curl3 of a constant field is [0, 0, 0]', () => {
	const P = () => 5
	const Q = () => -3
	const R = () => 7
	assertClose(curl3(P, Q, R, 4, 5, 6), [0, 0, 0])
})

test('curl3 of P=0, Q=0, R=x*y gives [x, -y, 0]', () => {
	const P = () => 0
	const Q = () => 0
	const R = (x, y, z) => x * y
	assertClose(curl3(P, Q, R, 2, 3, 0), [2, -3, 0])
})

test('curl3 accepts a custom step size h', () => {
	const P = (x, y, z) => -y
	const Q = (x, y, z) => x
	const R = (x, y, z) => 0
	assertClose(curl3(P, Q, R, 0, 0, 0, 1e-4), [0, 0, 2])
})
