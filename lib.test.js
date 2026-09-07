import { test } from 'node:test'
import assert from 'node:assert'
import { add, distanceN } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('distanceN: 4D unit distance', () => {
	assert.equal(distanceN([0, 0, 0, 0], [1, 1, 1, 1]), 2)
})

test('distanceN: same point is zero', () => {
	assert.equal(distanceN([1, 2, 3], [1, 2, 3]), 0)
})

test('distanceN: 1D distance', () => {
	assert.equal(distanceN([0], [5]), 5)
})

test('distanceN: 2D 3-4-5 triangle', () => {
	assert.equal(distanceN([0, 0], [3, 4]), 5)
})

test('distanceN: negative coordinates', () => {
	assert.equal(distanceN([-1, -1], [2, 3]), 5)
})

test('distanceN: throws RangeError on length mismatch', () => {
	assert.throws(() => distanceN([1, 2], [1, 2, 3]), RangeError)
})

test('distanceN: throws RangeError on empty vs non-empty', () => {
	assert.throws(() => distanceN([], [1]), RangeError)
})

test('distanceN: empty arrays give zero distance', () => {
	assert.equal(distanceN([], []), 0)
})
