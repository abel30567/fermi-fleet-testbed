import { test } from 'node:test'
import assert from 'node:assert'
import { add, vecAngle } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('vecAngle returns 0 for identical and positively scaled parallel vectors', () => {
	assert.equal(vecAngle([1, 0], [1, 0]), 0)
	assert.ok(Math.abs(vecAngle([3, 4], [6, 8])) < 1e-15)
	assert.ok(Math.abs(vecAngle([1, -2, 3], [5, -10, 15])) < 1e-15)
})

test('vecAngle returns pi/2 for orthogonal vectors in 2D and 3D', () => {
	assert.ok(Math.abs(vecAngle([1, 0], [0, 1]) - Math.PI / 2) < 1e-15)
	assert.ok(Math.abs(vecAngle([1, 2, -1], [2, -1, 0]) - Math.PI / 2) < 1e-15)
})

test('vecAngle returns pi for antiparallel vectors', () => {
	assert.ok(Math.abs(vecAngle([1, 0], [-1, 0]) - Math.PI) < 1e-15)
	assert.ok(Math.abs(vecAngle([2, -3, 6], [-4, 6, -12]) - Math.PI) < 1e-15)
	assert.ok(Math.abs(vecAngle([5], [-2]) - Math.PI) < 1e-15)
})

test('vecAngle matches known angles and satisfies symmetry and scale invariance', () => {
	assert.ok(Math.abs(vecAngle([1, 0], [1, 1]) - Math.PI / 4) < 1e-15)
	assert.ok(Math.abs(vecAngle([1, 0], [1, Math.sqrt(3)]) - Math.PI / 3) < 1e-15)
	assert.ok(Math.abs(vecAngle([1, 0], [-1, 1]) - (3 * Math.PI) / 4) < 1e-15)

	const u = [2, -5, 1, 3]
	const v = [-1, 4, 2, -2]
	assert.ok(Math.abs(vecAngle(u, v) - vecAngle(v, u)) < 1e-15)
	assert.ok(Math.abs(vecAngle(u, v) - vecAngle(u.map(x => x * 7.5), v.map(x => x * 0.2))) < 1e-15)
	assert.ok(Math.abs(vecAngle(u, v) + vecAngle(u, v.map(x => -x)) - Math.PI) < 1e-15)
})

test('vecAngle remains accurate for very small angles and extreme magnitudes', () => {
	const eps = 1e-10
	const smallAngle = vecAngle([1, 0], [1, eps])
	assert.ok(Math.abs(smallAngle - eps) < 1e-18)

	const hugeAngle = vecAngle([1e200, 0], [0, 1e200])
	assert.ok(Math.abs(hugeAngle - Math.PI / 2) < 1e-15)

	const tinyAngle = vecAngle([1e-200, 0], [1e-200, 1e-200])
	assert.ok(Math.abs(tinyAngle - Math.PI / 4) < 1e-15)
})

test('vecAngle rejects zero vectors, dimension mismatches, empty arrays, and invalid inputs', () => {
	assert.throws(() => vecAngle([0, 0], [1, 0]), RangeError)
	assert.throws(() => vecAngle([1, 0], [0, 0]), RangeError)
	assert.throws(() => vecAngle([], []), RangeError)
	assert.throws(() => vecAngle([1, 2], [1, 2, 3]), RangeError)
	assert.throws(() => vecAngle([NaN, 1], [1, 0]), RangeError)
	assert.throws(() => vecAngle([Infinity, 1], [1, 0]), RangeError)
	assert.throws(() => vecAngle('not-array', [1, 0]), TypeError)
})
