import { test } from 'node:test'
import assert from 'node:assert'
import { add, normalize } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('normalize: unit vector along x-axis', () => {
	assert.deepEqual(normalize([3, 0, 0]), [1, 0, 0])
})

test('normalize: result has length ~1', () => {
	const [x, y, z] = normalize([1, 2, 3])
	const length = Math.sqrt(x * x + y * y + z * z)
	assert.ok(Math.abs(length - 1) < 1e-9)
})

test('normalize: negative components', () => {
	const [x, y, z] = normalize([-4, 0, 0])
	assert.deepEqual([x, y, z], [-1, 0, 0])
})

test('normalize: throws RangeError on zero vector', () => {
	assert.throws(() => normalize([0, 0, 0]), RangeError)
})
