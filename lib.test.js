import { test } from 'node:test'
import assert from 'node:assert'
import { add, arcLength3 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('arcLength3: helix over [0, 2pi] ~ 2pi*sqrt(2)', () => {
	const length = arcLength3(Math.cos, Math.sin, (t) => t, 0, 2 * Math.PI)
	assert.ok(Math.abs(length - 2 * Math.PI * Math.sqrt(2)) < 1e-2)
})

test('arcLength3: straight line segment matches Euclidean distance', () => {
	const length = arcLength3((t) => t, (t) => 2 * t, (t) => 2 * t, 0, 1)
	const expected = Math.sqrt(1 ** 2 + 2 ** 2 + 2 ** 2)
	assert.ok(Math.abs(length - expected) < 1e-6)
})

test('arcLength3: unit circle in xy-plane has length 2*pi', () => {
	const length = arcLength3(Math.cos, Math.sin, () => 0, 0, 2 * Math.PI)
	assert.ok(Math.abs(length - 2 * Math.PI) < 1e-2)
})

test('arcLength3: zero-length interval returns 0', () => {
	const length = arcLength3(Math.cos, Math.sin, (t) => t, 1, 1)
	assert.equal(length, 0)
})

test('arcLength3: respects custom n and converges with more subdivisions', () => {
	const coarse = arcLength3(Math.cos, Math.sin, (t) => t, 0, 2 * Math.PI, 10)
	const fine = arcLength3(Math.cos, Math.sin, (t) => t, 0, 2 * Math.PI, 5000)
	const target = 2 * Math.PI * Math.sqrt(2)
	assert.ok(Math.abs(fine - target) < Math.abs(coarse - target))
})
