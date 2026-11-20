import { test } from 'node:test'
import assert from 'node:assert'
import { add, pearsonCorrelation } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('pearsonCorrelation returns +1 and -1 for perfect linear relationships', () => {
	assert.ok(Math.abs(pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]) - 1) < 1e-12)
	assert.ok(Math.abs(pearsonCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]) - (-1)) < 1e-12)
	assert.ok(Math.abs(pearsonCorrelation([-3, -1, 0, 2, 7], [-3, -1, 0, 2, 7]) - 1) < 1e-12)
})

test('pearsonCorrelation computes zero and known partial correlations accurately', () => {
	assert.equal(pearsonCorrelation([-2, -1, 0, 1, 2], [4, 1, 0, 1, 4]), 0)
	const expected = 6.5 / Math.sqrt(5 * 8.75)
	const actual = pearsonCorrelation([1, 2, 3, 4], [1, 2, 3, 5])
	assert.ok(Math.abs(actual - expected) < 1e-12)
})

test('pearsonCorrelation satisfies symmetry and affine invariance identities', () => {
	const xs = [1.5, 3.2, 4.7, 6.1, 8.9, 10.4]
	const ys = [2.1, 2.9, 5.5, 5.0, 9.2, 8.8]
	const rXY = pearsonCorrelation(xs, ys)
	const rYX = pearsonCorrelation(ys, xs)
	assert.ok(Math.abs(rXY - rYX) < 1e-12)

	const xsScaled = xs.map((x) => 7.5 * x - 120)
	const ysScaled = ys.map((y) => 0.25 * y + 42)
	assert.ok(Math.abs(pearsonCorrelation(xsScaled, ysScaled) - rXY) < 1e-12)

	const ysNeg = ys.map((y) => -3 * y + 10)
	assert.ok(Math.abs(pearsonCorrelation(xs, ysNeg) + rXY) < 1e-12)
})

test('pearsonCorrelation handles boundary lengths and stays clamped to [-1, 1]', () => {
	assert.equal(pearsonCorrelation([1, 2], [10, 20]), 1)
	assert.equal(pearsonCorrelation([1, 2], [20, 10]), -1)

	const vals = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]
	const rSelf = pearsonCorrelation(vals, vals)
	assert.ok(rSelf >= -1 && rSelf <= 1)
	assert.ok(Math.abs(rSelf - 1) < 1e-12)

	const largeX = [1e100, 2e100, 3e100, 4e100]
	const largeY = [2e100, 4e100, 6e100, 8e100]
	assert.ok(Math.abs(pearsonCorrelation(largeX, largeY) - 1) < 1e-12)
})

test('pearsonCorrelation throws on length mismatch, zero variance, or invalid inputs', () => {
	assert.throws(() => pearsonCorrelation([1, 2, 3], [1, 2]), /same length/)
	assert.throws(() => pearsonCorrelation([], []), /at least 2/)
	assert.throws(() => pearsonCorrelation([5], [10]), /at least 2/)
	assert.throws(() => pearsonCorrelation([3, 3, 3], [1, 2, 3]), /Zero variance/)
	assert.throws(() => pearsonCorrelation([1, 2, 3], [7, 7, 7]), /Zero variance/)
	assert.throws(() => pearsonCorrelation([1, 2, 3], [1, NaN, 3]), /finite numbers/)
	assert.throws(() => pearsonCorrelation([1, Infinity, 3], [1, 2, 3]), /finite numbers/)
	assert.throws(() => pearsonCorrelation('not-array', [1, 2]), /must be arrays/)
})
