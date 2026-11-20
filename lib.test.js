import { test } from 'node:test'
import assert from 'node:assert'
import { add, covariance } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('covariance: positive linear relationship', () => {
	assert.equal(covariance([1, 2, 3, 4], [2, 4, 6, 8]), 2.5)
})

test('covariance: negative linear relationship', () => {
	assert.equal(covariance([1, 2, 3, 4], [8, 6, 4, 2]), -2.5)
})

test('covariance: mathematical identities (symmetry, variance, shift invariance, bilinearity)', () => {
	const xs = [2, 4, 4, 4, 5, 5, 7, 9]
	const ys = [1, 3, 2, 5, 7, 6, 8, 10]

	// Symmetry: Cov(X, Y) === Cov(Y, X)
	assert.equal(covariance(xs, ys), covariance(ys, xs))

	// Self-covariance equals population variance (for xs, variance is 4)
	assert.equal(covariance(xs, xs), 4)

	// Shift invariance: Cov(X + a, Y + b) === Cov(X, Y)
	const shifted = covariance(
		xs.map((x) => x + 1000),
		ys.map((y) => y - 500)
	)
	assert.ok(Math.abs(shifted - covariance(xs, ys)) < 1e-12)

	// Bilinearity / scaling: Cov(aX, bY) === a * b * Cov(X, Y)
	const scaled = covariance(
		xs.map((x) => 3 * x),
		ys.map((y) => -2 * y)
	)
	assert.ok(Math.abs(scaled - -6 * covariance(xs, ys)) < 1e-12)
})

test('covariance: boundary cases (single element, constant arrays, uncorrelated)', () => {
	assert.equal(covariance([42], [-17]), 0)
	assert.equal(covariance([1, 2, 3, 4], [5, 5, 5, 5]), 0)
	assert.equal(covariance([5, 5, 5, 5], [1, 2, 3, 4]), 0)
	assert.equal(covariance([-1, 0, 1], [1, 0, 1]), 0)
	assert.ok(Object.is(covariance([1, 2], [-0, -0]), 0))
})

test('covariance: negative and floating-point values', () => {
	const res = covariance([-1.5, -0.5, 0.5, 1.5], [-3, -1, 1, 3])
	assert.ok(Math.abs(res - 2.5) < 1e-12)
})

test('covariance: throws on empty arrays, mismatched lengths, or non-array inputs', () => {
	assert.throws(() => covariance([], []), /empty/i)
	assert.throws(() => covariance([1, 2], [1, 2, 3]), /equal length/i)
	assert.throws(() => covariance([1], []), /equal length/i)
	assert.throws(() => covariance(null, [1, 2]), TypeError)
	assert.throws(() => covariance([1, 2], '12'), TypeError)
})
