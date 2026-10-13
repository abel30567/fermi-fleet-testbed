import { test } from 'node:test'
import assert from 'node:assert'
import { add, rotate2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('rotate2D 90deg maps [1,0] to [0,1]', () => {
	const [x, y] = rotate2D([1, 0], Math.PI / 2)
	assert.ok(Math.abs(x - 0) < 1e-9, `x=${x}`)
	assert.ok(Math.abs(y - 1) < 1e-9, `y=${y}`)
})

test('rotate2D 180deg maps [1,0] to [-1,0]', () => {
	const [x, y] = rotate2D([1, 0], Math.PI)
	assert.ok(Math.abs(x - -1) < 1e-9, `x=${x}`)
	assert.ok(Math.abs(y - 0) < 1e-9, `y=${y}`)
})

test('rotate2D -90deg maps [0,1] to [1,0]', () => {
	const [x, y] = rotate2D([0, 1], -Math.PI / 2)
	assert.ok(Math.abs(x - 1) < 1e-9, `x=${x}`)
	assert.ok(Math.abs(y - 0) < 1e-9, `y=${y}`)
})

test('rotate2D by 0 is identity', () => {
	assert.deepEqual(rotate2D([3, -4], 0), [3, -4])
})

test('rotate2D by 2PI is identity', () => {
	const [x, y] = rotate2D([1, 0], 2 * Math.PI)
	assert.ok(Math.abs(x - 1) < 1e-9, `x=${x}`)
	assert.ok(Math.abs(y - 0) < 1e-9, `y=${y}`)
})

test('rotate2D preserves vector length', () => {
	const [x, y] = rotate2D([2, 0], Math.PI / 2)
	assert.ok(Math.abs(x - 0) < 1e-9, `x=${x}`)
	assert.ok(Math.abs(y - 2) < 1e-9, `y=${y}`)
})
