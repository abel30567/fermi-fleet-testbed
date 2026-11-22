import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productFloatIterative } from './productFloatIterative.js'

const assertApproxEqual = (actual, expected, relTol = 1e-12, absTol = 1e-12) => {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be approximately equal to ${expected} (diff=${diff}, limit=${limit})`,
	)
}

describe('productFloatIterative', () => {
	describe('normal cases', () => {
		test('uses default identity termFn (k) => k', () => {
			assert.equal(productFloatIterative(1, 5), 120)
			assert.equal(productFloatIterative(3, 6), 360)
		})

		test('supports custom termFn over positive indices', () => {
			// ∏_{k=1}^{4} (2k) = 2 * 4 * 6 * 8 = 384
			assert.equal(productFloatIterative(1, 4, (k) => 2 * k), 384)
			// ∏_{k=0}^{3} (k + 2) = 2 * 3 * 4 * 5 = 120
			assert.equal(productFloatIterative(0, 3, (k) => k + 2), 120)
		})

		test('supports negative index bounds', () => {
			// ∏_{k=-3}^{-1} k = (-3) * (-2) * (-1) = -6
			assert.equal(productFloatIterative(-3, -1), -6)
			// ∏_{k=-4}^{-1} k = (-4) * (-3) * (-2) * (-1) = 24
			assert.equal(productFloatIterative(-4, -1), 24)
		})
	})

	describe('edge cases', () => {
		test('empty product (start > end) returns 1', () => {
			assert.equal(productFloatIterative(5, 4), 1)
			assert.equal(productFloatIterative(1, 0), 1)
			assert.equal(productFloatIterative(0, -5), 1)
			let called = false
			assert.equal(
				productFloatIterative(10, 2, () => {
					called = true
					return 99
				}),
				1,
			)
			assert.equal(called, false)
		})

		test('single factor (start === end) returns termFn(start)', () => {
			assert.equal(productFloatIterative(7, 7), 7)
			assert.equal(productFloatIterative(0, 0), 0)
			assert.equal(productFloatIterative(-5, -5), -5)
			assert.equal(productFloatIterative(3, 3, (k) => k * 0.5), 1.5)
		})

		test('handles zero factor inside range', () => {
			assert.equal(productFloatIterative(-2, 3), 0)
			assert.equal(productFloatIterative(1, 5, (k) => (k === 3 ? 0 : k)), 0)
			// Still validates remaining terms even after encountering a 0 factor
			assert.throws(
				() => productFloatIterative(1, 4, (k) => (k === 2 ? 0 : k === 4 ? Number.NaN : k)),
				RangeError,
			)
		})

		test('handles negative factors and sign parity', () => {
			// Odd count of negative factors -> negative
			assert.equal(productFloatIterative(1, 5, () => -2), -32)
			// Even count of negative factors -> positive
			assert.equal(productFloatIterative(1, 4, () => -2), 16)
			// Alternating signs: (-1)^1 * (-1)^2 * (-1)^3 * (-1)^4 = (-1)^10 = 1
			assert.equal(productFloatIterative(1, 4, (k) => (k % 2 === 0 ? 1 : -1)), 1)
			// Alternating signs with magnitudes: (-1) * 2 * (-3) * 4 * (-5) = -120
			assert.equal(productFloatIterative(1, 5, (k) => (k % 2 === 0 ? k : -k)), -120)
		})

		test('handles floating-point factors accurately', () => {
			assertApproxEqual(productFloatIterative(1, 4, () => 0.5), 0.0625)
			assertApproxEqual(productFloatIterative(1, 3, (k) => k + 0.5), 1.5 * 2.5 * 3.5)
			assertApproxEqual(productFloatIterative(1, 5, (k) => 1 + 0.1 * k), 1.1 * 1.2 * 1.3 * 1.4 * 1.5)
		})

		test('handles safe integer boundary indices when range is small', () => {
			const max = Number.MAX_SAFE_INTEGER
			assert.equal(productFloatIterative(max - 1, max, () => 2), 4)
			const min = Number.MIN_SAFE_INTEGER
			assert.equal(productFloatIterative(min, min + 2, () => 3), 27)
		})

		test('explicit undefined termFn falls back to default identity', () => {
			assert.equal(productFloatIterative(1, 4, undefined), 24)
		})
	})

	describe('mathematical cross-checks', () => {
		test('telescoping product: ∏_{k=1}^{n} (k + 1) / k = n + 1', () => {
			for (const n of [1, 5, 20, 100, 500]) {
				const actual = productFloatIterative(1, n, (k) => (k + 1) / k)
				assertApproxEqual(actual, n + 1)
			}
		})

		test('second telescoping identity: ∏_{k=2}^{n} (1 - 1 / k^2) = (n + 1) / (2n)', () => {
			for (const n of [2, 5, 10, 50, 200]) {
				const actual = productFloatIterative(2, n, (k) => 1 - 1 / (k * k))
				const expected = (n + 1) / (2 * n)
				assertApproxEqual(actual, expected)
			}
		})

		test('factorial identity: ∏_{k=1}^{n} k = n!', () => {
			const factorials = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800]
			for (let n = 0; n < factorials.length; n += 1) {
				assert.equal(productFloatIterative(1, n), factorials[n])
			}
		})

		test('power identity: ∏_{k=1}^{n} c = c^n', () => {
			const cases = [
				[2, 10],
				[3, 7],
				[0.5, 8],
				[-1.5, 5],
				[1.25, 12],
			]
			for (const [c, n] of cases) {
				assertApproxEqual(productFloatIterative(1, n, () => c), c ** n)
			}
		})

		test('Wallis product partial approximation converges toward pi / 2', () => {
			// ∏_{k=1}^{n} (4k^2) / (4k^2 - 1) -> pi / 2 as n -> ∞
			const n = 2000
			const approx = productFloatIterative(1, n, (k) => (4 * k * k) / (4 * k * k - 1))
			assertApproxEqual(approx, Math.PI / 2, 1e-3, 1e-3)
		})
	})

	describe('input validation', () => {
		test('rejects non-number start or end with TypeError', () => {
			for (const bad of ['1', null, undefined, {}, [], true, 1n]) {
				assert.throws(() => productFloatIterative(bad, 5), TypeError)
				assert.throws(() => productFloatIterative(1, bad), TypeError)
			}
		})

		test('rejects non-safe-integer start or end with RangeError', () => {
			for (const bad of [
				1.5,
				-0.1,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY,
				Number.MAX_SAFE_INTEGER + 1,
				Number.MIN_SAFE_INTEGER - 1,
			]) {
				assert.throws(() => productFloatIterative(bad, 5), RangeError)
				assert.throws(() => productFloatIterative(1, bad), RangeError)
			}
		})

		test('rejects non-function termFn with TypeError (even on empty range)', () => {
			for (const bad of [null, 42, 'k => k', {}, []]) {
				assert.throws(() => productFloatIterative(1, 5, bad), TypeError)
				assert.throws(() => productFloatIterative(5, 1, bad), TypeError)
			}
		})

		test('rejects termFn returning non-number values with TypeError', () => {
			for (const bad of ['2', null, undefined, {}, [], true, 2n]) {
				assert.throws(() => productFloatIterative(1, 3, () => bad), TypeError)
			}
		})

		test('rejects termFn returning non-finite numbers with RangeError', () => {
			for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				assert.throws(() => productFloatIterative(1, 3, (k) => (k === 2 ? bad : k)), RangeError)
			}
		})
	})
})
