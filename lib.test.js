import { test } from 'node:test'
import assert from 'node:assert'
import { add, tripleIntegral } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('tripleIntegral computes exact volume for constant functions', () => {
	const result = tripleIntegral(() => 3, 0, 2, -1, 4, 1, 5)
	// 3 * (2 - 0) * (4 - (-1)) * (5 - 1) = 3 * 2 * 5 * 4 = 120
	assert.ok(Math.abs(result - 120) < 1e-10, `expected 120, got ${result}`)
})

test('tripleIntegral is exact for multilinear polynomial f(x, y, z) = x * y * z', () => {
	// Integral over [0, 2] x [1, 3] x [0, 4] = (4/2) * ((9-1)/2) * (16/2) = 2 * 4 * 8 = 64
	const result = tripleIntegral((x, y, z) => x * y * z, 0, 2, 1, 3, 0, 4, 10)
	assert.ok(Math.abs(result - 64) < 1e-10, `expected 64, got ${result}`)
})

test('tripleIntegral approximates smooth nonlinear functions and converges with n', () => {
	// Integral of (x^2 + y^2 + z^2) over [0, 1]^3 = 1/3 + 1/3 + 1/3 = 1
	// Midpoint rule exact formula for this integrand is 1 - 1 / (4 * n^2)
	const f = (x, y, z) => x * x + y * y + z * z
	const r10 = tripleIntegral(f, 0, 1, 0, 1, 0, 1, 10)
	const r40 = tripleIntegral(f, 0, 1, 0, 1, 0, 1, 40)
	assert.ok(Math.abs(r10 - (1 - 1 / 400)) < 1e-12)
	assert.ok(Math.abs(r40 - (1 - 1 / 6400)) < 1e-12)
	assert.ok(Math.abs(r40 - 1) < Math.abs(r10 - 1))

	// Separable integral: sin(x) * cos(y) * exp(z) over [0, pi] x [0, pi/2] x [0, 1]
	// Exact = 2 * 1 * (e - 1)
	const exact = 2 * (Math.E - 1)
	const approx = tripleIntegral((x, y, z) => Math.sin(x) * Math.cos(y) * Math.exp(z), 0, Math.PI, 0, Math.PI / 2, 0, 1, 50)
	assert.ok(Math.abs(approx - exact) < 1e-3, `expected ~${exact}, got ${approx}`)
})

test('tripleIntegral satisfies linearity and domain additivity', () => {
	const f = (x, y, z) => Math.sin(x + y) * z
	const g = (x, y, z) => x * Math.cos(y * z)
	const a = 2.5
	const b = -1.75

	const lhs = tripleIntegral((x, y, z) => a * f(x, y, z) + b * g(x, y, z), 0, 1, 0, 1, 0, 1, 12)
	const rhs =
		a * tripleIntegral(f, 0, 1, 0, 1, 0, 1, 12) +
		b * tripleIntegral(g, 0, 1, 0, 1, 0, 1, 12)
	assert.ok(Math.abs(lhs - rhs) < 1e-12)

	// Domain additivity along x: [0, 2] = [0, 1] U [1, 2]
	const h = (x, y, z) => Math.exp(x) * (y + 2 * z)
	const full = tripleIntegral(h, 0, 2, 0, 1, 0, 1, 20)
	const left = tripleIntegral(h, 0, 1, 0, 1, 0, 1, 10)
	const right = tripleIntegral(h, 1, 2, 0, 1, 0, 1, 10)
	assert.ok(Math.abs(full - (left + right)) < 1e-12)
})

test('tripleIntegral handles reversed bounds and degenerate zero-volume boxes', () => {
	const f = (x, y, z) => x + 2 * y + 3 * z
	const forward = tripleIntegral(f, 0, 2, 0, 3, 0, 4, 8)
	const revX = tripleIntegral(f, 2, 0, 0, 3, 0, 4, 8)
	const revXY = tripleIntegral(f, 2, 0, 3, 0, 0, 4, 8)
	const revXYZ = tripleIntegral(f, 2, 0, 3, 0, 4, 0, 8)

	assert.ok(Math.abs(revX + forward) < 1e-10)
	assert.ok(Math.abs(revXY - forward) < 1e-10)
	assert.ok(Math.abs(revXYZ + forward) < 1e-10)

	assert.equal(tripleIntegral(f, 1, 1, 0, 2, 0, 3), 0)
	assert.equal(tripleIntegral(f, 0, 2, 5, 5, 0, 3), 0)
	assert.equal(tripleIntegral(f, 0, 2, 0, 3, -2, -2), 0)
})

test('tripleIntegral validates arguments on boundary and invalid inputs', () => {
	assert.throws(() => tripleIntegral(null, 0, 1, 0, 1, 0, 1), TypeError)
	assert.throws(() => tripleIntegral(() => 1, NaN, 1, 0, 1, 0, 1), TypeError)
	assert.throws(() => tripleIntegral(() => 1, 0, Infinity, 0, 1, 0, 1), TypeError)
	assert.throws(() => tripleIntegral(() => 1, 0, 1, 0, 1, 0, 1, 0), RangeError)
	assert.throws(() => tripleIntegral(() => 1, 0, 1, 0, 1, 0, 1, -5), RangeError)
	assert.throws(() => tripleIntegral(() => 1, 0, 1, 0, 1, 0, 1, 2.5), RangeError)
	// n = 1 evaluates solely at box center
	const centerVal = tripleIntegral((x, y, z) => x * 100 + y * 10 + z, 0, 2, 0, 4, 0, 6, 1)
	// center = (1, 2, 3), f(1, 2, 3) = 123, volume = 2 * 4 * 6 = 48
	assert.equal(centerVal, 123 * 48)
})
