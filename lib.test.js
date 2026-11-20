import { test } from 'node:test'
import assert from 'node:assert'
import { add, fluxIntegralZ } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('fluxIntegralZ: constant vertical field over horizontal plane', () => {
	const F = () => [0, 0, 5]
	const g = () => 2
	const result = fluxIntegralZ(F, g, 0, 3, 0, 4)
	assert.ok(Math.abs(result - 60) < 1e-9, `expected 60, got ${result}`)
})

test('fluxIntegralZ: constant field through tilted plane', () => {
	const F = () => [2, -3, 1]
	const g = (x, y) => 4 * x + 5 * y + 7
	// (-gx, -gy, 1) = (-4, -5, 1); F · n = -8 + 15 + 1 = 8; area = 6 -> flux = 48
	const result = fluxIntegralZ(F, g, 0, 2, 0, 3)
	assert.ok(Math.abs(result - 48) < 1e-8, `expected 48, got ${result}`)
})

test('fluxIntegralZ: radial field through paraboloid z = x^2 + y^2', () => {
	const F = (x, y, z) => [x, y, z]
	const g = (x, y) => x * x + y * y
	// Integrand = -(x^2 + y^2) over [-1, 1]^2 => -8/3
	const result = fluxIntegralZ(F, g, -1, 1, -1, 1)
	assert.ok(Math.abs(result - (-8 / 3)) < 1e-8, `expected ${-8 / 3}, got ${result}`)
})

test('fluxIntegralZ: divergence theorem on sinusoidal dome', () => {
	const F = (x, y, z) => [x, y, z]
	const g = (x, y) => Math.sin(Math.PI * x) * Math.sin(Math.PI * y)
	// div(F) = 3; bottom z=0 has zero flux; top flux = 3 * (2/pi)^2 = 12/pi^2
	const expected = 12 / (Math.PI * Math.PI)
	const result = fluxIntegralZ(F, g, 0, 1, 0, 1, 40, 40)
	assert.ok(Math.abs(result - expected) < 1e-6, `expected ${expected}, got ${result}`)
})

test('fluxIntegralZ: vector field tangent to surface has zero flux', () => {
	const g = (x, y) => x * x - y * y + x * y
	// Tangent vector (1, 0, gx) + (0, 1, gy) = (1, 1, 3x - y)
	const F = (x, y) => [1, 1, (2 * x + y) + (-2 * y + x)]
	const result = fluxIntegralZ(F, g, -2, 3, -1, 2)
	assert.ok(Math.abs(result) < 1e-8, `expected 0, got ${result}`)
})

test('fluxIntegralZ: linearity in vector field F', () => {
	const F1 = (x, y, z) => [y, -x, z]
	const F2 = (x, y, z) => [x * z, y * y, Math.cos(x)]
	const g = (x, y) => 0.5 * x * x + Math.sin(y)
	const a = 2.5
	const b = -1.75
	const Fcomb = (x, y, z) => {
		const [fx1, fy1, fz1] = F1(x, y, z)
		const [fx2, fy2, fz2] = F2(x, y, z)
		return [a * fx1 + b * fx2, a * fy1 + b * fy2, a * fz1 + b * fz2]
	}
	const lhs = fluxIntegralZ(Fcomb, g, 0, 2, -1, 1)
	const rhs = a * fluxIntegralZ(F1, g, 0, 2, -1, 1) + b * fluxIntegralZ(F2, g, 0, 2, -1, 1)
	assert.ok(Math.abs(lhs - rhs) < 1e-8, `expected ${rhs}, got ${lhs}`)
})

test('fluxIntegralZ: boundary cases and input validation', () => {
	const F = (x, y, z) => [x, y, z + 1]
	const g = (x, y) => x + y
	assert.equal(fluxIntegralZ(F, g, 1, 1, 0, 2), 0)
	assert.equal(fluxIntegralZ(F, g, 0, 2, 3, 3), 0)

	const forward = fluxIntegralZ(F, g, 0, 2, 0, 3)
	const reversedX = fluxIntegralZ(F, g, 2, 0, 0, 3)
	const reversedBoth = fluxIntegralZ(F, g, 2, 0, 3, 0)
	assert.ok(Math.abs(forward + reversedX) < 1e-9)
	assert.ok(Math.abs(forward - reversedBoth) < 1e-9)

	assert.throws(() => fluxIntegralZ(null, g, 0, 1, 0, 1), TypeError)
	assert.throws(() => fluxIntegralZ(F, null, 0, 1, 0, 1), TypeError)
	assert.throws(() => fluxIntegralZ(F, g, 0, 1, 0, 1, 0, 10), RangeError)
	assert.throws(() => fluxIntegralZ(F, g, 0, 1, 0, 1, 10, -5), RangeError)
	assert.throws(() => fluxIntegralZ(F, g, 0, 1, 0, 1, 1.5, 10), RangeError)
})
