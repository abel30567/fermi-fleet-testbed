import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationBigIntIterative } from './summationBigIntIterative.js'

describe('summationBigIntIterative', () => {
	describe('normal range cases', () => {
		test('sums consecutive positive BigInts with default identity term', () => {
			assert.equal(summationBigIntIterative(1n, 10n), 55n)
			assert.equal(summationBigIntIterative(0n, 5n), 15n)
			assert.equal(summationBigIntIterative(5n, 10n), 45n)
		})

		test('sums range with custom term function', () => {
			assert.equal(
				summationBigIntIterative(1n, 5n, (i) => 2n * i + 1n),
				35n
			)
			assert.equal(
				summationBigIntIterative(0n, 4n, (i) => (i % 2n === 0n ? i : -i)),
				2n
			)
		})

		test('sums fixed-point BigInts scaled by 10^18 exactly', () => {
			const SCALE = 10n ** 18n
			// Sum of (i / 4) for i = 1..8 in 10^18 fixed-point = (36 / 4) * 10^18 = 9 * 10^18
			const result = summationBigIntIterative(
				1n,
				8n,
				(i) => (i * SCALE) / 4n
			)
			assert.equal(result, 9n * SCALE)
		})
	})

	describe('iterable cases', () => {
		test('sums arrays, sets, generators, and BigInt64Arrays', () => {
			assert.equal(summationBigIntIterative([1n, 2n, 3n, 4n]), 10n)
			assert.equal(summationBigIntIterative(new Set([10n, -3n, 5n])), 12n)
			assert.equal(
				summationBigIntIterative(new BigInt64Array([100n, -40n, 15n])),
				75n
			)

			function* gen() {
				yield 2n
				yield 4n
				yield 6n
			}
			assert.equal(summationBigIntIterative(gen()), 12n)
		})

		test('sums an iterable with a custom termFn', () => {
			assert.equal(
				summationBigIntIterative([1n, 2n, 3n, 4n], (x) => x * x),
				30n
			)
		})
	})

	describe('edge cases', () => {
		test('empty range (start > end) returns 0n without calling termFn', () => {
			let calls = 0
			const result = summationBigIntIterative(10n, 5n, (i) => {
				calls += 1
				return i
			})
			assert.equal(result, 0n)
			assert.equal(calls, 0)
			assert.equal(summationBigIntIterative(1n, 0n), 0n)
			assert.equal(summationBigIntIterative(-2n, -5n), 0n)
		})

		test('empty iterable returns 0n without calling termFn', () => {
			let calls = 0
			assert.equal(
				summationBigIntIterative([], (x) => {
					calls += 1
					return x
				}),
				0n
			)
			assert.equal(calls, 0)
		})

		test('single element range (start === end)', () => {
			assert.equal(summationBigIntIterative(0n, 0n), 0n)
			assert.equal(summationBigIntIterative(42n, 42n), 42n)
			assert.equal(summationBigIntIterative(-7n, -7n), -7n)
			assert.equal(
				summationBigIntIterative(7n, 7n, (i) => i * i),
				49n
			)
		})

		test('negative bounds and ranges crossing zero', () => {
			assert.equal(summationBigIntIterative(-5n, -1n), -15n)
			assert.equal(summationBigIntIterative(-10n, 10n), 0n)
			assert.equal(summationBigIntIterative(-3n, 5n), 9n)
		})

		test('large BigInts far beyond Number.MAX_SAFE_INTEGER', () => {
			const base = 10n ** 40n
			const count = 200n
			const end = base + count - 1n
			const expected = (count * (base + end)) / 2n
			assert.equal(summationBigIntIterative(base, end), expected)

			const huge = 10n ** 100n
			assert.equal(
				summationBigIntIterative([huge, 123456789012345678901234567890n, -huge]),
				123456789012345678901234567890n
			)
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('matches Gauss arithmetic series formula for arbitrary bounds', () => {
			for (const [a, b] of [
				[1n, 100n],
				[1n, 1000n],
				[-250n, 750n],
				[10n ** 30n, 10n ** 30n + 500n],
			]) {
				const expected = ((b - a + 1n) * (a + b)) / 2n
				assert.equal(summationBigIntIterative(a, b), expected)
			}
		})

		test('matches closed-form sum of squares n(n+1)(2n+1)/6', () => {
			for (const n of [1n, 10n, 123n, 500n]) {
				const expected = (n * (n + 1n) * (2n * n + 1n)) / 6n
				assert.equal(
					summationBigIntIterative(1n, n, (i) => i * i),
					expected
				)
			}
		})

		test('matches Nicomachus theorem for sum of cubes (n(n+1)/2)^2', () => {
			for (const n of [1n, 15n, 200n]) {
				const tri = (n * (n + 1n)) / 2n
				const expected = tri * tri
				assert.equal(
					summationBigIntIterative(1n, n, (i) => i ** 3n),
					expected
				)
			}
		})

		test('matches closed-form geometric series and telescoping sum', () => {
			const n = 80n
			const r = 3n
			const expectedGeom = (r ** (n + 1n) - 1n) / (r - 1n)
			assert.equal(
				summationBigIntIterative(0n, n, (i) => r ** i),
				expectedGeom
			)

			const m = 300n
			const expectedTelescope = (m + 1n) ** 3n - 1n
			assert.equal(
				summationBigIntIterative(1n, m, (i) => (i + 1n) ** 3n - i ** 3n),
				expectedTelescope
			)
		})
	})

	describe('invalid inputs', () => {
		test('throws TypeError for non-bigint bounds or missing arguments', () => {
			assert.throws(() => summationBigIntIterative(), TypeError)
			assert.throws(() => summationBigIntIterative(1, 5), TypeError)
			assert.throws(() => summationBigIntIterative(1n), TypeError)
			assert.throws(() => summationBigIntIterative(1n, 5), TypeError)
			assert.throws(() => summationBigIntIterative(1n, '5'), TypeError)
			assert.throws(() => summationBigIntIterative(1n, null), TypeError)
		})

		test('throws TypeError for invalid first argument (non-iterable or string)', () => {
			assert.throws(() => summationBigIntIterative(null), TypeError)
			assert.throws(() => summationBigIntIterative(undefined), TypeError)
			assert.throws(() => summationBigIntIterative({}), TypeError)
			assert.throws(() => summationBigIntIterative('123'), TypeError)
			assert.throws(() => summationBigIntIterative(NaN), TypeError)
		})

		test('throws TypeError for invalid termFn or unexpected arguments', () => {
			assert.throws(
				() => summationBigIntIterative(1n, 5n, 'not-a-fn'),
				TypeError
			)
			assert.throws(
				() => summationBigIntIterative([1n, 2n], 42),
				TypeError
			)
			assert.throws(
				() => summationBigIntIterative([1n, 2n], (x) => x, (x) => x),
				TypeError
			)
		})

		test('throws TypeError when iterable contains non-bigint or termFn returns non-bigint', () => {
			assert.throws(
				() => summationBigIntIterative([1n, 2, 3n]),
				TypeError
			)
			assert.throws(
				() => summationBigIntIterative([1n, '2n']),
				TypeError
			)
			assert.throws(
				() => summationBigIntIterative(1n, 3n, (i) => Number(i)),
				TypeError
			)
			assert.throws(
				() => summationBigIntIterative([1n, 2n], () => 1.5),
				TypeError
			)
		})
	})
})
