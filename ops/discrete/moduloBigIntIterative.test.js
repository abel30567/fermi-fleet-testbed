import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloBigIntIterative } from './moduloBigIntIterative.js'

/**
 * Independent reference implementation using native BigInt `%`
 * adjusted to mathematical Euclidean remainder in [0n, |m|).
 */
function referenceEuclideanMod(a, m) {
	const absM = m < 0n ? -m : m
	const r = a % m
	return r < 0n ? r + absM : r
}

describe('moduloBigIntIterative', () => {
	test('computes standard positive dividend and positive divisor cases', () => {
		assert.equal(moduloBigIntIterative(7n, 3n), 1n)
		assert.equal(moduloBigIntIterative(10n, 5n), 0n)
		assert.equal(moduloBigIntIterative(3n, 5n), 3n)
		assert.equal(moduloBigIntIterative(25n, 4n), 1n)
		assert.equal(moduloBigIntIterative(100n, 7n), 2n)
		assert.equal(moduloBigIntIterative(1n, 2n), 1n)
	})

	test('handles zero dividend and unit divisors', () => {
		assert.equal(moduloBigIntIterative(0n, 1n), 0n)
		assert.equal(moduloBigIntIterative(0n, -1n), 0n)
		assert.equal(moduloBigIntIterative(0n, 7n), 0n)
		assert.equal(moduloBigIntIterative(0n, -7n), 0n)
		assert.equal(moduloBigIntIterative(42n, 1n), 0n)
		assert.equal(moduloBigIntIterative(-42n, 1n), 0n)
		assert.equal(moduloBigIntIterative(42n, -1n), 0n)
		assert.equal(moduloBigIntIterative(-42n, -1n), 0n)
	})

	test('handles negative dividends with positive divisors (Euclidean non-negative remainder)', () => {
		assert.equal(moduloBigIntIterative(-1n, 5n), 4n)
		assert.equal(moduloBigIntIterative(-3n, 5n), 2n)
		assert.equal(moduloBigIntIterative(-5n, 5n), 0n)
		assert.equal(moduloBigIntIterative(-6n, 3n), 0n)
		assert.equal(moduloBigIntIterative(-7n, 3n), 2n)
		assert.equal(moduloBigIntIterative(-100n, 7n), 5n)
	})

	test('handles positive and negative dividends with negative divisors', () => {
		assert.equal(moduloBigIntIterative(7n, -3n), 1n)
		assert.equal(moduloBigIntIterative(6n, -3n), 0n)
		assert.equal(moduloBigIntIterative(3n, -5n), 3n)
		assert.equal(moduloBigIntIterative(-7n, -3n), 2n)
		assert.equal(moduloBigIntIterative(-6n, -3n), 0n)
		assert.equal(moduloBigIntIterative(-3n, -5n), 2n)
		assert.equal(moduloBigIntIterative(-1n, -5n), 4n)
	})

	test('handles boundary multiples and powers of two', () => {
		for (let k = 0n; k <= 64n; k += 8n) {
			const p = 1n << k
			assert.equal(moduloBigIntIterative(p, p), 0n)
			assert.equal(moduloBigIntIterative(-p, p), 0n)
			assert.equal(moduloBigIntIterative(p, -p), 0n)
			assert.equal(moduloBigIntIterative(-p, -p), 0n)
			if (p > 1n) {
				assert.equal(moduloBigIntIterative(p - 1n, p), p - 1n)
				assert.equal(moduloBigIntIterative(p + 1n, p), 1n)
				assert.equal(moduloBigIntIterative(-(p + 1n), p), p - 1n)
				assert.equal(moduloBigIntIterative(-(p - 1n), p), 1n)
			}
		}
	})

	test('handles huge BigInt values accurately (including 10^18 fixed-point scale and >256-bit integers)', () => {
		const scale = 10n ** 18n
		assert.equal(moduloBigIntIterative(3n * scale + 123456789012345678n, scale), 123456789012345678n)
		assert.equal(moduloBigIntIterative(-(3n * scale + 1n), scale), scale - 1n)

		const hugeA = (1n << 512n) + (1n << 255n) + 9876543210123456789n
		const hugeM = (1n << 127n) - 1n // Mersenne prime M127
		const expectedPos = referenceEuclideanMod(hugeA, hugeM)
		const expectedNeg = referenceEuclideanMod(-hugeA, hugeM)
		assert.equal(moduloBigIntIterative(hugeA, hugeM), expectedPos)
		assert.equal(moduloBigIntIterative(-hugeA, hugeM), expectedNeg)
		assert.equal(moduloBigIntIterative(hugeA, -hugeM), expectedPos)
		assert.equal(moduloBigIntIterative(-hugeA, -hugeM), expectedNeg)

		// Dividend much larger than small prime modulus
		const veryLarge = 10n ** 200n + 17n
		assert.equal(moduloBigIntIterative(veryLarge, 97n), referenceEuclideanMod(veryLarge, 97n))
		assert.equal(moduloBigIntIterative(-veryLarge, 97n), referenceEuclideanMod(-veryLarge, 97n))
	})

	test('throws TypeError on non-BigInt inputs', () => {
		const invalidValues = [0, 1, -5, 3.14, NaN, Infinity, '5', '0n', null, undefined, true, false, {}, [], Symbol('x')]
		for (const val of invalidValues) {
			assert.throws(() => moduloBigIntIterative(val, 3n), TypeError)
			assert.throws(() => moduloBigIntIterative(3n, val), TypeError)
		}
		assert.throws(() => moduloBigIntIterative(), TypeError)
		assert.throws(() => moduloBigIntIterative(5n), TypeError)
	})

	test('throws RangeError on zero modulus', () => {
		assert.throws(() => moduloBigIntIterative(0n, 0n), RangeError)
		assert.throws(() => moduloBigIntIterative(10n, 0n), RangeError)
		assert.throws(() => moduloBigIntIterative(-10n, 0n), RangeError)
		assert.throws(() => moduloBigIntIterative(10n ** 50n, 0n), RangeError)
	})

	test('cross-checks against native BigInt % and Euclidean division identity a = q*m + r', () => {
		// Deterministic pseudo-random BigInt generator (LCG) for broad coverage
		let state = 0x123456789abcdef0123456789abcdef1n
		const mask = (1n << 128n) - 1n
		const nextBigInt = (bits) => {
			state = (state * 6364136223846793005n + 1442695040888963407n) & mask
			return state >> (128n - BigInt(bits))
		}

		// Exhaustive small grid
		for (let a = -25n; a <= 25n; a += 1n) {
			for (let m = -12n; m <= 12n; m += 1n) {
				if (m === 0n) continue
				const r = moduloBigIntIterative(a, m)
				const absM = m < 0n ? -m : m

				assert.equal(r, referenceEuclideanMod(a, m))
				assert.ok(r >= 0n && r < absM, `Remainder ${r} out of range [0, ${absM})`)
				assert.equal((a - r) % m, 0n)
				const q = (a - r) / m
				assert.equal(q * m + r, a)
			}
		}

		// Randomized large BigInt pairs across all sign combinations
		const bitSizes = [8, 16, 32, 64, 96, 128]
		for (let i = 0; i < 60; i++) {
			const aBits = bitSizes[i % bitSizes.length]
			const mBits = bitSizes[(i * 3 + 1) % bitSizes.length]
			let a = nextBigInt(aBits)
			let m = nextBigInt(mBits) + 1n
			if (i % 2 === 1) a = -a
			if (i % 4 >= 2) m = -m

			const r = moduloBigIntIterative(a, m)
			const absM = m < 0n ? -m : m

			assert.equal(r, referenceEuclideanMod(a, m))
			assert.ok(r >= 0n && r < absM)
			assert.equal((a - r) % m, 0n)
			const q = (a - r) / m
			assert.equal(q * m + r, a)
		}
	})
})
