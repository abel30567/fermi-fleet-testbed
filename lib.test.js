import { test } from 'node:test'
import assert from 'node:assert'
import { add, normalizeN } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('normalizeN: 2D vector', () => {
	assert.deepEqual(normalizeN([0, 5]), [0, 1])
})

test('normalizeN: 3D vector', () => {
	const result = normalizeN([2, 0, 0])
	assert.deepEqual(result, [1, 0, 0])
})

test('normalizeN: arbitrary N-dimensional vector', () => {
	const result = normalizeN([1, 1, 1, 1])
	for (const x of result) {
		assert.ok(Math.abs(x - 0.5) < 1e-12)
	}
	const magnitude = Math.sqrt(result.reduce((sum, x) => sum + x * x, 0))
	assert.ok(Math.abs(magnitude - 1) < 1e-12)
})

test('normalizeN: already unit vector is unchanged', () => {
	const result = normalizeN([1, 0])
	assert.deepEqual(result, [1, 0])
})

test('normalizeN: negative components', () => {
	const result = normalizeN([-3, 4])
	assert.deepEqual(result, [-0.6, 0.8])
})

test('normalizeN: single-dimension vector', () => {
	assert.deepEqual(normalizeN([-7]), [-1])
})

test('normalizeN: throws RangeError on zero vector', () => {
	assert.throws(() => normalizeN([0, 0, 0]), RangeError)
})

test('normalizeN: throws RangeError on single-element zero vector', () => {
	assert.throws(() => normalizeN([0]), RangeError)
})
