import { test } from 'node:test'
import assert from 'node:assert'
import { add, rejectFrom } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('rejectFrom basic case', () => {
	assert.deepEqual(rejectFrom([2, 2, 0], [1, 0, 0]), [0, 2, 0])
})

test('rejectFrom result is perpendicular to v', () => {
	const u = [3, 4, 5]
	const v = [1, 2, 3]
	const r = rejectFrom(u, v)
	const dot = r.reduce((sum, ri, i) => sum + ri * v[i], 0)
	assert.ok(Math.abs(dot) < 1e-9)
})

test('rejectFrom of u parallel to v is the zero vector', () => {
	const r = rejectFrom([2, 4, 6], [1, 2, 3])
	r.forEach((ri) => assert.ok(Math.abs(ri) < 1e-9))
})

test('rejectFrom of u already perpendicular to v returns u unchanged', () => {
	const u = [0, 1, 0]
	const v = [1, 0, 0]
	assert.deepEqual(rejectFrom(u, v), u)
})

test('rejectFrom works in 2D', () => {
	assert.deepEqual(rejectFrom([3, 4], [1, 0]), [0, 4])
})
