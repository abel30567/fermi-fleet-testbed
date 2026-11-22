import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloBigIntSeries } from './moduloBigIntSeries.js'

/**
 * Independent Euclidean division quotient helper (without calling moduloBigIntSeries):
 * Finds unique integer q such that a = q * m + r with 0n <= r < |m|.
 */
function independentEuclideanQuotient(a, m) {
	const tq = a / m // truncated toward zero
	const tr = a - tq * m
	if (tr >= 0n) {
		return tq
	}
	return m > 0n ? tq - 1n : tq + 1n
}

/**
 * Independent bit-by-bit (binary series) modular reduction for arbitrary BigInts:
 * Reduces |a| = sum_{i} b_i * 2^i modulo |m| via Horner's rule, then reflects if a < 0.
 */
function independentBinarySeriesMod(a, m) {
	const absM = m < 0n ? -m : m
	const isNeg = a < 0n
	const absA = isNeg ? -a : a
	const bits = absA.toString(2)
	let acc = 0n
	for (let i = 0; i < bits.length; i++) {
		acc = acc + acc + (bits[i] === '1' ? 1n : 0n)
		if (acc >= absM) {
			acc -= absM
		}
	}
	if (!isNeg || acc === 0n) {
		return acc
	}
	return absM - acc
}

describe('moduloBigIntSeries', () => {
	test('normal cases: positive and negative dividends and moduli', () => {
		// Positive dividend, positive modulus
		assert.equal(moduloBigIntSeries(17n, 5n), 2n)
		assert.equal(moduloBigIntSeries(3n, 10n), 3n)
		assert.equal(moduloBigIntSeries(100n, 7n), 2n)

		// Negative dividend, positive modulus -> canonical non-negative residue
		assert.equal(moduloBigIntSeries(-1n, 5n), 4n)
		assert.equal(moduloBigIntSeries(-7n, 5n), 3n)
		assert.equal(moduloBigIntSeries(-17n, 5n), 3n)
		assert.equal(moduloBigIntSeries(-3n, 10n), 7n)

		// Positive dividend, negative modulus -> canonical non-negative residue in [0, |m| - 1]
		assert.equal(moduloBigIntSeries(17n, -5n), 2n)
		assert.equal(moduloBigIntSeries(7n, -5n), 2n)
		assert.equal(moduloBigIntSeries(3n, -10n), 3n)

		// Negative dividend, negative modulus -> canonical non-negative residue in [0, |m| - 1]
		assert.equal(moduloBigIntSeries(-1n, -5n), 4n)
		assert.equal(moduloBigIntSeries(-7n, -5n), 3n)
		assert.equal(moduloBigIntSeries(-17n, -5n), 3n)
	})

	test('edge cases: zero dividend, exact multiples, |m| = 1n, and huge BigInts > 2^256', () => {
		// a = 0n
		assert.equal(moduloBigIntSeries(0n, 1n), 0n)
		assert.equal(moduloBigIntSeries(0n, -1n), 0n)
		assert.equal(moduloBigIntSeries(0n, 97n), 0n)
		assert.equal(moduloBigIntSeries(0n, -97n), 0n)

		// a divisible by m
		assert.equal(moduloBigIntSeries(25n, 5n), 0n)
		assert.equal(moduloBigIntSeries(-25n, 5n), 0n)
		assert.equal(moduloBigIntSeries(25n, -5n), 0n)
		assert.equal(moduloBigIntSeries(-25n, -5n), 0n)

		// |m| = 1n
		for (const a of [-99999999999999999999n, -1n, 0n, 1n, 42n, 2n ** 300n]) {
			assert.equal(moduloBigIntSeries(a, 1n), 0n)
			assert.equal(moduloBigIntSeries(a, -1n), 0n)
		}

		// Huge BigInts (> 2^256)
		const bigA = (1n << 300n) + 123456789012345678901234567890n
		const bigM = (1n << 260n) + 9876543210987654321n
		const posRes = moduloBigIntSeries(bigA, bigM)
		const negRes = moduloBigIntSeries(-bigA, bigM)
		assert.ok(posRes >= 0n && posRes < bigM)
		assert.ok(negRes >= 0n && negRes < bigM)
		assert.equal((posRes + negRes) % bigM, 0n)

		// Known exact huge result: (k * M + r) mod M === r and (-k * M - r) mod M === M - r
		const k = (1n << 280n) + 777n
		const r = (1n << 257n) + 42n
		const mHuge = (1n << 258n) + 99n
		assert.equal(moduloBigIntSeries(k * mHuge + r, mHuge), r)
		assert.equal(moduloBigIntSeries(-(k * mHuge + r), mHuge), mHuge - r)
		assert.equal(moduloBigIntSeries(-(k * mHuge + r), -mHuge), mHuge - r)
	})

	test('invalid inputs: m = 0n and non-BigInt arguments throw appropriate errors', () => {
		assert.throws(() => moduloBigIntSeries(10n, 0n), RangeError)
		assert.throws(() => moduloBigIntSeries(0n, 0n), RangeError)
		assert.throws(() => moduloBigIntSeries(-10n, 0n), RangeError)

		const invalidValues = [0, 1, -5, 3.14, NaN, Infinity, '10', null, undefined, true, {}, []]
		for (const bad of invalidValues) {
			assert.throws(() => moduloBigIntSeries(bad, 5n), TypeError)
			assert.throws(() => moduloBigIntSeries(5n, bad), TypeError)
		}
		assert.throws(() => moduloBigIntSeries(), TypeError)
	})

	test('cross-check: Euclidean division invariant and independent binary-series reduction', () => {
		const dividends = [
			0n,
			1n,
			-1n,
			42n,
			-42n,
			1000000000000000000000000000000n,
			-1000000000000000000000000000000n,
			(1n << 320n) + 0xdeadbeefcafebabe123456789abcdef0n,
			-((1n << 320n) + 0xdeadbeefcafebabe123456789abcdef0n),
		]
		const moduli = [
			1n,
			-1n,
			2n,
			-2n,
			7n,
			-7n,
			97n,
			-97n,
			10n ** 18n,
			-(10n ** 18n),
			(1n << 260n) + 1337n,
			-((1n << 260n) + 1337n),
		]

		for (const a of dividends) {
			for (const m of moduli) {
				const absM = m < 0n ? -m : m
				const r = moduloBigIntSeries(a, m)
				const q = independentEuclideanQuotient(a, m)

				// Euclidean division invariant: a === q * m + r and 0n <= r < |m|
				assert.equal(a, q * m + r)
				assert.ok(r >= 0n && r < absM)

				// Independent binary-series reduction cross-check
				assert.equal(r, independentBinarySeriesMod(a, m))

				// Idempotence and modulus sign invariance
				assert.equal(moduloBigIntSeries(r, m), r)
				assert.equal(r, moduloBigIntSeries(a, -m))
			}
		}
	})

	test('cross-check: modular arithmetic homomorphisms (addition, subtraction, multiplication)', () => {
		const pairs = [
			[13n, 29n],
			[-13n, 29n],
			[13n, -29n],
			[-13n, -29n],
			[0n, -123456789n],
			[(1n << 270n) + 9999999999999999999n, -((1n << 265n) + 1234567890123456789n)],
			[-((1n << 300n) + 314159265358979323846n), -((1n << 290n) + 271828182845904523536n)],
		]
		const moduli = [1n, -1n, 13n, -13n, 10n ** 18n + 3n, -((1n << 257n) + 297n)]

		for (const [a, b] of pairs) {
			for (const m of moduli) {
				const ra = moduloBigIntSeries(a, m)
				const rb = moduloBigIntSeries(b, m)

				// Addition homomorphism: (a + b) mod m === ((a mod m) + (b mod m)) mod m
				assert.equal(moduloBigIntSeries(a + b, m), moduloBigIntSeries(ra + rb, m))

				// Subtraction homomorphism: (a - b) mod m === ((a mod m) - (b mod m)) mod m
				assert.equal(moduloBigIntSeries(a - b, m), moduloBigIntSeries(ra - rb, m))

				// Multiplication homomorphism: (a * b) mod m === ((a mod m) * (b mod m)) mod m
				assert.equal(moduloBigIntSeries(a * b, m), moduloBigIntSeries(ra * rb, m))

				// Periodicity: (a + k * m) mod m === a mod m
				assert.equal(moduloBigIntSeries(a + 12345n * m, m), ra)
				assert.equal(moduloBigIntSeries(a - 12345n * m, m), ra)
			}
		}
	})
})
