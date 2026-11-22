import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { moduloBigIntIterative } from './moduloBigIntIterative.js'

describe('moduloBigIntIterative', () => {
	describe('normal cases', () => {
		it('computes exact modulo for positive dividends and moduli', () => {
			assert.equal(moduloBigIntIterative(7n, 5n), 2n)
			assert.equal(moduloBigIntIterative(10n, 3n), 1n)
			assert.equal(moduloBigIntIterative(100n, 7n), 2n)
			assert.equal(moduloBigIntIterative(123456789n, 97n), 39n)
		})

		it('returns 0n for exact positive multiples', () => {
			assert.equal(moduloBigIntIterative(15n, 5n), 0n)
			assert.equal(moduloBigIntIterative(81n, 9n), 0n)
			assert.equal(moduloBigIntIterative(1024n, 16n), 0n)
		})

		it('returns dividend unchanged when 0n <= a < m', () => {
			assert.equal(moduloBigIntIterative(3n, 10n), 3n)
			assert.equal(moduloBigIntIterative(9n, 10n), 9n)
			assert.equal(moduloBigIntIterative(1n, 1000000n), 1n)
		})
	})

	describe('negative dividends (Euclidean non-negative semantics)', () => {
		it('maps negative dividends to canonical remainder in [0n, m - 1n]', () => {
			assert.equal(moduloBigIntIterative(-1n, 5n), 4n)
			assert.equal(moduloBigIntIterative(-7n, 5n), 3n)
			assert.equal(moduloBigIntIterative(-3n, 10n), 7n)
			assert.equal(moduloBigIntIterative(-100n, 7n), 5n)
			assert.equal(moduloBigIntIterative(-17n, 6n), 1n)
		})

		it('returns 0n for exact negative multiples', () => {
			assert.equal(moduloBigIntIterative(-5n, 5n), 0n)
			assert.equal(moduloBigIntIterative(-10n, 5n), 0n)
			assert.equal(moduloBigIntIterative(-81n, 9n), 0n)
			assert.equal(moduloBigIntIterative(-1n, 1n), 0n)
		})
	})

	describe('edge and boundary cases', () => {
		it('handles zero dividend for any positive modulus', () => {
			assert.equal(moduloBigIntIterative(0n, 1n), 0n)
			assert.equal(moduloBigIntIterative(0n, 7n), 0n)
			assert.equal(moduloBigIntIterative(0n, 10n ** 100n), 0n)
		})

		it('returns 0n for modulus m = 1n across signs and magnitudes', () => {
			assert.equal(moduloBigIntIterative(0n, 1n), 0n)
			assert.equal(moduloBigIntIterative(1n, 1n), 0n)
			assert.equal(moduloBigIntIterative(-1n, 1n), 0n)
			assert.equal(moduloBigIntIterative(10n ** 200n, 1n), 0n)
			assert.equal(moduloBigIntIterative(-(10n ** 200n), 1n), 0n)
		})

		it('handles boundaries around multiples of m and powers of two', () => {
			for (const m of [1n, 2n, 3n, 8n, 17n, 64n]) {
				assert.equal(moduloBigIntIterative(m - 1n, m), m - 1n)
				assert.equal(moduloBigIntIterative(m, m), 0n)
				assert.equal(moduloBigIntIterative(m + 1n, m), m === 1n ? 0n : 1n)
				assert.equal(moduloBigIntIterative(2n * m - 1n, m), m - 1n)
				assert.equal(moduloBigIntIterative(2n * m, m), 0n)
				assert.equal(moduloBigIntIterative(2n * m + 1n, m), m === 1n ? 0n : 1n)
				assert.equal(moduloBigIntIterative(-m + 1n, m), m === 1n ? 0n : 1n)
				assert.equal(moduloBigIntIterative(-m, m), 0n)
				assert.equal(moduloBigIntIterative(-m - 1n, m), m - 1n)
				assert.equal(moduloBigIntIterative(-2n * m, m), 0n)
			}
		})

		it('handles arbitrarily huge BigInts in O(log(|a| / m)) iterations', () => {
			const m = 10n ** 18n + 7n
			const q = (1n << 1024n) + 9876543210123456789n
			const rExpected = 123456789012345678n

			// Positive huge dividend: q * m + rExpected
			assert.equal(moduloBigIntIterative(q * m + rExpected, m), rExpected)

			// Negative huge dividend: -(q * m + rExpected) => m - rExpected
			assert.equal(moduloBigIntIterative(-(q * m + rExpected), m), m - rExpected)

			// Huge dividend with tiny modulus (4096+ bit gap)
			const hugeA = (1n << 4096n) + 12345n
			const smallM = 97n
			const expected = ((hugeA % smallM) + smallM) % smallM
			assert.equal(moduloBigIntIterative(hugeA, smallM), expected)

			const negHugeA = -hugeA
			const expectedNeg = ((negHugeA % smallM) + smallM) % smallM
			assert.equal(moduloBigIntIterative(negHugeA, smallM), expectedNeg)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-BigInt dividend a', () => {
			for (const invalid of [10, 0, -5, NaN, Infinity, '10', null, undefined, true, {}, []]) {
				assert.throws(
					() => moduloBigIntIterative(invalid, 5n),
					{ name: 'TypeError' },
				)
			}
		})

		it('throws TypeError for non-BigInt modulus m', () => {
			for (const invalid of [5, 0, -5, NaN, Infinity, '5', null, undefined, false, {}, []]) {
				assert.throws(
					() => moduloBigIntIterative(10n, invalid),
					{ name: 'TypeError' },
				)
			}
		})

		it('throws TypeError when arguments are missing', () => {
			assert.throws(() => moduloBigIntIterative(), { name: 'TypeError' })
			assert.throws(() => moduloBigIntIterative(5n), { name: 'TypeError' })
		})

		it('throws RangeError when modulus m is zero', () => {
			assert.throws(() => moduloBigIntIterative(10n, 0n), { name: 'RangeError' })
			assert.throws(() => moduloBigIntIterative(0n, 0n), { name: 'RangeError' })
			assert.throws(() => moduloBigIntIterative(-10n, 0n), { name: 'RangeError' })
		})

		it('throws RangeError when modulus m is negative', () => {
			assert.throws(() => moduloBigIntIterative(10n, -1n), { name: 'RangeError' })
			assert.throws(() => moduloBigIntIterative(10n, -5n), { name: 'RangeError' })
			assert.throws(() => moduloBigIntIterative(-10n, -5n), { name: 'RangeError' })
			assert.throws(() => moduloBigIntIterative(0n, -(10n ** 50n)), { name: 'RangeError' })
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		it('matches built-in BigInt Euclidean formula ((a % m) + m) % m over a comprehensive grid', () => {
			const dividends = [
				-(10n ** 60n) - 123456789n,
				-(1n << 256n) - 1n,
				-(1n << 256n),
				-(1n << 64n) + 7n,
				-1000n,
				-17n,
				-5n,
				-1n,
				0n,
				1n,
				5n,
				17n,
				1000n,
				(1n << 64n) - 7n,
				1n << 256n,
				(1n << 256n) + 1n,
				10n ** 60n + 123456789n,
			]
			const moduli = [
				1n,
				2n,
				3n,
				5n,
				16n,
				97n,
				1000000007n,
				10n ** 18n,
				(1n << 127n) - 1n,
				10n ** 50n + 39n,
			]

			for (const a of dividends) {
				for (const m of moduli) {
					const actual = moduloBigIntIterative(a, m)
					const reference = ((a % m) + m) % m
					assert.equal(actual, reference, `mismatch for a=${a}, m=${m}`)
					assert.ok(actual >= 0n && actual < m, `range violation for a=${a}, m=${m}`)
					// Verify exact Euclidean divisibility: (a - actual) is an exact multiple of m
					assert.equal((a - actual) % m, 0n)
				}
			}
		})

		it('satisfies exact Mersenne-prime congruence 2^127 ≡ 1 (mod 2^127 - 1) without using %', () => {
			// Independent number-theoretic check: M127 = 2^127 - 1
			// Since 2^127 = M127 + 1 ≡ 1 (mod M127), for any k >= 0:
			//   2^(127 * k) ≡ 1 (mod M127)
			const m127 = (1n << 127n) - 1n
			assert.equal(moduloBigIntIterative(1n << 127n, m127), 1n)
			assert.equal(moduloBigIntIterative((1n << (127n * 20n)) + 999n, m127), 1000n)
			assert.equal(moduloBigIntIterative(-(1n << (127n * 20n)), m127), m127 - 1n)
		})

		it('satisfies modular arithmetic homomorphisms (additivity, multiplicativity, periodicity, negation)', () => {
			const m = 10n ** 18n + 3n
			const pairs = [
				[1234567890123456789012345n, 9876543210987654321098765n],
				[-777777777777777777777777n, 333333333333333333333333n],
				[-42n, -999999999999999999999999n],
				[0n, 123456789n],
			]

			for (const [a, b] of pairs) {
				const ra = moduloBigIntIterative(a, m)
				const rb = moduloBigIntIterative(b, m)

				// Additivity: (a + b) mod m === ((a mod m) + (b mod m)) mod m
				assert.equal(
					moduloBigIntIterative(a + b, m),
					moduloBigIntIterative(ra + rb, m),
				)

				// Multiplicativity: (a * b) mod m === ((a mod m) * (b mod m)) mod m
				assert.equal(
					moduloBigIntIterative(a * b, m),
					moduloBigIntIterative(ra * rb, m),
				)

				// Periodicity: (a + k * m) mod m === a mod m
				assert.equal(moduloBigIntIterative(a + 37n * m, m), ra)
				assert.equal(moduloBigIntIterative(a - 37n * m, m), ra)

				// Negation: (-a) mod m === (ra === 0n ? 0n : m - ra)
				assert.equal(
					moduloBigIntIterative(-a, m),
					ra === 0n ? 0n : m - ra,
				)
			}
		})
	})
})
