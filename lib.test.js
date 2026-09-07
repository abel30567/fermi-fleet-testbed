import { test } from 'node:test'
import assert from 'node:assert'
import { add, factorial } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('factorial of 0 is 1', () => {
	assert.equal(factorial(0), 1)
})

test('factorial of 1 is 1', () => {
	assert.equal(factorial(1), 1)
})

test('factorial of 5 is 120', () => {
	assert.equal(factorial(5), 120)
})

test('factorial of 10 is 3628800', () => {
	assert.equal(factorial(10), 3628800)
})

test('factorial throws RangeError for negative input', () => {
	assert.throws(() => factorial(-1), {
		name: 'RangeError',
		message: 'Input must be a non-negative integer',
	})
})

test('factorial throws RangeError for non-integer input', () => {
	assert.throws(() => factorial(2.5), {
		name: 'RangeError',
		message: 'Input must be a non-negative integer',
	})
})

test('factorial throws RangeError for string input', () => {
	assert.throws(() => factorial('5'), {
		name: 'RangeError',
		message: 'Input must be a non-negative integer',
	})
})
