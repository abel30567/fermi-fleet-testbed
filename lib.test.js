import { test } from 'node:test'
import assert from 'node:assert'
import { add, laplaceCheck } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('laplaceCheck: x*x - y*y is harmonic', () => {
	const f = (x, y) => x * x - y * y
	assert.equal(laplaceCheck(f, 1, 1), true)
	assert.equal(laplaceCheck(f, 0, 0), true)
	assert.equal(laplaceCheck(f, -2.5, 3.7), true)
})

test('laplaceCheck: x*x + y*y is not harmonic', () => {
	const f = (x, y) => x * x + y * y
	assert.equal(laplaceCheck(f, 1, 1), false)
	assert.equal(laplaceCheck(f, 0, 0), false)
})

test('laplaceCheck: constant and linear functions are harmonic', () => {
	assert.equal(laplaceCheck(() => 42, 0, 0), true)
	assert.equal(laplaceCheck((x, y) => 3 * x + 4 * y, 1, 2), true)
})

test('laplaceCheck: respects custom tol', () => {
	const f = (x, y) => x * x + y * y
	assert.equal(laplaceCheck(f, 1, 1, 10), true)
})
