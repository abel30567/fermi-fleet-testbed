import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { subtractRationalIterative } from './subtractRationalIterative.js'

describe('subtractRationalIterative', () => {
	test('subtracts positive rationals with common and distinct denominators', () => {
		assert.deepEqual(
			subtractRationalIterative({ num: 3n, den: 4n }, { num: 1n, den: 4n }),
			{ num: 1n, den: 2n },
		)
		assert.deepEqual(
			subtractRationalIterative({ num: 5n, den: 6n }, { num: 1n, den: 4n }),
			{ num: 7n, den: 12n },
		)
		assert.deepEqual(
			subtractRationalIterative({ num: 7n, den: 3n }, { num: 1n, den: 3n }),
			{ num: 2n, den: 1n },
		)
		assert.deepEqual(
			subtractRationalIterative({ num: 1n, den: 3n }, { num: 1n, den: 2n }),
			{ num: -1n, den: 6n },
		)
	})

	test('handles negative numerators, negative denominators, and sign normalization', () => {
		assert.deepEqual(
			subtractRationalIterative({ num: -3n, den: 4n }, { num: 1n, den: 4n }),
			{ num: -1n, den: 1n },
		)
		assert.deepEqual(
			subtractRationalIterative({ num: 1n, den: 2n }, { num: -1n, den: 3n }),
			{ num: 5n, den: 6n },
		)
		assert.deepEqual(
			subtractRationalIterative({ num: 1n, den: -2n }, { num: 1n, den: 2n }),
			{ num: -1n, den: 1n },
		)
		assert.deepEqual(
			subtractRationalIterative({ num: -2n, den: -3n }, { num: -4n, den: -6n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			subtractRationalIterative({ num: 3n, den: -5n }, { num: 2n, den: -10n }),
			{ num: -2n, den: 5n },
		)
	})

	test('handles zeros canonically as { num: 0n, den: 1n }', () => {
		assert.deepEqual(
			subtractRationalIterative({ num: 0n, den: 1n }, { num: 0n, den: 1n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			subtractRationalIterative({ num: 0n, den: -7n }, { num: 0n, den: 13n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			subtractRationalIterative({ num: 0n, den: 5n }, { num: 3n, den: -6n }),
			{ num: 1n, den: 2n },
		)
		assert.deepEqual(
			subtractRationalIterative({ num: 4n, den: 8n }, { num: 0n, den: -99n }),
			{ num: 1n, den: 2n },
		)
	})

	test('handles full and partial cancellation from unnormalized inputs', () => {
		assert.deepEqual(
			subtractRationalIterative({ num: 6n, den: 9n }, { num: 4n, den: 6n }),
			{ num: 0n, den: 1n },
		)
		assert.deepEqual(
			subtractRationalIterative({ num: 15n, den: 25n }, { num: 6n, den: 30n }),
			{ num: 2n, den: 5n },
		)
		assert.deepEqual(
			subtractRationalIterative({ num: 100n, den: 200n }, { num: -150n, den: 300n }),
			{ num: 1n, den: 1n },
		)
	})

	test('handles very large BigInts including consecutive Fibonacci numbers', () => {
		// Consecutive Fibonacci numbers force maximum Euclidean algorithm iterations
		let f0 = 0n
		let f1 = 1n
		for (let i = 0; i < 200; i++) {
			const next = f0 + f1
			f0 = f1
			f1 = next
		}
		// f1 / f0 - f0 / f1 = (f1^2 - f0^2) / (f0 * f1); gcd(f0, f1) = 1
		const res = subtractRationalIterative({ num: f1, den: f0 }, { num: f0, den: f1 })
		assert.equal(res.num, f1 * f1 - f0 * f0)
		assert.equal(res.den, f0 * f1)

		// Large common factor cancellation: (k * 3) / (k * 4) - (k * 1) / (k * 4) = 1 / 2
		const k = 10n ** 80n + 7n
		assert.deepEqual(
			subtractRationalIterative({ num: 3n * k, den: 4n * k }, { num: k, den: 4n * k }),
			{ num: 1n, den: 2n },
		)
	})

	test('does not mutate input objects', () => {
		const a = Object.freeze({ num: 4n, den: -6n })
		const b = Object.freeze({ num: -2n, den: 6n })
		const res = subtractRationalIterative(a, b)
		assert.deepEqual(res, { num: -1n, den: 3n })
		assert.deepEqual(a, { num: 4n, den: -6n })
		assert.deepEqual(b, { num: -2n, den: 6n })
	})

	test('validates inputs thoroughly', () => {
		const valid = { num: 1n, den: 2n }

		// Invalid container types
		for (const bad of [null, undefined, 1, '1/2', true, 1n, [1n, 2n]]) {
			assert.throws(() => subtractRationalIterative(bad, valid), TypeError)
			assert.throws(() => subtractRationalIterative(valid, bad), TypeError)
		}

		// Missing or non-bigint num/den
		for (const bad of [
			{},
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: '1', den: 2n },
			{ num: 1n, den: '2' },
			{ num: undefined, den: 2n },
			{ num: 1n, den: null },
			{ num: NaN, den: 2n },
		]) {
			assert.throws(() => subtractRationalIterative(bad, valid), TypeError)
			assert.throws(() => subtractRationalIterative(valid, bad), TypeError)
		}

		// Zero denominator
		assert.throws(() => subtractRationalIterative({ num: 1n, den: 0n }, valid), RangeError)
		assert.throws(() => subtractRationalIterative(valid, { num: 1n, den: 0n }), RangeError)
		assert.throws(() => subtractRationalIterative({ num: 0n, den: 0n }, valid), RangeError)
	})

	test('cross-checks against independent exact binary floating-point and telescoping identities', () => {
		// 1. Exact cross-check against IEEE-754 double arithmetic for dyadic rationals (den = 2^k)
		const dyadicCases = [
			[{ num: 5n, den: 8n }, { num: 3n, den: 16n }],
			[{ num: -7n, den: 4n }, { num: 9n, den: 32n }],
			[{ num: 13n, den: -16n }, { num: -5n, den: 64n }],
			[{ num: 1025n, den: 1024n }, { num: 1n, den: 1024n }],
		]
		for (const [a, b] of dyadicCases) {
			const res = subtractRationalIterative(a, b)
			assert.ok(res.den > 0n)
			const expectedFloat = Number(a.num) / Number(a.den) - Number(b.num) / Number(b.den)
			const actualFloat = Number(res.num) / Number(res.den)
			assert.equal(actualFloat, expectedFloat)
		}

		// 2. Algebraic antisymmetry & cross-multiplication round-trip check across a deterministic grid
		const samples = [
			{ num: 0n, den: 1n },
			{ num: 1n, den: 1n },
			{ num: -7n, den: 12n },
			{ num: 11n, den: -18n },
			{ num: 35n, den: 14n },
			{ num: -99n, den: -45n },
		]
		for (const a of samples) {
			for (const b of samples) {
				const diffAB = subtractRationalIterative(a, b)
				const diffBA = subtractRationalIterative(b, a)

				// Positive denominator and lowest-terms check via independent recursive gcd
				assert.ok(diffAB.den > 0n)
				const recGcd = (x, y) => (y === 0n ? x : recGcd(y, x % y))
				assert.equal(recGcd(diffAB.num < 0n ? -diffAB.num : diffAB.num, diffAB.den), 1n)

				// Antisymmetry: (a - b) === -(b - a)
				assert.equal(diffAB.num, -diffBA.num)
				assert.equal(diffAB.den, diffBA.den)

				// Independent exactness check: (a - b) * a.den * b.den === (a.num * b.den - b.num * a.den) * diff.den
				assert.equal(
					diffAB.num * a.den * b.den,
					(a.num * b.den - b.num * a.den) * diffAB.den,
				)
			}
		}

		// 3. Telescoping sum identity: 1 - sum_{k=1..30} (1/k - 1/(k+1)) = 1/31
		let acc = { num: 1n, den: 1n }
		for (let k = 1n; k <= 30n; k++) {
			const step = subtractRationalIterative({ num: 1n, den: k }, { num: 1n, den: k + 1n })
			acc = subtractRationalIterative(acc, step)
		}
		assert.deepEqual(acc, { num: 1n, den: 31n })
	})
})
