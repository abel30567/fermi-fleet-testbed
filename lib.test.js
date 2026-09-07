import { test } from 'node:test'
import assert from 'node:assert'
import { add, angleBetween } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('angleBetween: orthogonal vectors -> ~pi/2', () => {
	const angle = angleBetween([1, 0, 0], [0, 1, 0])
	assert.ok(Math.abs(angle - Math.PI / 2) < 1e-9)
})

test('angleBetween: parallel vectors -> ~0', () => {
	const angle = angleBetween([1, 2, 3], [2, 4, 6])
	assert.ok(Math.abs(angle - 0) < 1e-9)
})

test('angleBetween: anti-parallel vectors -> ~pi', () => {
	const angle = angleBetween([1, 0, 0], [-1, 0, 0])
	assert.ok(Math.abs(angle - Math.PI) < 1e-9)
})

test('angleBetween: works regardless of vector magnitude (normalized)', () => {
	const angle = angleBetween([3, 0, 0], [0, 5, 0])
	assert.ok(Math.abs(angle - Math.PI / 2) < 1e-9)
})

test('angleBetween: throws RangeError on zero vector (first arg)', () => {
	assert.throws(() => angleBetween([0, 0, 0], [1, 0, 0]), RangeError)
})

test('angleBetween: throws RangeError on zero vector (second arg)', () => {
	assert.throws(() => angleBetween([1, 0, 0], [0, 0, 0]), RangeError)
})

test('angleBetween: throws RangeError when both vectors are zero', () => {
	assert.throws(() => angleBetween([0, 0, 0], [0, 0, 0]), RangeError)
})
