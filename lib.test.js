import { test } from 'node:test'
import assert from 'node:assert'
import { add, isPrime } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('isPrime returns true for 2', () => {
	assert.strictEqual(isPrime(2), true)
})

test('isPrime returns true for 3', () => {
	assert.strictEqual(isPrime(3), true)
})

test('isPrime returns true for 97', () => {
	assert.strictEqual(isPrime(97), true)
})

test('isPrime returns false for 1', () => {
	assert.strictEqual(isPrime(1), false)
})

test('isPrime returns false for 0', () => {
	assert.strictEqual(isPrime(0), false)
})

test('isPrime returns false for negative numbers', () => {
	assert.strictEqual(isPrime(-7), false)
})

test('isPrime returns false for 100', () => {
	assert.strictEqual(isPrime(100), false)
})

test('isPrime returns false for non-integer 2.5', () => {
	assert.strictEqual(isPrime(2.5), false)
})

test('isPrime returns false for 4', () => {
	assert.strictEqual(isPrime(4), false)
})

test('isPrime returns false for 9', () => {
	assert.strictEqual(isPrime(9), false)
})

test('isPrime returns true for large prime 7919', () => {
	assert.strictEqual(isPrime(7919), true)
})
