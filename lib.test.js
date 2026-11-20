import { test } from 'node:test'
import assert from 'node:assert'
import { add, lagrangeInterpolate } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('lagrangeInterpolate: linear interpolation and extrapolation', () => {
	const xs = [0, 4]
	const ys = [1, 9]
	assert.equal(lagrangeInterpolate(xs, ys, 2), 5)
	assert.equal(lagrangeInterpolate(xs, ys, -3), -5)
	assert.equal(lagrangeInterpolate(xs, ys, 5.5), 12)
})

test('lagrangeInterpolate: exact recovery of quadratic polynomial', () => {
	const f = (x) => 3 * x * x - 2 * x + 5
	const xs = [-2, 1, 4]
	const ys = xs.map(f)
	for (const x of [-5, -0.5, 0, 2.5, 10]) {
		assert.ok(Math.abs(lagrangeInterpolate(xs, ys, x) - f(x)) < 1e-10)
	}
})

test('lagrangeInterpolate: exact recovery of cubic polynomial and unsorted nodes', () => {
	const f = (x) => x ** 3 - 4 * x ** 2 + x - 7
	const xs = [3, -1, 0, 2]
	const ys = xs.map(f)
	const xsSorted = [-1, 0, 2, 3]
	const ysSorted = xsSorted.map(f)

	for (const x of [-2, 0.5, 1, 2.5, 5]) {
		const val = lagrangeInterpolate(xs, ys, x)
		const valSorted = lagrangeInterpolate(xsSorted, ysSorted, x)
		assert.ok(Math.abs(val - f(x)) < 1e-10)
		assert.ok(Math.abs(val - valSorted) < 1e-10)
	}
})

test('lagrangeInterpolate: exact value at interpolation nodes (Kronecker delta property)', () => {
	const xs = [-3.5, -1, 0, 2.25, 7]
	const ys = [12, -4, 0.5, 9.75, -18]
	for (let i = 0; i < xs.length; i++) {
		assert.equal(lagrangeInterpolate(xs, ys, xs[i]), ys[i])
	}
})

test('lagrangeInterpolate: single point yields constant polynomial', () => {
	assert.equal(lagrangeInterpolate([5], [42], -100), 42)
	assert.equal(lagrangeInterpolate([5], [42], 5), 42)
	assert.equal(lagrangeInterpolate([5], [42], 999), 42)
})

test('lagrangeInterpolate: boundary and invalid inputs throw errors', () => {
	assert.throws(() => lagrangeInterpolate([], [], 1), RangeError)
	assert.throws(() => lagrangeInterpolate([1, 2], [3], 1), RangeError)
	assert.throws(() => lagrangeInterpolate([1, 2, 1], [3, 4, 5], 1.5), RangeError)
	assert.throws(() => lagrangeInterpolate('not-array', [1], 1), TypeError)
	assert.throws(() => lagrangeInterpolate([1, 2], [3, 4], Number.NaN), TypeError)
})
