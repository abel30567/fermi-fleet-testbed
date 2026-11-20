import { test } from 'node:test'
import assert from 'node:assert'
import { add, partialZ } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('partialZ computes partial derivative for polynomial functions', () => {
	const f = (x, y, z) => 3 * x * y * z ** 2 + 2 * z - 5 * x
	const dfdz = (x, y, z) => 6 * x * y * z + 2

	for (const [x, y, z] of [
		[2, 3, 4],
		[-1.5, 2.5, -3],
		[0, 5, 10],
		[1, 1, 0],
	]) {
		assert.ok(Math.abs(partialZ(f, x, y, z) - dfdz(x, y, z)) < 1e-6)
	}
})

test('partialZ returns 0 for functions independent of z', () => {
	const f = (x, y) => x ** 2 + Math.sin(y) + 7
	assert.equal(partialZ(f, 3, -2, 5), 0)
	assert.equal(partialZ(f, 0, 0, 0), 0)
})

test('partialZ approximates derivatives of transcendental functions', () => {
	const f1 = (x, y, z) => Math.sin(x * z) * Math.exp(y)
	const df1dz = (x, y, z) => x * Math.cos(x * z) * Math.exp(y)
	assert.ok(Math.abs(partialZ(f1, 2, 0.5, 1.2) - df1dz(2, 0.5, 1.2)) < 1e-8)

	const f2 = (x, y, z) => Math.exp(x + y + z)
	assert.ok(Math.abs(partialZ(f2, 0.3, -0.4, 0.7) - f2(0.3, -0.4, 0.7)) < 1e-8)
})

test('partialZ satisfies linearity identity', () => {
	const f = (x, y, z) => x * z ** 3 - y * Math.cos(z)
	const g = (x, y, z) => Math.exp(-z) + x * y * z
	const a = 2.5
	const b = -4.2
	const combined = (x, y, z) => a * f(x, y, z) + b * g(x, y, z)

	const lhs = partialZ(combined, 1.2, -0.8, 0.9)
	const rhs = a * partialZ(f, 1.2, -0.8, 0.9) + b * partialZ(g, 1.2, -0.8, 0.9)
	assert.ok(Math.abs(lhs - rhs) < 1e-7)
})

test('partialZ satisfies product rule identity', () => {
	const f = (x, y, z) => x * z ** 2 + y
	const g = (x, y, z) => Math.sin(z) + x * y
	const prod = (x, y, z) => f(x, y, z) * g(x, y, z)

	const x = 1.5
	const y = -2.0
	const z = 0.75
	const lhs = partialZ(prod, x, y, z)
	const rhs = partialZ(f, x, y, z) * g(x, y, z) + f(x, y, z) * partialZ(g, x, y, z)
	assert.ok(Math.abs(lhs - rhs) < 1e-7)
})

test('partialZ supports custom step size h and is exact for quadratics in z', () => {
	const f = (x, y, z) => 4 * z ** 2 - 3 * x * z + y ** 3
	const exact = (x, z) => 8 * z - 3 * x

	assert.ok(Math.abs(partialZ(f, 2, 5, 3, 0.5) - exact(2, 3)) < 1e-12)
	assert.ok(Math.abs(partialZ(f, -4, 1, -2, 1e-3) - exact(-4, -2)) < 1e-10)
})

test('partialZ throws on invalid f or step size h', () => {
	const f = (x, y, z) => x + y + z
	assert.throws(() => partialZ(null, 1, 2, 3), TypeError)
	assert.throws(() => partialZ(42, 1, 2, 3), TypeError)
	assert.throws(() => partialZ(f, 1, 2, 3, 0), RangeError)
	assert.throws(() => partialZ(f, 1, 2, 3, -1e-6), RangeError)
	assert.throws(() => partialZ(f, 1, 2, 3, Number.NaN), RangeError)
	assert.throws(() => partialZ(f, 1, 2, 3, Number.POSITIVE_INFINITY), RangeError)
})
