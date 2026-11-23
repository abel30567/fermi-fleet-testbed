import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloBigIntRecursive } from './moduloBigIntRecursive.js'

/**
 * Independent reference implementation of Euclidean modulo using JS built-in `%`.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function euclideanModReference(a, b) {
	const m = b < 0n ? -b : b
	return ((a % m) + m) % m
}

/**
 * Deterministic xorshift64* PRNG returning unsigned 64-bit BigInts.
 *
 * @param {bigint} seed
 * @returns {() => bigint}
 */
function createPrng(seed) {
	let state = seed & ((1n << 64n) - 1n)
	return () => {
		state ^= state >> 12n
		state ^= (state << 25n) & ((1n << 64n) - 1n)
		state ^= state >> 27n
		return (state * 2685821657736338717n) & ((1n << 64n) - 1n)
	}
}

describe('moduloBigIntRecursive', () => {
	test('computes standard positive BigInt modulo cases', () => {
		assert.equal(moduloBigIntRecursive(10n, 3n), 1n)
		assert.equal(moduloBigIntRecursive(100n, 10n), 0n)
		assert.equal(moduloBigIntRecursive(7n, 7n), 0n)
		assert.equal(moduloBigIntRecursive(3n, 10n), 3n)
		assert.equal(moduloBigIntRecursive(0n, 5n), 0n)
		assert.equal(moduloBigIntRecursive(1n, 1n), 0n)
		assert.equal(moduloBigIntRecursive(42n, 1n), 0n)
		assert.equal(moduloBigIntRecursive(999999n, 97n), 999999n % 97n)
	})

	test('handles negative dividends with positive divisors (Euclidean semantics)', () => {
		assert.equal(moduloBigIntRecursive(-7n, 3n), 2n)
		assert.equal(moduloBigIntRecursive(-1n, 5n), 4n)
		assert.equal(moduloBigIntRecursive(-6n, 3n), 0n)
		assert.equal(moduloBigIntRecursive(-10n, 3n), 2n)
		assert.equal(moduloBigIntRecursive(-1n, 1n), 0n)
		assert.equal(moduloBigIntRecursive(-100n, 100n), 0n)
		assert.equal(moduloBigIntRecursive(-101n, 100n), 99n)
	})

	test('handles positive dividends with negative divisors (Euclidean semantics)', () => {
		assert.equal(moduloBigIntRecursive(7n, -3n), 1n)
		assert.equal(moduloBigIntRecursive(6n, -3n), 0n)
		assert.equal(moduloBigIntRecursive(0n, -5n), 0n)
		assert.equal(moduloBigIntRecursive(1n, -1n), 0n)
		assert.equal(moduloBigIntRecursive(3n, -10n), 3n)
		assert.equal(moduloBigIntRecursive(100n, -7n), 2n)
	})

	test('handles negative dividends with negative divisors (Euclidean semantics)', () => {
		assert.equal(moduloBigIntRecursive(-7n, -3n), 2n)
		assert.equal(moduloBigIntRecursive(-6n, -3n), 0n)
		assert.equal(moduloBigIntRecursive(-1n, -5n), 4n)
		assert.equal(moduloBigIntRecursive(-42n, -1n), 0n)
		assert.equal(moduloBigIntRecursive(-100n, -7n), 5n)
	})

	test('handles power-of-two boundaries and bit-width transitions', () => {
		for (const exp of [1n, 2n, 7n, 8n, 15n, 16n, 31n, 32n, 63n, 64n, 127n, 128n, 256n]) {
			const p = 1n << exp
			assert.equal(moduloBigIntRecursive(p, p), 0n)
			assert.equal(moduloBigIntRecursive(p - 1n, p), p - 1n)
			assert.equal(moduloBigIntRecursive(p + 1n, p), 1n)
			assert.equal(moduloBigIntRecursive(-p, p), 0n)
			assert.equal(moduloBigIntRecursive(-(p + 1n), p), p - 1n)
			assert.equal(moduloBigIntRecursive((p << 3n) + 5n, p + 1n), euclideanModReference((p << 3n) + 5n, p + 1n))
		}
	})

	test('handles huge BigInts without stack overflow or precision loss', () => {
		const a1 = (10n ** 500n) + 12345678901234567890n
		const b1 = 10n ** 18n + 7n
		assert.equal(moduloBigIntRecursive(a1, b1), euclideanModReference(a1, b1))

		const a2 = -(10n ** 1500n + 987654321n)
		const b2 = 10n ** 300n + 13n
		assert.equal(moduloBigIntRecursive(a2, b2), euclideanModReference(a2, b2))

		const a3 = (1n << 4096n) - 1n
		const b3 = (1n << 127n) - 1n
		assert.equal(moduloBigIntRecursive(a3, b3), euclideanModReference(a3, b3))

		// Extreme bit-width difference: 10000-bit dividend modulo small divisor
		const a4 = (1n << 10000n) + 42n
		const b4 = 997n
		assert.equal(moduloBigIntRecursive(a4, b4), euclideanModReference(a4, b4))
	})

	test('throws RangeError on division by zero', () => {
		assert.throws(() => moduloBigIntRecursive(10n, 0n), RangeError)
		assert.throws(() => moduloBigIntRecursive(0n, 0n), RangeError)
		assert.throws(() => moduloBigIntRecursive(-5n, 0n), RangeError)
	})

	test('throws TypeError on non-BigInt inputs', () => {
		const invalidValues = [10, 0, -1, 1.5, NaN, Infinity, '10', null, undefined, true, {}, []]
		for (const bad of invalidValues) {
			assert.throws(() => moduloBigIntRecursive(bad, 3n), TypeError)
			assert.throws(() => moduloBigIntRecursive(10n, bad), TypeError)
		}
	})

	test('independent cross-check: matches Euclidean reference and division identity across randomized sweep', () => {
		const next = createPrng(0x9e3779b97f4a7c15n)

		for (let i = 0; i < 200; i++) {
			// Build varied bit-widths from 1 to 512 bits
			const dividendWords = 1 + Number(next() % 8n)
			const divisorWords = 1 + Number(next() % 4n)

			let a = 0n
			for (let w = 0; w < dividendWords; w++) {
				a = (a << 64n) | next()
			}
			let b = 0n
			for (let w = 0; w < divisorWords; w++) {
				b = (b << 64n) | next()
			}
			if (b === 0n) {
				b = 1n
			}

			// Test all four sign combinations
			for (const sa of [1n, -1n]) {
				for (const sb of [1n, -1n]) {
					const signedA = sa * a
					const signedB = sb * b
					const absB = signedB < 0n ? -signedB : signedB

					const r = moduloBigIntRecursive(signedA, signedB)
					const expected = euclideanModReference(signedA, signedB)

					assert.equal(r, expected)
					assert.ok(r >= 0n && r < absB, `Remainder ${r} out of range [0, ${absB})`)

					// Euclidean division identity: signedA === signedB * q + r
					const diff = signedA - r
					assert.equal(diff % signedB, 0n)
					const q = diff / signedB
					assert.equal(signedB * q + r, signedA)
				}
			}
		}
	})

	test('independent cross-check: satisfies Fermat Little Theorem and modular ring homomorphisms', () => {
		// Fermat's Little Theorem: a^(p - 1) ≡ 1 (mod p) for prime p not dividing a
		assert.equal(moduloBigIntRecursive(2n ** 1008n, 1009n), 1n)
		assert.equal(moduloBigIntRecursive(10n ** 996n, 997n), 1n)
		assert.equal(moduloBigIntRecursive(3n ** 520n, 521n), 1n)

		// Ring homomorphisms and shift invariance
		const a = 98765432109876543210987654321n
		const c = -12345678901234567890123456789n
		const m = 1000000000000000003n
		const ra = moduloBigIntRecursive(a, m)
		const rc = moduloBigIntRecursive(c, m)

		assert.equal(moduloBigIntRecursive(a + c, m), moduloBigIntRecursive(ra + rc, m))
		assert.equal(moduloBigIntRecursive(a * c, m), moduloBigIntRecursive(ra * rc, m))
		assert.equal(moduloBigIntRecursive(a + 777777777n * m, m), ra)
		assert.equal(moduloBigIntRecursive(a - 999999999n * m, m), ra)
	})
})
