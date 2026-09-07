import { test } from 'node:test'
import assert from 'node:assert'
import { add, det2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('det2: spec example', () => {
	assert.equal(det2([[1, 2], [3, 4]]), -2)
})

test('det2: identity matrix', () => {
	assert.equal(det2([[1, 0], [0, 1]]), 1)
})

test('det2: zero matrix', () => {
	assert.equal(det2([[0, 0], [0, 0]]), 0)
})

test('det2: negative and fractional values', () => {
	assert.equal(det2([[-2, 3], [1.5, 4]]), -12.5)
})

test('det2: singular matrix (linearly dependent rows)', () => {
	assert.equal(det2([[2, 4], [1, 2]]), 0)
})
