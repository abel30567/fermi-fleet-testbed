import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationRationalSeries } from './summationRationalSeries.js'

/**
 * Helper GCD for verifying output normalization invariants in tests.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Asserts that a rational equals expected and is strictly normalized.
 * @param {{ num: bigint, den: bigint }} actual
 * @param {{ num: bigint, den: bigint }} expected
 */
function assertRationalEqual(actual, expected) {
	assert.equal(typeof actual.num, 'bigint')
	assert.equal(typeof actual.den, 'bigint')
	assert.ok(actual.den > 0n, `expected positive denominator, got ${actual.den}`)
	assert.equal(gcd(actual.num, actual.den), 1n, `expected lowest terms for ${actual.num}/${actual.den}`)
	assert.deepEqual(actual, expected)
}

describe('summationRationalSeries', () => {
	test('computes exact harmonic numbers (iterable and indexed modes)', () => {
		const expectedHarmonics = [
			[1, { num: 1n, den: 1n }],
			[2, { num: 3n, den: 2n }],
			[3, { num: 11n, den: 6n }],
			[4, { num: 25n, den: 12n }],
			[5, { num: 137n, den: 60n }],
			[10, { num: 7381n, den: 2520n }],
			[20, { num: 55835135n, den: 15519504n }],
		]

		for (const [n, expected] of expectedHarmonics) {
			const terms = Array.from({ length: n }, (_, i) => ({ num: 1n, den: BigInt(i + 1) }))
			assertRationalEqual(summationRationalSeries(terms), expected)
			assertRationalEqual(
				summationRationalSeries((k) => ({ num: 1n, den: BigInt(k) }), 1, n),
				expected,
			)
		}
	})

	test('handles alternating signs and exact cancellation', () => {
		// Alternating harmonic series: sum_{k=1}^{10} (-1)^(k+1) / k = 1627 / 2520
		const altHarmonic = summationRationalSeries(
			(k) => ({ num: k % 2 === 1 ? 1n : -1n, den: BigInt(k) }),
			1,
			10,
		)
		assertRationalEqual(altHarmonic, { num: 1627n, den: 2520n })

		// Gregory-Leibniz partial sum: 1 - 1/3 + 1/5 - 1/7 + 1/9 = 263 / 315
		const leibniz = summationRationalSeries(
			(k) => ({ num: k % 2 === 0 ? 1n : -1n, den: BigInt(2 * k + 1) }),
			0,
			4,
		)
		assertRationalEqual(leibniz, { num: 263n, den: 315n })

		// Symmetric odd function over [-5, 5] cancels exactly to 0/1
		const cancelled = summationRationalSeries(
			(k) => ({ num: BigInt(k), den: BigInt(k * k + 1) }),
			-5,
			5,
		)
		assertRationalEqual(cancelled, { num: 0n, den: 1n })
	})

	test('normalizes negative denominators and unreduced rational inputs', () => {
		const res = summationRationalSeries([
			{ num: 2n, den: -4n }, // -1/2
			{ num: -6n, den: -9n }, // +2/3
			{ num: 10n, den: 12n }, // +5/6
		])
		// -1/2 + 2/3 + 5/6 = 1/1
		assertRationalEqual(res, { num: 1n, den: 1n })
	})

	test('supports arbitrary iterables (generators and Sets) and BigInt bounds', () => {
		function* gen() {
			yield { num: 1n, den: 2n }
			yield { num: 1n, den: 3n }
			yield { num: 1n, den: 6n }
		}
		assertRationalEqual(summationRationalSeries(gen()), { num: 1n, den: 1n })

		const setTerms = new Set([
			{ num: 1n, den: 4n },
			{ num: 1n, den: 4n },
			{ num: 1n, den: 2n },
		])
		assertRationalEqual(summationRationalSeries(setTerms), { num: 1n, den: 1n })

		// BigInt index bounds
		const bigBounds = summationRationalSeries(
			(k) => {
				assert.equal(typeof k, 'bigint')
				return { num: 1n, den: k * (k + 1n) }
			},
			1n,
			20n,
		)
		assertRationalEqual(bigBounds, { num: 20n, den: 21n })

		// Mixed number and BigInt bounds coerce index to BigInt
		const mixedBounds = summationRationalSeries(
			(k) => {
				assert.equal(typeof k, 'bigint')
				return { num: k, den: 1n }
			},
			1,
			5n,
		)
		assertRationalEqual(mixedBounds, { num: 15n, den: 1n })
	})

	test('handles edge cases: empty sums, single items, and large BigInts', () => {
		// Empty array, empty generator, and empty indexed range (start > end)
		assertRationalEqual(summationRationalSeries([]), { num: 0n, den: 1n })
		assertRationalEqual(
			summationRationalSeries((function* () {})()),
			{ num: 0n, den: 1n },
		)
		assertRationalEqual(
			summationRationalSeries((k) => ({ num: 1n, den: BigInt(k) }), 5, 2),
			{ num: 0n, den: 1n },
		)
		assertRationalEqual(
			summationRationalSeries((k) => ({ num: 1n, den: k }), 10n, 9n),
			{ num: 0n, den: 1n },
		)

		// Single item (zero, negative denominator, unreduced)
		assertRationalEqual(summationRationalSeries([{ num: 0n, den: -7n }]), { num: 0n, den: 1n })
		assertRationalEqual(summationRationalSeries([{ num: -18n, den: -24n }]), { num: 3n, den: 4n })
		assertRationalEqual(
			summationRationalSeries((k) => ({ num: BigInt(k), den: -10n }), 4, 4),
			{ num: -2n, den: 5n },
		)

		// Large BigInts (10^60 scale) with exact reduction and cancellation
		const p = 10n ** 60n + 7n
		const q = 10n ** 60n + 9n
		const largeSum = summationRationalSeries([
			{ num: p, den: q },
			{ num: q - p, den: q },
			{ num: 10n ** 80n, den: 3n * 10n ** 80n },
		])
		// p/q + (q-p)/q + 1/3 = 1 + 1/3 = 4/3
		assertRationalEqual(largeSum, { num: 4n, den: 3n })
	})

	test('cross-check: telescoping series sum_{k=1}^n 1/(k(k+1)) === n/(n+1)', () => {
		for (const n of [1, 2, 5, 25, 100, 250]) {
			const res = summationRationalSeries(
				(k) => ({ num: 1n, den: BigInt(k) * BigInt(k + 1) }),
				1,
				n,
			)
			assertRationalEqual(res, { num: BigInt(n), den: BigInt(n + 1) })
		}

		// Second-order telescoping: sum_{k=1}^n 2 / (k(k+1)(k+2)) === 1/2 - 1/((n+1)(n+2))
		for (const n of [1, 7, 40]) {
			const res = summationRationalSeries(
				(k) => {
					const bk = BigInt(k)
					return { num: 2n, den: bk * (bk + 1n) * (bk + 2n) }
				},
				1,
				n,
			)
			const bn = BigInt(n)
			const num = (bn + 1n) * (bn + 2n) - 2n
			const den = 2n * (bn + 1n) * (bn + 2n)
			const g = gcd(num, den)
			assertRationalEqual(res, { num: num / g, den: den / g })
		}
	})

	test('cross-check: geometric series sum_{k=0}^n r^k === (1 - r^(n+1)) / (1 - r)', () => {
		const cases = [
			{ p: 1n, q: 2n, n: 30 }, // r = 1/2
			{ p: 2n, q: 3n, n: 20 }, // r = 2/3
			{ p: -3n, q: 5n, n: 25 }, // r = -3/5 (alternating)
			{ p: 7n, q: 4n, n: 15 }, // r = 7/4 (|r| > 1)
			{ p: 0n, q: 1n, n: 10 }, // r = 0 (0^0 = 1)
		]

		for (const { p, q, n } of cases) {
			const actual = summationRationalSeries(
				(k) => ({ num: p ** BigInt(k), den: q ** BigInt(k) }),
				0,
				n,
			)

			// Closed form: (1 - (p/q)^(n+1)) / (1 - p/q) = (q^(n+1) - p^(n+1)) / (q^n * (q - p))
			const bn = BigInt(n)
			let expectedNum = q ** (bn + 1n) - p ** (bn + 1n)
			let expectedDen = q ** bn * (q - p)
			if (expectedDen < 0n) {
				expectedNum = -expectedNum
				expectedDen = -expectedDen
			}
			const g = gcd(expectedNum, expectedDen)
			assertRationalEqual(actual, { num: expectedNum / g, den: expectedDen / g })
		}
	})

	test('cross-check: Faulhaber identity and alternating binomial reciprocal identity', () => {
		// sum_{k=1}^n k^2 / n^3 === (n+1)(2n+1) / (6n^2)
		const n = 50n
		const scaledSquares = summationRationalSeries(
			(k) => ({ num: k * k, den: n * n * n }),
			1n,
			n,
		)
		const expectedNum = (n + 1n) * (2n * n + 1n)
		const expectedDen = 6n * n * n
		const g = gcd(expectedNum, expectedDen)
		assertRationalEqual(scaledSquares, { num: expectedNum / g, den: expectedDen / g })

		// sum_{k=0}^m (-1)^k * C(m, k) / (k + 1) === 1 / (m + 1)
		const m = 18
		const terms = []
		let binom = 1n
		for (let k = 0; k <= m; k += 1) {
			terms.push({ num: k % 2 === 0 ? binom : -binom, den: BigInt(k + 1) })
			binom = (binom * BigInt(m - k)) / BigInt(k + 1)
		}
		assertRationalEqual(summationRationalSeries(terms), { num: 1n, den: BigInt(m + 1) })

		// Order invariance: reversing terms produces identical rational sum
		assertRationalEqual(
			summationRationalSeries([...terms].reverse()),
			{ num: 1n, den: BigInt(m + 1) },
		)
	})

	test('rejects invalid inputs with appropriate errors', () => {
		// Invalid first argument
		assert.throws(() => summationRationalSeries(), TypeError)
		assert.throws(() => summationRationalSeries(null), TypeError)
		assert.throws(() => summationRationalSeries(42), TypeError)
		assert.throws(() => summationRationalSeries('1/2'), TypeError)
		assert.throws(() => summationRationalSeries({ num: 1n, den: 2n }), TypeError)

		// Unexpected extra arguments in iterable mode
		assert.throws(() => summationRationalSeries([], 0, 1), TypeError)

		// Invalid elements in iterable
		assert.throws(() => summationRationalSeries([null]), TypeError)
		assert.throws(() => summationRationalSeries([42]), TypeError)
		assert.throws(() => summationRationalSeries([{ num: 1, den: 2n }]), TypeError)
		assert.throws(() => summationRationalSeries([{ num: 1n, den: 2 }]), TypeError)
		assert.throws(() => summationRationalSeries([{ num: 1n }]), TypeError)
		assert.throws(() => summationRationalSeries([{ num: 1n, den: 0n }]), RangeError)
		assert.throws(() => summationRationalSeries([{ num: 0n, den: 0n }]), RangeError)

		// Invalid indexed mode arguments
		assert.throws(() => summationRationalSeries(() => ({ num: 1n, den: 1n })), TypeError)
		assert.throws(() => summationRationalSeries(() => ({ num: 1n, den: 1n }), 1), TypeError)
		assert.throws(() => summationRationalSeries(() => ({ num: 1n, den: 1n }), 1.5, 5), TypeError)
		assert.throws(() => summationRationalSeries(() => ({ num: 1n, den: 1n }), 1, NaN), TypeError)
		assert.throws(() => summationRationalSeries(() => ({ num: 1n, den: 1n }), 1, Infinity), TypeError)
		assert.throws(() => summationRationalSeries(() => ({ num: 1n, den: 1n }), '1', 5), TypeError)
		assert.throws(
			() => summationRationalSeries(() => ({ num: 1n, den: 1n }), Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 2),
			RangeError,
		)
		assert.throws(
			() => summationRationalSeries(() => ({ num: 1n, den: 0n }), 1, 3),
			RangeError,
		)
		assert.throws(
			() => summationRationalSeries(() => null, 1, 3),
			TypeError,
		)
	})
})
