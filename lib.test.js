import { test } from 'node:test'
import assert from 'node:assert'
import { add, gradient2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function assertClose(actual, expected, tol = 1e-7) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`expected ${actual} to be within ${tol} of ${expected}`
	)
}

test('gradient2D computes partial derivatives for polynomial functions', () => {
	const f = (x, y) => x ** 2 + 3 * x * y + y ** 3
	const [gx, gy] = gradient2D(f, 2, -1)
	assertClose(gx, 2 * 2 + 3 * -1)
	assertClose(gy, 3 * 2 + 3 * (-1) ** 2)

	const [gx0, gy0] = gradient2D(f, 0, 0)
	assertClose(gx0, 0)
	assertClose(gy0, 0)
})

test('gradient2D handles constant and linear functions accurately', () => {
	const constant = () => 42
	assert.deepEqual(gradient2D(constant, 3.5, -7.2), [0, 0])

	const linear = (x, y) => 5 * x - 7 * y + 11
	const [gx, gy] = gradient2D(linear, -10, 25)
	assertClose(gx, 5, 1e-7)
	assertClose(gy, -7, 1e-7)
})

test('gradient2D matches analytical gradient for trigonometric and exponential functions', () => {
	const f = (x, y) => Math.sin(x) * Math.cos(y) + Math.exp(x * y)
	const x = 0.7
	const y = -0.4
	const [gx, gy] = gradient2D(f, x, y)

	const expectedGx = Math.cos(x) * Math.cos(y) + y * Math.exp(x * y)
	const expectedGy = -Math.sin(x) * Math.sin(y) + x * Math.exp(x * y)
	assertClose(gx, expectedGx, 1e-7)
	assertClose(gy, expectedGy, 1e-7)
})

test('gradient2D satisfies linearity and product rule identities', () => {
	const f = (x, y) => x ** 2 * y + Math.cos(x)
	const g = (x, y) => Math.sin(y) + 2 * x - y ** 2
	const a = 2.5
	const b = -1.3
	const x = 1.2
	const y = -0.8

	const [fx, fy] = gradient2D(f, x, y)
	const [gx, gy] = gradient2D(g, x, y)

	const [linX, linY] = gradient2D((u, v) => a * f(u, v) + b * g(u, v), x, y)
	assertClose(linX, a * fx + b * gx, 1e-6)
	assertClose(linY, a * fy + b * gy, 1e-6)

	const [prodX, prodY] = gradient2D((u, v) => f(u, v) * g(u, v), x, y)
	assertClose(prodX, f(x, y) * gx + g(x, y) * fx, 1e-6)
	assertClose(prodY, f(x, y) * gy + g(x, y) * fy, 1e-6)
})

test('gradient2D supports custom step size h and satisfies radial orthogonality', () => {
	const radial = (x, y) => x ** 2 + y ** 2
	const x = -3
	const y = 4
	const defaultGrad = gradient2D(radial, x, y)
	const explicitGrad = gradient2D(radial, x, y, 1e-6)
	assert.deepEqual(defaultGrad, explicitGrad)

	const [gx, gy] = gradient2D(radial, x, y, 1e-4)
	assertClose(gx, 2 * x, 1e-8)
	assertClose(gy, 2 * y, 1e-8)
	assertClose(gx * -y + gy * x, 0, 1e-8)
})

test('gradient2D validates inputs and throws on invalid arguments', () => {
	const f = (x, y) => x + y
	assert.throws(() => gradient2D(null, 0, 0), TypeError)
	assert.throws(() => gradient2D('not a fn', 0, 0), TypeError)
	assert.throws(() => gradient2D(f, NaN, 0), RangeError)
	assert.throws(() => gradient2D(f, 0, Infinity), RangeError)
	assert.throws(() => gradient2D(f, 0, 0, 0), RangeError)
	assert.throws(() => gradient2D(f, 0, 0, -1e-6), RangeError)
	assert.throws(() => gradient2D(f, 0, 0, NaN), RangeError)
	assert.throws(() => gradient2D(f, 0, 0, Infinity), RangeError)
})
