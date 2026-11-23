import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { productBigIntLazy } from './productBigIntLazy.js'

describe('productBigIntLazy', () => {
	describe('normal cases', () => {
		it('computes the exact product of positive BigInts', () => {
			assert.equal(productBigIntLazy([2n, 3n, 4n, 5n]), 120n)
			assert.equal(productBigIntLazy([7n, 11n, 13n]), 1001n)
		})

		it('handles negative BigInts and sign parity correctly', () => {
			assert.equal(productBigIntLazy([-2n, 3n, 4n]), -24n)
			assert.equal(productBigIntLazy([-2n, -3n, 4n]), 24n)
			assert.equal(productBigIntLazy([-2n, -3n, -4n]), -24n)
			assert.equal(productBigIntLazy([-1n, -1n, -1n, -1n]), 1n)
		})

		it('preserves full precision far beyond Number.MAX_SAFE_INTEGER', () => {
			const a = 2n ** 53n + 1n
			const b = 2n ** 53n + 3n
			const expected = 2n ** 106n + 4n * 2n ** 53n + 3n
			assert.equal(productBigIntLazy([a, b]), expected)

			const huge = [10n ** 30n, 10n ** 40n, 10n ** 50n]
			assert.equal(productBigIntLazy(huge), 10n ** 120n)
		})

		it('works with diverse iterable types (Set, Map values, generators)', () => {
			assert.equal(productBigIntLazy(new Set([2n, 5n, 9n])), 90n)
			const map = new Map([
				['a', 3n],
				['b', -5n],
				['c', 7n],
			])
			assert.equal(productBigIntLazy(map.values()), -105n)

			function* gen() {
				yield 4n
				yield 6n
				yield 10n
			}
			assert.equal(productBigIntLazy(gen()), 240n)
		})
	})

	describe('edge cases', () => {
		it('returns multiplicative identity 1n for empty iterables', () => {
			assert.equal(productBigIntLazy([]), 1n)
			assert.equal(productBigIntLazy(new Set()), 1n)
			assert.equal(
				productBigIntLazy(
					(function* () {
						// empty generator
					})()
				),
				1n
			)
		})

		it('returns the single element for singleton iterables', () => {
			assert.equal(productBigIntLazy([0n]), 0n)
			assert.equal(productBigIntLazy([1n]), 1n)
			assert.equal(productBigIntLazy([-999999999999999999999n]), -999999999999999999999n)
		})

		it('returns 0n when any factor is 0n', () => {
			assert.equal(productBigIntLazy([0n, 1n, 2n]), 0n)
			assert.equal(productBigIntLazy([1n, 2n, 0n]), 0n)
			assert.equal(productBigIntLazy([-5n, 0n, 10n ** 50n]), 0n)
		})

		it('consumes single-pass custom iterables exactly once', () => {
			let started = false
			const singlePass = {
				[Symbol.iterator]() {
					if (started) {
						throw new Error('Iterable must not be iterated more than once')
					}
					started = true
					let i = 1n
					return {
						next() {
							if (i <= 5n) {
								const value = i
								i += 1n
								return { value, done: false }
							}
							return { value: undefined, done: true }
						},
					}
				},
			}
			assert.equal(productBigIntLazy(singlePass), 120n)
		})
	})

	describe('lazy and streaming consumption', () => {
		it('short-circuits on 0n over an infinite generator and closes the iterator', () => {
			let pulls = 0
			let closed = false

			function* infiniteWithZero() {
				try {
					pulls += 1
					yield 17n
					pulls += 1
					yield -3n
					pulls += 1
					yield 0n
					while (true) {
						pulls += 1
						yield 99n
					}
				} finally {
					closed = true
				}
			}

			assert.equal(productBigIntLazy(infiniteWithZero()), 0n)
			assert.equal(pulls, 3)
			assert.equal(closed, true)
		})

		it('fails fast on invalid elements in an infinite stream and closes the iterator', () => {
			let pulls = 0
			let closed = false

			function* infiniteWithBadElement() {
				try {
					pulls += 1
					yield 2n
					pulls += 1
					yield 3n
					pulls += 1
					yield /** @type {any} */ (4)
					while (true) {
						pulls += 1
						yield 5n
					}
				} finally {
					closed = true
				}
			}

			assert.throws(
				() => productBigIntLazy(infiniteWithBadElement()),
				{
					name: 'TypeError',
					message: /index 2.*bigint.*number/,
				}
			)
			assert.equal(pulls, 3)
			assert.equal(closed, true)
		})

		it('supports disabling zero short-circuit to validate remaining elements', () => {
			let pulls = 0
			function* streamWithZeroThenValid() {
				for (const v of [2n, 0n, 5n, 7n]) {
					pulls += 1
					yield v
				}
			}
			assert.equal(
				productBigIntLazy(streamWithZeroThenValid(), { shortCircuitZero: false }),
				0n
			)
			assert.equal(pulls, 4)

			assert.throws(
				() => productBigIntLazy([2n, 0n, /** @type {any} */ ('bad')], { shortCircuitZero: false }),
				{
					name: 'TypeError',
					message: /index 2.*bigint.*string/,
				}
			)
		})

		it('streams large sequences without materializing an intermediate array', () => {
			const count = 10000
			function* alternatingSigns() {
				for (let i = 0; i < count; i += 1) {
					yield i % 2 === 0 ? 1n : -1n
				}
			}
			// 5000 factors of -1n => (-1)^5000 === 1n
			assert.equal(productBigIntLazy(alternatingSigns()), 1n)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-iterable or string inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				42n,
				true,
				false,
				{},
				Symbol('s'),
				() => {},
				'',
				'123',
				new String('123'),
			]
			for (const bad of invalidInputs) {
				assert.throws(() => productBigIntLazy(/** @type {any} */ (bad)), TypeError)
			}
		})

		it('throws TypeError if Symbol.iterator does not return an iterator object', () => {
			const badIterable = {
				[Symbol.iterator]() {
					return 123
				},
			}
			assert.throws(() => productBigIntLazy(/** @type {any} */ (badIterable)), TypeError)
		})

		it('throws TypeError for non-BigInt elements', () => {
			const badElements = [0, 1, -5, 1.5, NaN, Infinity, '2', '2n', true, null, undefined, {}, Symbol('x')]
			for (const elem of badElements) {
				assert.throws(
					() => productBigIntLazy(/** @type {any} */ ([2n, elem])),
					TypeError
				)
			}
		})

		it('throws TypeError for invalid options', () => {
			const badOptions = [
				null,
				42,
				'true',
				[],
				{ shortCircuitZero: 1 },
				{ shortCircuitZero: 'true' },
				{ shortCircuitZero: null },
			]
			for (const opt of badOptions) {
				assert.throws(
					() => productBigIntLazy([1n, 2n], /** @type {any} */ (opt)),
					TypeError
				)
			}
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('matches closed-form geometric power product: prod_{k=0}^{n-1} b^k === b^(n*(n-1)/2)', () => {
			const base = 3n
			const n = 40n
			function* powersOfBase() {
				for (let k = 0n; k < n; k += 1n) {
					yield base ** k
				}
			}
			const expected = base ** ((n * (n - 1n)) / 2n)
			assert.equal(productBigIntLazy(powersOfBase()), expected)
		})

		it('matches known exact factorials and falling-factorial ratio identity', () => {
			function* range(start, end) {
				for (let i = start; i <= end; i += 1n) {
					yield i
				}
			}

			const fact20 = productBigIntLazy(range(1n, 20n))
			const fact30 = productBigIntLazy(range(1n, 30n))
			const falling30Over20 = productBigIntLazy(range(21n, 30n))

			assert.equal(fact20, 2432902008176640000n)
			assert.equal(fact30, 265252859812191058636308480000000n)
			assert.equal(fact30 / fact20, falling30Over20)
			assert.equal(fact30 % fact20, 0n)
		})

		it('satisfies multiplicativity over concatenated sequences and matches Array.reduce', () => {
			const seqA = [101n, -203n, 307n, 2n ** 64n - 59n]
			const seqB = [-409n, 503n, -(2n ** 64n + 13n), 997n]
			const combined = [...seqA, ...seqB]

			const prodCombined = productBigIntLazy(combined)
			const prodSplit = productBigIntLazy(seqA) * productBigIntLazy(seqB)
			const prodReduce = combined.reduce((acc, x) => acc * x, 1n)

			assert.equal(prodCombined, prodSplit)
			assert.equal(prodCombined, prodReduce)
		})
	})
})
