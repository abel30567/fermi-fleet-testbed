import { test } from 'node:test'
import assert from 'node:assert'
import { add, bisectionRoot } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('bisectionRoot finds square root of 2', () => {
	const root = bisectionRoot((x) => x * x - 2, 0, 2)
	assert.ok(Math.abs(root - Math.SQRT2) <= 1e-10)
	assert.ok(Math.abs(root * root - 2) <= 1e-9)
})

test('bisectionRoot finds transcendental roots (cos and exp)', () => {
	const piHalf = bisectionRoot((x) => Math.cos(x), 0, 3)
	assert.ok(Math.abs(piHalf - Math.PI / 2) <= 1e-10)

	const ln5 = bisectionRoot((x) => Math.exp(x) - 5, 0, 3)
	assert.ok(Math.abs(ln5 - Math.log(5)) <= 1e-10)
})

test('bisectionRoot solves cubic equation and satisfies f(root) approx 0', () => {
	const f = (x) => x ** 3 - x - 2
	const root = bisectionRoot(f, 1, 2, 1e-12)
	assert.ok(Math.abs(f(root)) <= 1e-10)
	assert.ok(Math.abs(root - 1.5213797068045676) <= 1e-12)
})

test('bisectionRoot handles decreasing functions, negative intervals, and reversed bounds', () => {
	const linear = bisectionRoot((x) => 3 - 2 * x, 0, 5)
	assert.ok(Math.abs(linear - 1.5) <= 1e-10)

	const negRoot = bisectionRoot((x) => x * x - 9, -5, -1)
	assert.ok(Math.abs(negRoot - -3) <= 1e-10)

	const reversed = bisectionRoot((x) => x * x - 2, 2, 0)
	assert.ok(Math.abs(reversed - Math.SQRT2) <= 1e-10)
})

test('bisectionRoot returns exact root at endpoints and zero-width interval', () => {
	assert.equal(bisectionRoot((x) => x - 4, 4, 10), 4)
	assert.equal(bisectionRoot((x) => x - 10, 4, 10), 10)
	assert.equal(bisectionRoot((x) => x, 0, 0), 0)
})

test('bisectionRoot respects custom tolerance and maxIter', () => {
	const root1 = bisectionRoot((x) => x - 0.3, 0, 1, 1e-3, 100)
	assert.ok(Math.abs(root1 - 0.3) <= 1e-3)

	const approx = bisectionRoot((x) => x - 0.8, 0, 1, 1e-12, 1)
	assert.equal(approx, 0.75)
})

test('bisectionRoot throws on invalid bracket or arguments', () => {
	assert.throws(() => bisectionRoot((x) => x * x + 1, -2, 2), RangeError)
	assert.throws(() => bisectionRoot(() => 1e-200, 0, 1), RangeError)
	assert.throws(() => bisectionRoot('not-a-fn', 0, 1), TypeError)
	assert.throws(() => bisectionRoot((x) => x, -1, 1, 0), RangeError)
	assert.throws(() => bisectionRoot((x) => x, -1, 1, 1e-6, 0), RangeError)
})
