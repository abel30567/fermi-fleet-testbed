import { test } from 'node:test'
import assert from 'node:assert'
import { add, vecNorm } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('vecNorm default L2 (Euclidean) norm', () => {
	assert.equal(vecNorm([3, 4]), 5)
	assert.equal(vecNorm([-3, -4]), 5)
	assert.ok(Math.abs(vecNorm([1, 2, 2]) - 3) < 1e-12)
	assert.ok(Math.abs(vecNorm([1, 1], 2) - Math.SQRT2) < 1e-12)
})

test('vecNorm L1 (Manhattan) and L-infinity (max) norms', () => {
	assert.equal(vecNorm([3, -4, 2], 1), 9)
	assert.equal(vecNorm([-1.5, 2.5, -3], 1), 7)
	assert.equal(vecNorm([3, -4, 2], Infinity), 4)
	assert.equal(vecNorm([-7, 5, 0], Infinity), 7)
})

test('vecNorm general p > 0 including fractional p', () => {
	assert.ok(Math.abs(vecNorm([1, 2, 3], 3) - Math.cbrt(36)) < 1e-12)
	assert.ok(Math.abs(vecNorm([1, 1], 0.5) - 4) < 1e-12)
	assert.ok(Math.abs(vecNorm([2, -2], 4) - 2 * Math.pow(2, 0.25)) < 1e-12)
})

test('vecNorm mathematical identities (homogeneity, triangle inequality, monotonicity)', () => {
	const u = [1.5, -2.5, 4]
	const v = [-3, 1, 2.5]
	const sum = u.map((x, i) => x + v[i])
	const scale = -3.5

	for (const p of [1, 2, 3, Infinity]) {
		const scaled = u.map((x) => scale * x)
		assert.ok(Math.abs(vecNorm(scaled, p) - Math.abs(scale) * vecNorm(u, p)) < 1e-11)
		assert.ok(vecNorm(sum, p) <= vecNorm(u, p) + vecNorm(v, p) + 1e-12)
	}

	assert.ok(vecNorm(u, 1) >= vecNorm(u, 2))
	assert.ok(vecNorm(u, 2) >= vecNorm(u, 3))
	assert.ok(vecNorm(u, 3) >= vecNorm(u, Infinity))
})

test('vecNorm boundary, numerical stability, and error cases', () => {
	assert.equal(vecNorm([]), 0)
	assert.equal(vecNorm([], 1), 0)
	assert.equal(vecNorm([], Infinity), 0)
	assert.equal(vecNorm([0, 0, 0]), 0)
	assert.equal(vecNorm([-5]), 5)

	assert.ok(Math.abs(vecNorm([3e200, 4e200], 2) - 5e200) / 5e200 < 1e-12)
	assert.ok(Math.abs(vecNorm([3e-200, 4e-200], 2) - 5e-200) / 5e-200 < 1e-12)

	assert.ok(Number.isNaN(vecNorm([1, NaN], 2)))
	assert.equal(vecNorm([1, -Infinity], 2), Infinity)

	assert.throws(() => vecNorm('not an array'), TypeError)
	assert.throws(() => vecNorm([1, 2], 0), RangeError)
	assert.throws(() => vecNorm([1, 2], -2), RangeError)
	assert.throws(() => vecNorm([1, 2], NaN), RangeError)
})
