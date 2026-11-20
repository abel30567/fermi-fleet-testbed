import { test } from 'node:test'
import assert from 'node:assert'
import { add, jacobian2D } from './lib.js'

const assertClose = (actual, expected, tol = 1e-7) => {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`expected ${actual} to be within ${tol} of ${expected}`
	)
}

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('jacobian2D computes exact matrix for linear maps', () => {
	const u = (x, y) => 3 * x - 2 * y + 7
	const v = (x, y) => 4 * x + 5 * y - 1
	const J = jacobian2D(u, v, 2, -3)

	assert.equal(J.length, 2)
	assert.equal(J[0].length, 2)
	assert.equal(J[1].length, 2)
	assertClose(J[0][0], 3)
	assertClose(J[0][1], -2)
	assertClose(J[1][0], 4)
	assertClose(J[1][1], 5)
})

test('jacobian2D matches polar-to-Cartesian Jacobian and determinant identity', () => {
	const u = (r, theta) => r * Math.cos(theta)
	const v = (r, theta) => r * Math.sin(theta)
	const r = 3.5
	const theta = Math.PI / 6
	const J = jacobian2D(u, v, r, theta)

	assertClose(J[0][0], Math.cos(theta))
	assertClose(J[0][1], -r * Math.sin(theta))
	assertClose(J[1][0], Math.sin(theta))
	assertClose(J[1][1], r * Math.cos(theta))

	const det = J[0][0] * J[1][1] - J[0][1] * J[1][0]
	assertClose(det, r)
})

test('jacobian2D handles nonlinear coupled functions', () => {
	const u = (x, y) => x * x * y + Math.sin(y)
	const v = (x, y) => Math.exp(x) - y * y * y
	const x = 1.2
	const y = -0.8
	const J = jacobian2D(u, v, x, y)

	assertClose(J[0][0], 2 * x * y)
	assertClose(J[0][1], x * x + Math.cos(y))
	assertClose(J[1][0], Math.exp(x))
	assertClose(J[1][1], -3 * y * y)
})

test('jacobian2D satisfies Cauchy-Riemann equations for holomorphic z^2', () => {
	const u = (x, y) => x * x - y * y
	const v = (x, y) => 2 * x * y
	const x = 2.5
	const y = -1.5
	const J = jacobian2D(u, v, x, y)

	assertClose(J[0][0], J[1][1])
	assertClose(J[0][1], -J[1][0])

	const det = J[0][0] * J[1][1] - J[0][1] * J[1][0]
	assertClose(det, 4 * (x * x + y * y))
})

test('jacobian2D returns zero matrix for constant functions and supports custom h', () => {
	const Jconst = jacobian2D(
		() => 42,
		() => -7,
		10,
		-20
	)
	assert.deepEqual(Jconst, [
		[0, 0],
		[0, 0],
	])

	const Jcustom = jacobian2D(
		(x, y) => x * y,
		(x, y) => x + y * y,
		3,
		4,
		1e-5
	)
	assertClose(Jcustom[0][0], 4, 1e-6)
	assertClose(Jcustom[0][1], 3, 1e-6)
	assertClose(Jcustom[1][0], 1, 1e-6)
	assertClose(Jcustom[1][1], 8, 1e-6)
})

test('jacobian2D validates inputs and boundary conditions', () => {
	const fn = (x, y) => x + y
	assert.throws(() => jacobian2D(null, fn, 0, 0), TypeError)
	assert.throws(() => jacobian2D(fn, 'not-a-fn', 0, 0), TypeError)
	assert.throws(() => jacobian2D(fn, fn, NaN, 0), RangeError)
	assert.throws(() => jacobian2D(fn, fn, 0, Infinity), RangeError)
	assert.throws(() => jacobian2D(fn, fn, 0, 0, 0), RangeError)
	assert.throws(() => jacobian2D(fn, fn, 0, 0, -1e-6), RangeError)
	assert.throws(() => jacobian2D(fn, fn, 0, 0, NaN), RangeError)
})
