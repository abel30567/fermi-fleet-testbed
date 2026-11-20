import { test } from 'node:test'
import assert from 'node:assert'
import { add, laplacian3D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('laplacian3D on quadratic polynomial', () => {
	const f = (x, y, z) => x * x + 2 * y * y + 3 * z * z
	const result = laplacian3D(f, 1.5, -2.0, 0.7)
	assert.ok(Math.abs(result - 12) < 1e-5, `expected ~12, got ${result}`)
})

test('laplacian3D vanishes on harmonic functions (1/r and x^2 - y^2 + 2xz)', () => {
	const potential = (x, y, z) => 1 / Math.hypot(x, y, z)
	const lapPotential = laplacian3D(potential, 1.2, -0.8, 1.5)
	assert.ok(Math.abs(lapPotential) < 1e-5, `expected ~0 for 1/r, got ${lapPotential}`)

	const polyHarmonic = (x, y, z) => x * x - y * y + 2 * x * z
	const lapPoly = laplacian3D(polyHarmonic, 3, -4, 5)
	assert.ok(Math.abs(lapPoly) < 1e-5, `expected ~0 for harmonic polynomial, got ${lapPoly}`)
})

test('laplacian3D on trigonometric and exponential eigenfunctions', () => {
	const f = (x, y, z) => Math.sin(x) * Math.sin(y) * Math.sin(z)
	const x = 0.7, y = 1.1, z = -0.4
	const expected = -3 * f(x, y, z)
	const result = laplacian3D(f, x, y, z)
	assert.ok(Math.abs(result - expected) < 1e-5, `expected ~${expected}, got ${result}`)

	const g = (x, y, z) => Math.sin(x) * Math.cos(y) * Math.exp(z)
	const expectedG = -g(x, y, z)
	const resultG = laplacian3D(g, x, y, z)
	assert.ok(Math.abs(resultG - expectedG) < 1e-5, `expected ~${expectedG}, got ${resultG}`)
})

test('laplacian3D satisfies linearity identity', () => {
	const f = (x, y, z) => x ** 3 + y * z * z
	const g = (x, y, z) => Math.cos(x + y) + z ** 3
	const a = 2.5, b = -1.75
	const combined = (x, y, z) => a * f(x, y, z) + b * g(x, y, z)
	const x = 0.9, y = -0.5, z = 1.3
	const lhs = laplacian3D(combined, x, y, z)
	const rhs = a * laplacian3D(f, x, y, z) + b * laplacian3D(g, x, y, z)
	assert.ok(Math.abs(lhs - rhs) < 1e-4, `expected linearity: ${lhs} vs ${rhs}`)
})

test('laplacian3D vanishes on constant and affine functions', () => {
	const affine = (x, y, z) => 5 * x - 3 * y + 7 * z + 42
	assert.ok(Math.abs(laplacian3D(affine, 10, -20, 30)) < 1e-5)
	assert.equal(laplacian3D(() => 99, 0, 0, 0), 0)
})

test('laplacian3D custom step size, symmetry in h, and input validation', () => {
	const f = (x, y, z) => x ** 3 + y ** 3 + z ** 3
	const x = 1, y = 2, z = 3
	const expected = 6 * (x + y + z)
	const posH = laplacian3D(f, x, y, z, 1e-3)
	const negH = laplacian3D(f, x, y, z, -1e-3)
	assert.ok(Math.abs(posH - expected) < 1e-4, `expected ~${expected}, got ${posH}`)
	assert.ok(Math.abs(posH - negH) < 1e-10, `expected symmetry for -h: ${posH} vs ${negH}`)

	assert.throws(() => laplacian3D('not a fn', 0, 0, 0), TypeError)
	assert.throws(() => laplacian3D(f, 0, 0, 0, 0), RangeError)
	assert.throws(() => laplacian3D(f, 0, 0, 0, Number.NaN), RangeError)
	assert.throws(() => laplacian3D(f, 0, 0, 0, Number.POSITIVE_INFINITY), RangeError)
})
