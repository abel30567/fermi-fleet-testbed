import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { moduloBigIntStable } from './moduloBigIntStable.js'

/**
 * Independent reference verifier using the Euclidean division identity:
 *   a = q * m + r  with  0n <= r < |m|
 * and exact divisibility of (a - r) by m.
 */
function assertEuclideanIdentity(a, m, r) {
	const absM = m < 0n ? -m : m
	assert.equal(typeof r, 'bigint')
	assert.ok(r >= 0n, `expected r >= 0n, got ${r} for (${a}, ${m})`)
	assert.ok(r < absM, `expected r < |m| (${absM}), got ${r} for (${a}, ${m})`)
	assert.equal((a - r) % m, 0n, `expected (a - r) divisible by m for (${a}, ${m})`)
	const q = (a - r) / m
	assert.equal(q * m + r, a, `expected q * m + r === a for (${a}, ${m})`)
}

describe('moduloBigIntStable', () => {
	it('computes standard positive dividend and positive modulus cases', () => {
		assert.equal(moduloBigIntStable(7n, 3n), 1n)
		assert.equal(moduloBigIntStable(10n, 4n), 2n)
		assert.equal(moduloBigIntStable(3n, 7n), 3n)
		assert.equal(moduloBigIntStable(1n, 1n), 0n)
		assert.equal(moduloBigIntStable(123456789n, 97n), 39n)
	})

	it('handles negative dividends with positive moduli (Euclidean non-negative residue)', () => {
		assert.equal(moduloBigIntStable(-1n, 3n), 2n)
		assert.equal(moduloBigIntStable(-7n, 3n), 2n)
		assert.equal(moduloBigIntStable(-10n, 4n), 2n)
		assert.equal(moduloBigIntStable(-3n, 7n), 4n)
		assert.equal(moduloBigIntStable(-1n, 1n), 0n)
	})

	it('handles negative moduli cleanly for both positive and negative dividends', () => {
		assert.equal(moduloBigIntStable(7n, -3n), 1n)
		assert.equal(moduloBigIntStable(-7n, -3n), 2n)
		assert.equal(moduloBigIntStable(1n, -5n), 1n)
		assert.equal(moduloBigIntStable(-1n, -5n), 4n)
		assert.equal(moduloBigIntStable(5n, -1n), 0n)
		assert.equal(moduloBigIntStable(-5n, -1n), 0n)
	})

	it('handles zero dividend and exact multiples', () => {
		assert.equal(moduloBigIntStable(0n, 1n), 0n)
		assert.equal(moduloBigIntStable(0n, -1n), 0n)
		assert.equal(moduloBigIntStable(0n, 999999999999999999999999n), 0n)
		assert.equal(moduloBigIntStable(0n, -999999999999999999999999n), 0n)
		assert.equal(moduloBigIntStable(12n, 4n), 0n)
		assert.equal(moduloBigIntStable(-12n, 4n), 0n)
		assert.equal(moduloBigIntStable(12n, -4n), 0n)
		assert.equal(moduloBigIntStable(-12n, -4n), 0n)
	})

	it('preserves exact precision for huge BigInts beyond Number.MAX_SAFE_INTEGER', () => {
		const m = 10n ** 50n + 7n
		const k = 10n ** 120n + 12345678901234567890n
		const expected = 10n ** 50n + 6n

		assert.equal(moduloBigIntStable(k * m + expected, m), expected)
		assert.equal(moduloBigIntStable(-(k * m) - 1n, m), m - 1n)
		assert.equal(moduloBigIntStable(k * m + expected, -m), expected)
		assert.equal(moduloBigIntStable(-(k * m) - 1n, -m), m - 1n)
		assert.equal(moduloBigIntStable(-(10n ** 18n) * m, m), 0n)
	})

	it('throws RangeError on zero modulus', () => {
		assert.throws(() => moduloBigIntStable(0n, 0n), RangeError)
		assert.throws(() => moduloBigIntStable(42n, 0n), RangeError)
		assert.throws(() => moduloBigIntStable(-42n, 0n), RangeError)
	})

	it('throws TypeError on invalid non-BigInt inputs', () => {
		const invalidValues = [0, 1, -5, 1.5, NaN, Infinity, '7', null, undefined, true, {}, [], 7n.toString()]
		for (const bad of invalidValues) {
			assert.throws(() => moduloBigIntStable(bad, 3n), TypeError)
			assert.throws(() => moduloBigIntStable(7n, bad), TypeError)
		}
		assert.throws(() => moduloBigIntStable(), TypeError)
		assert.throws(() => moduloBigIntStable(7n), TypeError)
	})

	it('satisfies the Euclidean division identity, sign invariance, and periodicity across a broad grid', () => {
		const dividends = [
			-(10n ** 60n) - 13n,
			-(10n ** 18n) - 1n,
			-1000n,
			-13n,
			-7n,
			-6n,
			-1n,
			0n,
			1n,
			6n,
			7n,
			13n,
			1000n,
			10n ** 18n + 1n,
			10n ** 60n + 13n,
		]
		const moduli = [
			-(10n ** 40n) - 9n,
			-(10n ** 18n),
			-97n,
			-7n,
			-3n,
			-1n,
			1n,
			3n,
			7n,
			97n,
			10n ** 18n,
			10n ** 40n + 9n,
		]

		for (const a of dividends) {
			for (const m of moduli) {
				const r = moduloBigIntStable(a, m)
				assertEuclideanIdentity(a, m, r)
				// Sign invariance of modulus
				assert.equal(r, moduloBigIntStable(a, -m))
				// Periodicity: (a + k*m) mod m === a mod m
				assert.equal(moduloBigIntStable(a + 5n * m, m), r)
				assert.equal(moduloBigIntStable(a - 5n * m, m), r)
				// Idempotence: (a mod m) mod m === a mod m
				assert.equal(moduloBigIntStable(r, m), r)
			}
		}
	})
})
