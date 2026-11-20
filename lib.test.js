import { test } from 'node:test'
import assert from 'node:assert'
import { add, nelderMead2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('nelderMead2D minimizes a shifted convex quadratic bowl', () => {
	const f = (x, y) => (x - 3) ** 2 + (y + 4) ** 2 + 7
	const res = nelderMead2D(f, 0, 0)
	assert.ok(Math.abs(res.x - 3) < 1e-6, `expected x≈3, got ${res.x}`)
	assert.ok(Math.abs(res.y - -4) < 1e-6, `expected y≈-4, got ${res.y}`)
	assert.ok(Math.abs(res.fx - 7) < 1e-10, `expected fx≈7, got ${res.fx}`)
})

test('nelderMead2D minimizes the non-convex Rosenbrock banana function', () => {
	const rosenbrock = (x, y) => (1 - x) ** 2 + 100 * (y - x * x) ** 2
	const res = nelderMead2D(rosenbrock, -1.2, 1.0, 500, 1e-10)
	assert.ok(Math.abs(res.x - 1) < 1e-4, `expected x≈1, got ${res.x}`)
	assert.ok(Math.abs(res.y - 1) < 1e-4, `expected y≈1, got ${res.y}`)
	assert.ok(res.fx < 1e-8, `expected fx≈0, got ${res.fx}`)
})

test('nelderMead2D minimizes rotated anisotropic ellipse (coupled x and y)', () => {
	// Minimum at (2, -1) where u = x - 2, v = y + 1: 5u^2 + 6uv + 5v^2 >= 0
	const f = (x, y) => {
		const u = x - 2
		const v = y + 1
		return 5 * u * u + 6 * u * v + 5 * v * v
	}
	const res = nelderMead2D(f, -5, 6)
	assert.ok(Math.abs(res.x - 2) < 1e-6, `expected x≈2, got ${res.x}`)
	assert.ok(Math.abs(res.y - -1) < 1e-6, `expected y≈-1, got ${res.y}`)
	assert.ok(res.fx < 1e-10, `expected fx≈0, got ${res.fx}`)
})

test('nelderMead2D minimizes non-differentiable L1 norm (derivative-free property)', () => {
	const f = (x, y) => Math.abs(x - 1.5) + Math.abs(y + 2.5)
	const res = nelderMead2D(f, -3, 4)
	assert.ok(Math.abs(res.x - 1.5) < 1e-6, `expected x≈1.5, got ${res.x}`)
	assert.ok(Math.abs(res.y - -2.5) < 1e-6, `expected y≈-2.5, got ${res.y}`)
	assert.ok(res.fx < 1e-6, `expected fx≈0, got ${res.fx}`)
})

test('nelderMead2D handles starting exactly at the minimum and constant functions', () => {
	const quad = (x, y) => x * x + y * y
	const atMin = nelderMead2D(quad, 0, 0)
	assert.ok(Math.abs(atMin.x) < 1e-7)
	assert.ok(Math.abs(atMin.y) < 1e-7)
	assert.ok(atMin.fx < 1e-12)

	const constant = () => 42
	const flat = nelderMead2D(constant, 5, -3)
	assert.equal(flat.fx, 42)
	assert.ok(Number.isFinite(flat.x) && Number.isFinite(flat.y))
})

test('nelderMead2D respects maxIter = 0 and validates invalid inputs', () => {
	const f = (x, y) => (x - 10) ** 2 + (y - 10) ** 2
	const zeroIter = nelderMead2D(f, 1, 2, 0)
	assert.deepEqual(zeroIter, { x: 1, y: 2, fx: 145 })

	assert.throws(() => nelderMead2D(null, 0, 0), TypeError)
	assert.throws(() => nelderMead2D(f, Number.NaN, 0), TypeError)
	assert.throws(() => nelderMead2D(f, 0, Number.POSITIVE_INFINITY), TypeError)
})
