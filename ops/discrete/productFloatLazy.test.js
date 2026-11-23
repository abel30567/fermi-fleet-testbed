import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { productFloatLazy } from './productFloatLazy.js'

describe('productFloatLazy', () => {
	describe('normal cases', () => {
		it('computes the product of positive integers', () => {
			assert.equal(productFloatLazy([1, 2, 3, 4, 5]), 120)
		})

		it('computes the product of floating-point numbers', () => {
			assert.equal(productFloatLazy([0.5, 0.25, 8]), 1)
			assert.ok(Math.abs(productFloatLazy([1.5, 2.2, 3.1]) - 10.23) < 1e-12)
		})

		it('handles negative numbers and alternating signs', () => {
			assert.equal(productFloatLazy([-2, 3, -4]), 24)
			assert.equal(productFloatLazy([-2, 3, 4]), -24)
			assert.equal(productFloatLazy([-1, -1, -1]), -1)
		})

		it('accepts diverse iterable types (Set, Map values, TypedArray, custom iterable)', () => {
			assert.equal(productFloatLazy(new Set([2, 3, 5])), 30)
			const map = new Map([
				['a', 2],
				['b', 4],
				['c', 0.5],
			])
			assert.equal(productFloatLazy(map.values()), 4)
			assert.equal(productFloatLazy(new Float64Array([1.5, 2, 4])), 12)
			assert.equal(productFloatLazy(new Int32Array([-3, 7])), -21)

			const customIterable = {
				[Symbol.iterator]() {
					const data = [2, 5, 10]
					let i = 0
					return {
						next() {
							return i < data.length
								? { value: data[i++], done: false }
								: { value: undefined, done: true }
						},
					}
				},
			}
			assert.equal(productFloatLazy(customIterable), 100)
		})
	})

	describe('edge cases', () => {
		it('returns multiplicative identity 1 for an empty iterable', () => {
			assert.equal(productFloatLazy([]), 1)
			assert.equal(
				productFloatLazy(
					(function* () {
						// yields nothing
					})()
				),
				1
			)
		})

		it('returns the single element for single-element iterables', () => {
			assert.equal(productFloatLazy([42.5]), 42.5)
			assert.equal(productFloatLazy([-7]), -7)
			assert.ok(Object.is(productFloatLazy([-0]), -0))
			assert.ok(Object.is(productFloatLazy([0]), 0))
		})

		it('preserves IEEE-754 signed zero semantics', () => {
			assert.ok(Object.is(productFloatLazy([0, -5]), -0))
			assert.ok(Object.is(productFloatLazy([-0, 5]), -0))
			assert.ok(Object.is(productFloatLazy([-0, -5]), 0))
			assert.ok(Object.is(productFloatLazy([3, -0, 2]), -0))
		})

		it('follows IEEE-754 float64 overflow, underflow, and subnormal behavior', () => {
			assert.equal(productFloatLazy([1e200, 1e200]), Infinity)
			assert.equal(productFloatLazy([-1e200, 1e200]), -Infinity)
			assert.ok(Object.is(productFloatLazy([1e-200, 1e-200]), 0))
			assert.ok(Object.is(productFloatLazy([-1e-200, 1e-200]), -0))
			assert.equal(
				productFloatLazy([Number.MIN_VALUE, 2]),
				Number.MIN_VALUE * 2
			)
		})

		it('consumes single-pass generators lazily without materializing in memory', () => {
			let yielded = 0
			function* largeStream(count) {
				for (let i = 0; i < count; i += 1) {
					yielded += 1
					yield i % 2 === 0 ? 2 : 0.5
				}
			}

			const n = 100_000
			const result = productFloatLazy(largeStream(n))
			assert.equal(result, 1)
			assert.equal(yielded, n)
		})

		it('stops pulling from an infinite generator immediately on invalid input and runs cleanup', () => {
			let pulled = 0
			let finalized = false

			function* infiniteWithBadValue() {
				try {
					pulled += 1
					yield 2
					pulled += 1
					yield 3
					pulled += 1
					yield 'not-a-number'
					while (true) {
						pulled += 1
						yield 1
					}
				} finally {
					finalized = true
				}
			}

			assert.throws(() => productFloatLazy(infiniteWithBadValue()), {
				name: 'TypeError',
				message: /index 2/,
			})
			assert.equal(pulled, 3)
			assert.equal(finalized, true)
		})

		it('stops pulling from an infinite generator immediately on non-finite input', () => {
			let pulled = 0
			let finalized = false

			function* infiniteWithNaN() {
				try {
					pulled += 1
					yield 5
					pulled += 1
					yield Number.NaN
					while (true) {
						pulled += 1
						yield 1
					}
				} finally {
					finalized = true
				}
			}

			assert.throws(() => productFloatLazy(infiniteWithNaN()), {
				name: 'RangeError',
				message: /index 1/,
			})
			assert.equal(pulled, 2)
			assert.equal(finalized, true)
		})
	})

	describe('validation errors', () => {
		it('throws TypeError for non-iterable or string inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				true,
				Symbol('s'),
				10n,
				{},
				{ [Symbol.iterator]: 123 },
				'123',
				'',
				new String('123'),
			]

			for (const input of invalidInputs) {
				assert.throws(() => productFloatLazy(input), TypeError)
			}
		})

		it('throws TypeError when iterable yields non-number elements', () => {
			const badCases = [
				['2'],
				[1, null],
				[1, undefined],
				[1, true],
				[1, 2n],
				[1, {}],
				[1, new Number(2)],
				new BigInt64Array([1n, 2n]),
			]

			for (const input of badCases) {
				assert.throws(() => productFloatLazy(input), TypeError)
			}
		})

		it('throws RangeError when iterable yields NaN or non-finite numbers', () => {
			assert.throws(() => productFloatLazy([NaN]), RangeError)
			assert.throws(() => productFloatLazy([2, NaN, 3]), RangeError)
			assert.throws(() => productFloatLazy([Infinity]), RangeError)
			assert.throws(() => productFloatLazy([2, -Infinity]), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches Array.prototype.reduce across deterministic pseudo-random sequences', () => {
			// Deterministic LCG PRNG
			let state = 0x12345678
			const nextRand = () => {
				state = (Math.imul(state, 1664525) + 1013904223) >>> 0
				return state / 0x100000000
			}

			for (let trial = 0; trial < 20; trial += 1) {
				const len = 5 + trial
				const arr = Array.from({ length: len }, () => (nextRand() - 0.5) * 3)
				const expected = arr.reduce((acc, x) => acc * x, 1)
				const actual = productFloatLazy(
					(function* () {
						yield* arr
					})()
				)
				assert.ok(Object.is(actual, expected))
			}
		})

		it('matches exp(sum(log(x))) for positive float64 sequences', () => {
			const values = [1.1, 2.3, 0.7, 4.9, 0.35, 3.141592653589793, 0.88]
			const actual = productFloatLazy(values)
			const logCrossCheck = Math.exp(
				values.reduce((sum, x) => sum + Math.log(x), 0)
			)
			const relError = Math.abs(actual - logCrossCheck) / Math.abs(logCrossCheck)
			assert.ok(relError < 1e-14, `Expected relative error < 1e-14, got ${relError}`)
		})

		it('matches exact analytical identities (factorials, powers of 2, telescoping product)', () => {
			// 18! = 6,402,373,705,728,000 (exact in IEEE-754 float64 since < 2^53)
			function* range1To(n) {
				for (let k = 1; k <= n; k += 1) yield k
			}
			assert.equal(productFloatLazy(range1To(18)), 6402373705728000)

			// Product_{k=0}^{9} 2^k = 2^45 (exact in binary64)
			function* powersOfTwo(count) {
				for (let k = 0; k < count; k += 1) yield 2 ** k
			}
			assert.equal(productFloatLazy(powersOfTwo(10)), 2 ** 45)

			// Telescoping product: Product_{k=1}^{100} (k + 1) / k = 101
			function* telescoping(n) {
				for (let k = 1; k <= n; k += 1) yield (k + 1) / k
			}
			assert.ok(Math.abs(productFloatLazy(telescoping(100)) - 101) < 1e-11)
		})
	})
})
