import { test } from 'node:test'
import assert from 'node:assert'
import { add, newton2DOptimize } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('newton2DOptimize minimizes a simple quadratic paraboloid', () => {
	const f = (x, y) => (x - 3) ** 2 + (y + 2) ** 2 + 5
	const res = newton2DOptimize(f, 0, 0)
	assert.ok(Math.abs(res.x - 3) < 1e-7)
	assert.ok(Math.abs(res.y - -2) < 1e-7)
	assert.ok(Math.abs(res.fx - 5) < 1e-10)
})

test('newton2DOptimize minimizes a coupled positive-definite quadratic (Booth function)', () => {
	// Booth function: f(x, y) = (x + 2y - 7)^2 + (2x + y - 5)^2, minimum 0 at (1, 3)
	const booth = (x, y) => (x + 2 * y - 7) ** 2 + (2 * x + y - 5) ** 2
	const res = newton2DOptimize(booth, -4, 6)
	assert.ok(Math.abs(res.x - 1) < 1e-6)
	assert.ok(Math.abs(res.y - 3) < 1e-6)
	assert.ok(res.fx < 1e-12)
})

test('newton2DOptimize minimizes the non-convex Rosenbrock function', () => {
	// Rosenbrock: f(x, y) = (1 - x)^2 + 100*(y - x^2)^2, global min 0 at (1, 1)
	const rosenbrock = (x, y) => (1 - x) ** 2 + 100 * (y - x * x) ** 2
	const res = newton2DOptimize(rosenbrock, -1.2, 1, 100, 1e-8)
	assert.ok(Math.abs(res.x - 1) < 1e-5)
	assert.ok(Math.abs(res.y - 1) < 1e-5)
	assert.ok(res.fx < 1e-10)
})

test('newton2DOptimize converges to one of Himmelblau minima', () => {
	// Himmelblau: f(x, y) = (x^2 + y - 11)^2 + (x + y^2 - 7)^2, min 0 at (3, 2)
	const himmelblau = (x, y) => (x * x + y - 11) ** 2 + (x + y * y - 7) ** 2
	const res = newton2DOptimize(himmelblau, 2.5, 1.5)
	assert.ok(Math.abs(res.x - 3) < 1e-6)
	assert.ok(Math.abs(res.y - 2) < 1e-6)
	assert.ok(res.fx < 1e-12)
})

test('newton2DOptimize handles starting directly at the minimum and maxIter=0', () => {
	const f = (x, y) => x * x + 4 * y * y + 10
	const atMin = newton2DOptimize(f, 0, 0)
	assert.equal(atMin.x, 0)
	assert.equal(atMin.y, 0)
	assert.equal(atMin.fx, 10)

	const zeroIter = newton2DOptimize(f, 2, 3, 0)
	assert.equal(zeroIter.x, 2)
	assert.equal(zeroIter.y, 3)
	assert.equal(zeroIter.fx, f(2, 3))
})

test('newton2DOptimize escapes indefinite/non-convex starting region via Hessian regularization', () => {
	// f(x, y) = -cos(x) - cos(y) + 0.1*(x^2 + y^2), local min at (0, 0), concave near (pi, pi)
	const f = (x, y) => -Math.cos(x) - Math.cos(y) + 0.1 * (x * x + y * y)
	const res = newton2DOptimize(f, 2.8, 2.8, 100, 1e-8)
	assert.ok(res.fx < f(2.8, 2.8))
	assert.ok(Math.abs(res.x) < 1e-6)
	assert.ok(Math.abs(res.y) < 1e-6)
})

test('newton2DOptimize validates arguments', () => {
	const f = (x, y) => x * x + y * y
	assert.throws(() => newton2DOptimize(null, 0, 0), TypeError)
	assert.throws(() => newton2DOptimize(f, NaN, 0), RangeError)
	assert.throws(() => newton2DOptimize(f, 0, Infinity), RangeError)
	assert.throws(() => newton2DOptimize(f, 0, 0, -1), RangeError)
	assert.throws(() => newton2DOptimize(f, 0, 0, 50, 0), RangeError)
})
