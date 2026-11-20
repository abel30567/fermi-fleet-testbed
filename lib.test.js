import { test } from 'node:test'
import assert from 'node:assert'
import { add, linearRegression } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

const approxEqual = (actual, expected, eps = 1e-10) => {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`expected ${actual} to be within ${eps} of ${expected}`
	)
}

test('linearRegression: exact positive linear fit', () => {
	const { slope, intercept, r2 } = linearRegression([1, 2, 3, 4, 5], [3, 5, 7, 9, 11])
	approxEqual(slope, 2)
	approxEqual(intercept, 1)
	approxEqual(r2, 1)
})

test('linearRegression: exact negative linear fit and two-point boundary', () => {
	const { slope, intercept, r2 } = linearRegression([0, 4], [10, -2])
	approxEqual(slope, -3)
	approxEqual(intercept, 10)
	approxEqual(r2, 1)
})

test('linearRegression: noisy dataset OLS solution and residual orthogonality', () => {
	const xs = [1, 2, 3, 4, 5]
	const ys = [2, 4, 5, 4, 5]
	// meanX = 3, meanY = 4, sxx = 10, sxy = 6, syy = 6 => slope = 0.6, intercept = 2.2, r2 = 0.6
	const { slope, intercept, r2 } = linearRegression(xs, ys)
	approxEqual(slope, 0.6)
	approxEqual(intercept, 2.2)
	approxEqual(r2, 0.6)

	// OLS mathematical identities: sum of residuals = 0 and sum(x_i * residual_i) = 0
	let sumRes = 0
	let sumXRes = 0
	for (let i = 0; i < xs.length; i++) {
		const res = ys[i] - (slope * xs[i] + intercept)
		sumRes += res
		sumXRes += xs[i] * res
	}
	approxEqual(sumRes, 0)
	approxEqual(sumXRes, 0)
})

test('linearRegression: constant y (zero slope) yields r2 = 1', () => {
	const { slope, intercept, r2 } = linearRegression([-2, 0, 5, 10], [7, 7, 7, 7])
	assert.equal(slope, 0)
	assert.equal(intercept, 7)
	assert.equal(r2, 1)
})

test('linearRegression: uncorrelated symmetric data yields slope = 0 and r2 = 0', () => {
	const { slope, intercept, r2 } = linearRegression([-2, -1, 1, 2], [4, 1, 1, 4])
	approxEqual(slope, 0)
	approxEqual(intercept, 2.5)
	approxEqual(r2, 0)
})

test('linearRegression: affine scaling invariance and large-offset numerical stability', () => {
	const baseX = [1, 2, 3, 4]
	const baseY = [2.1, 3.9, 6.2, 7.8]
	const base = linearRegression(baseX, baseY)

	const shiftedX = baseX.map((x) => x + 1e7)
	const scaledY = baseY.map((y) => 3 * y + 5)
	const transformed = linearRegression(shiftedX, scaledY)

	approxEqual(transformed.slope, 3 * base.slope, 1e-8)
	approxEqual(transformed.r2, base.r2, 1e-10)
})

test('linearRegression: throws on invalid inputs', () => {
	assert.throws(() => linearRegression([], []), RangeError)
	assert.throws(() => linearRegression([1], [2]), RangeError)
	assert.throws(() => linearRegression([1, 2], [1, 2, 3]), RangeError)
	assert.throws(() => linearRegression([5, 5, 5], [1, 2, 3]), RangeError)
	assert.throws(() => linearRegression([1, NaN], [1, 2]), TypeError)
	assert.throws(() => linearRegression([1, 2], [1, Infinity]), TypeError)
	assert.throws(() => linearRegression('not-array', [1, 2]), TypeError)
})
