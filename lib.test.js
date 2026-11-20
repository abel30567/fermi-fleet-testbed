import { test } from 'node:test'
import assert from 'node:assert'
import { add, meanVariance } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('meanVariance computes exact population statistics for textbook dataset', () => {
	const result = meanVariance([2, 4, 4, 4, 5, 5, 7, 9])
	assert.equal(result.mean, 5)
	assert.equal(result.variance, 4)
	assert.equal(result.stdDev, 2)
})

test('meanVariance handles single-element and constant arrays', () => {
	assert.deepEqual(meanVariance([42]), { mean: 42, variance: 0, stdDev: 0 })
	assert.deepEqual(meanVariance([-7, -7, -7, -7]), { mean: -7, variance: 0, stdDev: 0 })
})

test('meanVariance handles negative and floating-point values', () => {
	const result = meanVariance([-5, -3, -1, 1, 3, 5])
	assert.equal(result.mean, 0)
	assert.ok(Math.abs(result.variance - 70 / 6) < 1e-12)
	assert.ok(Math.abs(result.stdDev - Math.sqrt(70 / 6)) < 1e-12)
})

test('meanVariance satisfies shift invariance and scale identities', () => {
	const base = [1.5, 3.25, 6.75, 10.5]
	const baseStats = meanVariance(base)

	const shift = 100
	const shifted = meanVariance(base.map((x) => x + shift))
	assert.ok(Math.abs(shifted.mean - (baseStats.mean + shift)) < 1e-12)
	assert.ok(Math.abs(shifted.variance - baseStats.variance) < 1e-12)
	assert.ok(Math.abs(shifted.stdDev - baseStats.stdDev) < 1e-12)

	const scale = -3
	const scaled = meanVariance(base.map((x) => x * scale))
	assert.ok(Math.abs(scaled.mean - baseStats.mean * scale) < 1e-12)
	assert.ok(Math.abs(scaled.variance - baseStats.variance * scale * scale) < 1e-12)
	assert.ok(Math.abs(scaled.stdDev - baseStats.stdDev * Math.abs(scale)) < 1e-12)
})

test('meanVariance maintains numerical stability for large offsets', () => {
	const result = meanVariance([1e9 + 1, 1e9 + 2, 1e9 + 3])
	assert.equal(result.mean, 1e9 + 2)
	assert.ok(Math.abs(result.variance - 2 / 3) < 1e-12)
	assert.ok(Math.abs(result.stdDev - Math.sqrt(2 / 3)) < 1e-12)
})

test('meanVariance throws on empty or invalid inputs', () => {
	assert.throws(() => meanVariance([]), /non-empty array/)
	assert.throws(() => meanVariance(null), /non-empty array/)
	assert.throws(() => meanVariance([1, NaN, 3]), TypeError)
	assert.throws(() => meanVariance([1, Infinity]), TypeError)
	assert.throws(() => meanVariance([1, '2']), TypeError)
})
