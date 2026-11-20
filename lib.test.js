import { test } from 'node:test'
import assert from 'node:assert'
import { add, normalStats } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

const approxEqual = (actual, expected, tol = 1e-6) => {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`expected ${actual} to be within ${tol} of ${expected}`
	)
}

test('normalStats standard normal at mean x = 0', () => {
	const { pdf, cdf } = normalStats(0)
	approxEqual(pdf, 1 / Math.sqrt(2 * Math.PI), 1e-12)
	assert.equal(cdf, 0.5)
})

test('normalStats empirical 68-95-99.7 rule for standard normal', () => {
	approxEqual(normalStats(1).cdf - normalStats(-1).cdf, 0.68268949, 1e-6)
	approxEqual(normalStats(2).cdf - normalStats(-2).cdf, 0.95449974, 1e-6)
	approxEqual(normalStats(3).cdf - normalStats(-3).cdf, 0.99730020, 1e-6)
	approxEqual(normalStats(1.96).cdf, 0.9750021, 1e-6)
})

test('normalStats symmetry identities around arbitrary mean', () => {
	const mean = 12.5
	const std = 3.2
	for (const delta of [0.5, 1.75, 4.0, 9.5]) {
		const left = normalStats(mean - delta, mean, std)
		const right = normalStats(mean + delta, mean, std)
		approxEqual(left.pdf, right.pdf, 1e-12)
		approxEqual(left.cdf + right.cdf, 1, 1e-12)
	}
})

test('normalStats standardization scaling and shifting invariance', () => {
	const mean = -4.2
	const std = 2.5
	for (const z of [-2.3, -0.7, 0.4, 1.8]) {
		const stdNorm = normalStats(z)
		const scaled = normalStats(mean + z * std, mean, std)
		approxEqual(scaled.cdf, stdNorm.cdf, 1e-12)
		approxEqual(scaled.pdf * std, stdNorm.pdf, 1e-12)
	}
})

test('normalStats numerical derivative of cdf matches pdf', () => {
	const h = 1e-4
	const mean = 5
	const std = 2
	for (const x of [2, 5, 7.5]) {
		const deriv = (normalStats(x + h, mean, std).cdf - normalStats(x - h, mean, std).cdf) / (2 * h)
		approxEqual(deriv, normalStats(x, mean, std).pdf, 1e-5)
	}
})

test('normalStats handles extreme tails and infinities', () => {
	assert.deepEqual(normalStats(Infinity, 10, 2), { pdf: 0, cdf: 1 })
	assert.deepEqual(normalStats(-Infinity, 10, 2), { pdf: 0, cdf: 0 })

	const high = normalStats(50)
	assert.equal(high.pdf, 0)
	assert.equal(high.cdf, 1)

	const low = normalStats(-50)
	assert.equal(low.pdf, 0)
	assert.equal(low.cdf, 0)
})

test('normalStats throws RangeError on invalid inputs', () => {
	assert.throws(() => normalStats(0, 0, 0), RangeError)
	assert.throws(() => normalStats(0, 0, -1), RangeError)
	assert.throws(() => normalStats(0, 0, Infinity), RangeError)
	assert.throws(() => normalStats(0, NaN, 1), RangeError)
	assert.throws(() => normalStats(NaN, 0, 1), RangeError)
})
