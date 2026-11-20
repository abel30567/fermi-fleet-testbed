import { test } from 'node:test'
import assert from 'node:assert'
import { add, gradientDescent2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('gradientDescent2D minimizes a shifted paraboloid with default parameters', () => {
	const f = (x, y) => (x - 3) ** 2 + (y + 2) ** 2 + 5
	const res = gradientDescent2D(f, -4, 6)
	assert.ok(Math.abs(res.x - 3) < 1e-6, `expected x ≈ 3, got ${res.x}`)
	assert.ok(Math.abs(res.y - -2) < 1e-6, `expected y ≈ -2, got ${res.y}`)
	assert.ok(Math.abs(res.fx - 5) < 1e-10, `expected fx ≈ 5, got ${res.fx}`)
	assert.ok(res.iterations > 0 && res.iterations < 2000)
})

test('gradientDescent2D minimizes a coupled quadratic form accurately', () => {
	// f(x, y) = 2x^2 + 2xy + 3y^2 - 4x - 8y + 10
	// Minimum at (0.4, 1.2) with f(0.4, 1.2) = 4.4
	const f = (x, y) => 2 * x * x + 2 * x * y + 3 * y * y - 4 * x - 8 * y + 10
	const res = gradientDescent2D(f, 5, -5)
	assert.ok(Math.abs(res.x - 0.4) < 1e-6, `expected x ≈ 0.4, got ${res.x}`)
	assert.ok(Math.abs(res.y - 1.2) < 1e-6, `expected y ≈ 1.2, got ${res.y}`)
	assert.ok(Math.abs(res.fx - 4.4) < 1e-10, `expected fx ≈ 4.4, got ${res.fx}`)
	assert.ok(res.iterations > 0 && res.iterations < 2000)
})

test('gradientDescent2D minimizes a non-quadratic smooth convex function', () => {
	// f(x, y) = 2*cosh(x) + cosh(y - 1), minimum at (0, 1) with fx = 3
	const f = (x, y) => 2 * Math.cosh(x) + Math.cosh(y - 1)
	const res = gradientDescent2D(f, 2, -1, 0.05, 2000, 1e-8)
	assert.ok(Math.abs(res.x) < 1e-6, `expected x ≈ 0, got ${res.x}`)
	assert.ok(Math.abs(res.y - 1) < 1e-6, `expected y ≈ 1, got ${res.y}`)
	assert.ok(Math.abs(res.fx - 3) < 1e-10, `expected fx ≈ 3, got ${res.fx}`)
})

test('gradientDescent2D satisfies translation and positive-scaling identities', () => {
	const base = (x, y) => x * x + 2 * y * y
	const dx = 4.5
	const dy = -3.25
	const offset = 12.5
	const shifted = (x, y) => base(x - dx, y - dy) + offset
	const scaled = (x, y) => 5 * base(x - dx, y - dy) + offset

	const rBase = gradientDescent2D(base, 2, -2, 0.05, 2000, 1e-8)
	const rShifted = gradientDescent2D(shifted, 2 + dx, -2 + dy, 0.05, 2000, 1e-8)
	const rScaled = gradientDescent2D(scaled, 2 + dx, -2 + dy, 0.01, 2000, 1e-8)

	assert.ok(Math.abs(rShifted.x - (rBase.x + dx)) < 1e-6)
	assert.ok(Math.abs(rShifted.y - (rBase.y + dy)) < 1e-6)
	assert.ok(Math.abs(rShifted.fx - (rBase.fx + offset)) < 1e-10)
	assert.ok(Math.abs(rScaled.x - dx) < 1e-6)
	assert.ok(Math.abs(rScaled.y - dy) < 1e-6)
	assert.ok(Math.abs(rScaled.fx - offset) < 1e-10)
})

test('gradientDescent2D handles starting at minimum, constant functions, and maxIter = 0', () => {
	const quad = (x, y) => (x - 1) ** 2 + (y - 2) ** 2
	const atMin = gradientDescent2D(quad, 1, 2)
	assert.deepEqual(atMin, { x: 1, y: 2, fx: 0, iterations: 0 })

	const constant = () => 42
	const atConst = gradientDescent2D(constant, -7, 11)
	assert.deepEqual(atConst, { x: -7, y: 11, fx: 42, iterations: 0 })

	const zeroIter = gradientDescent2D(quad, 10, 10, 0.01, 0)
	assert.deepEqual(zeroIter, { x: 10, y: 10, fx: 145, iterations: 0 })
})

test('gradientDescent2D minimizes Rosenbrock valley with tuned step size', () => {
	const rosenbrock = (x, y) => (1 - x) ** 2 + 100 * (y - x * x) ** 2
	const res = gradientDescent2D(rosenbrock, 0, 0, 0.001, 50000, 1e-6)
	assert.ok(Math.abs(res.x - 1) < 1e-4, `expected x ≈ 1, got ${res.x}`)
	assert.ok(Math.abs(res.y - 1) < 1e-4, `expected y ≈ 1, got ${res.y}`)
	assert.ok(res.fx < 1e-8, `expected fx ≈ 0, got ${res.fx}`)
})

test('gradientDescent2D validates inputs and detects divergence', () => {
	const f = (x, y) => x * x + y * y
	assert.throws(() => gradientDescent2D(null, 0, 0), TypeError)
	assert.throws(() => gradientDescent2D(f, NaN, 0), TypeError)
	assert.throws(() => gradientDescent2D(f, 0, Infinity), TypeError)
	assert.throws(() => gradientDescent2D(f, 0, 0, 0), RangeError)
	assert.throws(() => gradientDescent2D(f, 0, 0, -0.1), RangeError)
	assert.throws(() => gradientDescent2D(f, 0, 0, 0.01, -1), RangeError)
	assert.throws(() => gradientDescent2D(f, 0, 0, 0.01, 1.5), RangeError)
	assert.throws(() => gradientDescent2D(f, 0, 0, 0.01, 100, -1e-8), RangeError)
	assert.throws(() => gradientDescent2D(f, 10, 10, 10, 1000), RangeError)
})
