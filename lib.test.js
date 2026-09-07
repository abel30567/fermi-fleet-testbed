import { test } from 'node:test'
import assert from 'node:assert'
import { add, divide } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('divide', () => {
	assert.equal(divide(10, 2), 5)
})

test('divide by zero throws', () => {
	assert.throws(() => divide(1, 0), { message: /zero/ })
})
