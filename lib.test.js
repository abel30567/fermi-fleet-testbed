import { test } from 'node:test'
import assert from 'node:assert'
import { add, surfaceArea } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('surfaceArea of a flat horizontal plane equals rectangle area', () => {
	const area = surfaceArea(() => 7, -2, 3, 1, 5)
	assert.ok(Math.abs(area - 20) < 1e-12, `expected 20, got ${area}`)
})

test('surfaceArea of a tilted plane matches exact analytical formula', () => {
	// z = 3x - 4y + 2 => sqrt(1 + 9 + 16) = sqrt(26)
	const area = surfaceArea((x, y) => 3 * x - 4 * y + 2, 0, 2, -1, 4)
	const expected = 2 * 5 * Math.sqrt(26)
	assert.ok(Math.abs(area - expected) < 1e-9, `expected ${expected}, got ${area}`)
})

test('surfaceArea of parabolic trough z = x^2 matches exact integral', () => {
	// int_0^1 sqrt(1 + 4x^2) dx = sqrt(5)/2 + asinh(2)/4
	const area = surfaceArea((x) => x * x, 0, 1, 0, 1)
	const expected = Math.sqrt(5) / 2 + Math.asinh(2) / 4
	assert.ok(Math.abs(area - expected) < 1e-9, `expected ${expected}, got ${area}`)
})

test('surfaceArea of cylindrical arc z = sqrt(R^2 - x^2) matches R * L * pi / 3', () => {
	const R = 2
	const L = 3
	const area = surfaceArea((x) => Math.sqrt(R * R - x * x), -R / 2, R / 2, 0, L)
	const expected = (R * L * Math.PI) / 3
	assert.ok(Math.abs(area - expected) < 1e-7, `expected ${expected}, got ${area}`)
})

test('surfaceArea satisfies vertical shift, reflection, and bound-order invariance', () => {
	const f = (x, y) => Math.sin(x) * Math.cos(y)
	const base = surfaceArea(f, -1, 1.5, -0.5, 2)
	const shifted = surfaceArea((x, y) => f(x, y) + 100, -1, 1.5, -0.5, 2)
	const reflected = surfaceArea((x, y) => -f(x, y), -1, 1.5, -0.5, 2)
	const reversed = surfaceArea(f, 1.5, -1, 2, -0.5)

	assert.ok(Math.abs(base - shifted) < 1e-8)
	assert.ok(Math.abs(base - reflected) < 1e-12)
	assert.ok(Math.abs(base - reversed) < 1e-12)
})

test('surfaceArea handles degenerate intervals and validates invalid arguments', () => {
	assert.equal(surfaceArea((x, y) => x * y, 2, 2, 0, 5), 0)
	assert.equal(surfaceArea((x, y) => x * y, 0, 5, -3, -3), 0)
	assert.throws(() => surfaceArea(null, 0, 1, 0, 1), TypeError)
	assert.throws(() => surfaceArea(() => 0, 0, 1, 0, 1, 0, 10), RangeError)
	assert.throws(() => surfaceArea(() => 0, 0, 1, 0, 1, 10, 2.5), RangeError)
	assert.throws(() => surfaceArea(() => 0, 0, Infinity, 0, 1), RangeError)
})
