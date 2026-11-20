import { test } from 'node:test'
import assert from 'node:assert'
import { add, taylorExp } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('taylorExp computes e^0 and e^1 with default terms', () => {
	assert.equal(taylorExp(0), 1)
	assert.ok(Math.abs(taylorExp(1) - Math.E) < 1e-12)
})

test('taylorExp matches exact truncated polynomial sums for small terms', () => {
	assert.equal(taylorExp(5, 0), 0)
	assert.equal(taylorExp(5, 1), 1)
	assert.equal(taylorExp(0, 1), 1)
	assert.equal(taylorExp(2, 2), 3) // 1 + 2
	assert.equal(taylorExp(2, 3), 5) // 1 + 2 + 4/2
	assert.equal(taylorExp(0.5, 3), 1.625) // 1 + 0.5 + 0.125
	assert.ok(Math.abs(taylorExp(1, 4) - (1 + 1 + 0.5 + 1 / 6)) < 1e-15)
})

test('taylorExp handles negative and fractional inputs accurately', () => {
	assert.ok(Math.abs(taylorExp(-1) - Math.exp(-1)) < 1e-12)
	assert.ok(Math.abs(taylorExp(-2, 25) - Math.exp(-2)) < 1e-12)
	assert.ok(Math.abs(taylorExp(0.5) - Math.exp(0.5)) < 1e-12)
	assert.ok(Math.abs(taylorExp(2.5, 25) - Math.exp(2.5)) < 1e-12)
})

test('taylorExp satisfies exponential mathematical identities', () => {
	const a = 1.2
	const b = 0.8
	assert.ok(Math.abs(taylorExp(a + b, 30) - taylorExp(a, 30) * taylorExp(b, 30)) < 1e-12)
	assert.ok(Math.abs(taylorExp(1.5, 30) * taylorExp(-1.5, 30) - 1) < 1e-12)
})

test('taylorExp handles large term counts without factorial overflow', () => {
	const result = taylorExp(5, 200)
	assert.ok(Number.isFinite(result))
	assert.ok(Math.abs(result - Math.exp(5)) < 1e-10)
})

test('taylorExp handles edge cases and invalid inputs', () => {
	assert.ok(Number.isNaN(taylorExp(NaN)))
	assert.throws(() => taylorExp(1, -1), RangeError)
	assert.throws(() => taylorExp(1, 2.5), RangeError)
	assert.throws(() => taylorExp(1, NaN), RangeError)
	assert.throws(() => taylorExp(1, Infinity), RangeError)
})
