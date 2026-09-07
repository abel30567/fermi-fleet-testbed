import { test } from 'node:test'
import assert from 'node:assert'
import { add, gcd } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('gcd of 12 and 8 is 4', () => {
	assert.equal(gcd(12, 8), 4)
})

test('gcd of coprimes 17 and 5 is 1', () => {
	assert.equal(gcd(17, 5), 1)
})

test('gcd(0, 5) is 5', () => {
	assert.equal(gcd(0, 5), 5)
})

test('gcd(5, 0) is 5', () => {
	assert.equal(gcd(5, 0), 5)
})

test('gcd(0, 0) is 0', () => {
	assert.equal(gcd(0, 0), 0)
})

test('gcd handles negative values', () => {
	assert.equal(gcd(-12, 8), 4)
	assert.equal(gcd(12, -8), 4)
	assert.equal(gcd(-12, -8), 4)
})

test('gcd is commutative', () => {
	assert.equal(gcd(8, 12), gcd(12, 8))
})

test('gcd of equal values', () => {
	assert.equal(gcd(7, 7), 7)
})

test('gcd where one divides the other', () => {
	assert.equal(gcd(15, 5), 5)
})
