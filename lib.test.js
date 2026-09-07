import { test } from 'node:test'
import assert from 'node:assert'
import { add, modulo } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('modulo', () => {
	assert.equal(modulo(7, 3), 1)
})

test('modulo zero divisor', () => {
	assert.throws(() => modulo(1, 0), /zero/)
})
