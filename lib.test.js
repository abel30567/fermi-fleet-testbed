import { test } from 'node:test'
import assert from 'node:assert'
import { add, doubleIntegral } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('doubleIntegral: constant and polynomial functions', () => {
	assert.ok(Math.abs(doubleIntegral(() => 7, 1, 4, -2, 3) - 105) < 1e-12)
	assert.ok(
		Math.abs(doubleIntegral((x, y) => x * x + y * y, 0, 1, 0, 1) - 2 / 3) < 1e-12,
	)
	assert.ok(
		Math.abs(doubleIntegral((x, y) => x ** 3 * y ** 2, 0, 2, 0, 3, 1, 1) - 36) < 1e-12,
	)
})

test('doubleIntegral: transcendental functions', () => {
	const trig = doubleIntegral((x, y) => Math.sin(x) * Math.cos(y), 0, Math.PI, 0, Math.PI / 2)
	assert.ok(Math.abs(trig - 2) < 1e-7)

	const expVal = doubleIntegral((x, y) => Math.exp(x + y), 0, 1, 0, 1)
	const expected = (Math.E - 1) ** 2
	assert.ok(Math.abs(expVal - expected) < 1e-8)
})

test('doubleIntegral: linearity and domain additivity identities', () => {
	const f = (x, y) => Math.sin(x + y)
	const g = (x, y) => x * Math.exp(-y)
	const a = 2.5
	const b = -1.75

	const lhs = doubleIntegral((x, y) => a * f(x, y) + b * g(x, y), 0, 2, 0, 1.5)
	const rhs =
		a * doubleIntegral(f, 0, 2, 0, 1.5) + b * doubleIntegral(g, 0, 2, 0, 1.5)
	assert.ok(Math.abs(lhs - rhs) < 1e-10)

	const whole = doubleIntegral(f, 0, 2, 0, 2)
	const split =
		doubleIntegral(f, 0, 1, 0, 1) +
		doubleIntegral(f, 1, 2, 0, 1) +
		doubleIntegral(f, 0, 1, 1, 2) +
		doubleIntegral(f, 1, 2, 1, 2)
	assert.ok(Math.abs(whole - split) < 1e-7)
})

test('doubleIntegral: Fubini symmetry and reversed/degenerate bounds', () => {
	const f = (x, y) => x * Math.cos(y) + y * y
	const xy = doubleIntegral(f, 0, 1, 0, 2)
	const yx = doubleIntegral((x, y) => f(y, x), 0, 2, 0, 1)
	assert.ok(Math.abs(xy - yx) < 1e-10)

	const revX = doubleIntegral(f, 1, 0, 0, 2)
	const revBoth = doubleIntegral(f, 1, 0, 2, 0)
	assert.ok(Math.abs(revX + xy) < 1e-10)
	assert.ok(Math.abs(revBoth - xy) < 1e-10)

	assert.equal(doubleIntegral(f, 1, 1, 0, 2), 0)
	assert.equal(doubleIntegral(f, 0, 1, 2, 2), 0)
})

test('doubleIntegral: odd/even subdivision counts and monotonic convergence', () => {
	const exact = 3 * Math.log(3) - 4 * Math.log(2)
	const n3 = doubleIntegral((x, y) => 1 / (1 + x + y), 0, 1, 0, 1, 3, 3)
	const n6 = doubleIntegral((x, y) => 1 / (1 + x + y), 0, 1, 0, 1, 6, 6)
	const n25 = doubleIntegral((x, y) => 1 / (1 + x + y), 0, 1, 0, 1, 25, 25)
	assert.ok(Math.abs(n6 - exact) < Math.abs(n3 - exact))
	assert.ok(Math.abs(n25 - exact) < Math.abs(n6 - exact))
	assert.ok(Math.abs(n25 - exact) < 1e-8)
})

test('doubleIntegral: input validation', () => {
	assert.throws(() => doubleIntegral(null, 0, 1, 0, 1), TypeError)
	assert.throws(() => doubleIntegral((x, y) => x + y, NaN, 1, 0, 1), RangeError)
	assert.throws(() => doubleIntegral((x, y) => x + y, 0, Infinity, 0, 1), RangeError)
	assert.throws(() => doubleIntegral((x, y) => x + y, 0, 1, 0, 1, 0, 10), RangeError)
	assert.throws(() => doubleIntegral((x, y) => x + y, 0, 1, 0, 1, 10, -2), RangeError)
	assert.throws(() => doubleIntegral((x, y) => x + y, 0, 1, 0, 1, 4.5, 10), RangeError)
})
