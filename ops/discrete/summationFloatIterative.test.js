import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationFloatIterative } from './summationFloatIterative.js'

describe('summationFloatIterative', () => {
	test('sums integers with default identity termFn', () => {
		assert.equal(summationFloatIterative(1, 5), 15)
		assert.equal(summationFloatIterative(0, 10), 55)
		assert.equal(summationFloatIterative(3, 6), 18)
	})

	test('handles edge cases: empty range, single term, negative bounds, MAX_SAFE_INTEGER bound', () => {
		let calls = 0
		assert.equal(
			summationFloatIterative(5, 4, (k) => {
				calls += 1
				return k
			}),
			0,
		)
		assert.equal(calls, 0)

		assert.equal(summationFloatIterative(7, 7, (k) => k * 2.5), 17.5)
		assert.equal(summationFloatIterative(-5, -1), -15)
		assert.equal(summationFloatIterative(-4, 4), 0)
		assert.equal(summationFloatIterative(-3, 3, (k) => k * k), 28)

		const max = Number.MAX_SAFE_INTEGER
		assert.equal(summationFloatIterative(max, max, () => 42), 42)
		assert.equal(summationFloatIterative(max - 2, max, () => 1.5), 4.5)
	})

	test('sums floating-point terms accurately within float64 tolerance', () => {
		const harmonic10 = summationFloatIterative(1, 10, (k) => 1 / k)
		const expectedHarmonic10 = 7381 / 2520
		assert.ok(Math.abs(harmonic10 - expectedHarmonic10) < 1e-12)

		const alternating = summationFloatIterative(0, 99, (k) => (k % 2 === 0 ? 0.25 : -0.25))
		assert.equal(alternating, 0)

		const dyadic = summationFloatIterative(1, 10, (k) => 2 ** -k)
		assert.equal(dyadic, 1 - 2 ** -10)
	})

	test('cross-checks against closed-form identities', () => {
		// Gauss sum: sum_{k=1}^{n} k = n(n + 1) / 2
		for (const n of [1, 10, 100, 1000]) {
			const expected = (n * (n + 1)) / 2
			assert.equal(summationFloatIterative(1, n), expected)
		}

		// Sum of squares: sum_{k=1}^{n} k^2 = n(n + 1)(2n + 1) / 6
		for (const n of [1, 7, 50, 200]) {
			const expected = (n * (n + 1) * (2 * n + 1)) / 6
			assert.equal(summationFloatIterative(1, n, (k) => k * k), expected)
		}

		// Sum of cubes: sum_{k=1}^{n} k^3 = (n(n + 1) / 2)^2
		for (const n of [1, 6, 25]) {
			const tri = (n * (n + 1)) / 2
			assert.equal(summationFloatIterative(1, n, (k) => k ** 3), tri * tri)
		}

		// Geometric series: sum_{k=0}^{n} r^k = (1 - r^(n + 1)) / (1 - r)
		for (const [r, n] of [
			[0.5, 20],
			[0.25, 15],
			[-0.5, 18],
			[1.2, 12],
		]) {
			const expected = (1 - r ** (n + 1)) / (1 - r)
			const actual = summationFloatIterative(0, n, (k) => r ** k)
			assert.ok(
				Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)),
				`expected ${actual} to be close to ${expected} for r=${r}, n=${n}`,
			)
		}
	})

	test('validates inputs strictly', () => {
		assert.throws(() => summationFloatIterative('1', 5), TypeError)
		assert.throws(() => summationFloatIterative(1, '5'), TypeError)
		assert.throws(() => summationFloatIterative(null, 5), TypeError)
		assert.throws(() => summationFloatIterative(1n, 5), TypeError)

		assert.throws(() => summationFloatIterative(1.5, 5), RangeError)
		assert.throws(() => summationFloatIterative(1, 5.2), RangeError)
		assert.throws(() => summationFloatIterative(Number.NaN, 5), RangeError)
		assert.throws(() => summationFloatIterative(1, Number.POSITIVE_INFINITY), RangeError)
		assert.throws(() => summationFloatIterative(Number.NEGATIVE_INFINITY, 5), RangeError)
		assert.throws(() => summationFloatIterative(Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 2), RangeError)

		assert.throws(() => summationFloatIterative(1, 5, 'not-a-fn'), TypeError)
		assert.throws(() => summationFloatIterative(5, 1, null), TypeError)

		assert.throws(() => summationFloatIterative(1, 3, () => '1'), TypeError)
		assert.throws(() => summationFloatIterative(1, 3, () => Number.NaN), RangeError)
		assert.throws(() => summationFloatIterative(1, 3, () => Number.POSITIVE_INFINITY), RangeError)
		assert.throws(() => summationFloatIterative(1, 3, () => Number.NEGATIVE_INFINITY), RangeError)

		// Overflow of running sum beyond finite float64 range
		assert.throws(() => summationFloatIterative(1, 2, () => Number.MAX_VALUE), RangeError)
	})
})
