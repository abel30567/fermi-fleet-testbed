import { test } from 'node:test'
import assert from 'node:assert'
import { add, gcd, lcm } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('gcd', () => {
	assert.equal(gcd(4, 6), 2)
	assert.equal(gcd(12, 8), 4)
	assert.equal(gcd(7, 13), 1)
	assert.equal(gcd(0, 5), 5)
	assert.equal(gcd(5, 0), 5)
	assert.equal(gcd(-4, 6), 2)
})

test('lcm basic', () => {
	assert.equal(lcm(4, 6), 12)
	assert.equal(lcm(3, 5), 15)
})

test('lcm with zero', () => {
	assert.equal(lcm(0, 5), 0)
	assert.equal(lcm(5, 0), 0)
	assert.equal(lcm(0, 0), 0)
})

test('lcm with negatives', () => {
	assert.equal(lcm(-4, 6), 12)
	assert.equal(lcm(4, -6), 12)
	assert.equal(lcm(-3, -5), 15)
})

test('lcm with equal values', () => {
	assert.equal(lcm(7, 7), 7)
})

test('lcm with one', () => {
	assert.equal(lcm(1, 5), 5)
	assert.equal(lcm(5, 1), 5)
})

test('lcm with coprime numbers', () => {
	assert.equal(lcm(7, 13), 91)
})
