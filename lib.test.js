import { test } from 'node:test'
import assert from 'node:assert'
import { add, polarToCartesian } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('polarToCartesian: r=1, theta=0 -> [1, 0]', () => {
	const [x, y] = polarToCartesian(1, 0)
	assert.equal(x, 1)
	assert.equal(y, 0)
})

test('polarToCartesian: r=2, theta=pi/2 -> [~0, 2]', () => {
	const [x, y] = polarToCartesian(2, Math.PI / 2)
	assert.ok(Math.abs(x) < 1e-9)
	assert.ok(Math.abs(y - 2) < 1e-9)
})

test('polarToCartesian: r=0 -> [0, 0] for any theta', () => {
	const [x, y] = polarToCartesian(0, 1.2345)
	assert.equal(x, 0)
	assert.equal(y, 0)
})

test('polarToCartesian: r=1, theta=pi -> [-1, ~0]', () => {
	const [x, y] = polarToCartesian(1, Math.PI)
	assert.ok(Math.abs(x - -1) < 1e-9)
	assert.ok(Math.abs(y) < 1e-9)
})

test('polarToCartesian: r=1, theta=3pi/2 -> [~0, -1]', () => {
	const [x, y] = polarToCartesian(1, (3 * Math.PI) / 2)
	assert.ok(Math.abs(x) < 1e-9)
	assert.ok(Math.abs(y - -1) < 1e-9)
})

test('polarToCartesian: negative r=-1, theta=0 -> [-1, 0]', () => {
	const [x, y] = polarToCartesian(-1, 0)
	assert.equal(x, -1)
	assert.equal(y, 0)
})
