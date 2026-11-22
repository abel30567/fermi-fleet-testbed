import { describe, test } from 'node:test'
import assert from 'node:assert'
import { moduloBigIntRecursive } from './moduloBigIntRecursive.js'

/**
 * Reference Euclidean modulo implemented via JavaScript's built-in `%` operator.
 * Always returns a remainder in `[0n, |m|)`.
 */
function referenceEuclideanMod(a, m) {
	const absM = m < 0n ? -m : m
	const r = a % absM
	return r < 0n ? r + absM : r
}

describe('moduloBigIntRecursive', () => {
	test('handles normal positive cases', () => {
		assert.strictEqual(moduloBigIntRecursive(10n, 3n), 1n)
		assert.strictEqual(moduloBigIntRecursive(13n, 3n), 1n)
		assert.strictEqual(moduloBigIntRecursive(23n, 3n), 2n)
		assert.strictEqual(moduloBigIntRecursive(9n, 3n), 0n)
		assert.strictEqual(moduloBigIntRecursive(3n, 3n), 0n)
		assert.strictEqual(moduloBigIntRecursive(2n, 5n), 2n)
		assert.strictEqual(moduloBigIntRecursive(123456789n, 1n), 0n)
		assert.strictEqual(moduloBigIntRecursive(100n, 7n), 2n)
	})

	test('handles zero dividend with positive and negative moduli', () => {
		assert.strictEqual(moduloBigIntRecursive(0n, 1n), 0n)
		assert.strictEqual(moduloBigIntRecursive(0n, 7n), 0n)
		assert.strictEqual(moduloBigIntRecursive(0n, -7n), 0n)
		assert.strictEqual(moduloBigIntRecursive(0n, 10n ** 100n), 0n)
		assert.strictEqual(moduloBigIntRecursive(0n, -(10n ** 100n)), 0n)
	})

	test('handles negative dividends (Euclidean non-negative remainder)', () => {
		assert.strictEqual(moduloBigIntRecursive(-1n, 3n), 2n)
		assert.strictEqual(moduloBigIntRecursive(-7n, 3n), 2n)
		assert.strictEqual(moduloBigIntRecursive(-6n, 3n), 0n)
		assert.strictEqual(moduloBigIntRecursive(-3n, 3n), 0n)
		assert.strictEqual(moduloBigIntRecursive(-2n, 5n), 3n)
		assert.strictEqual(moduloBigIntRecursive(-100n, 7n), 5n)
		assert.strictEqual(moduloBigIntRecursive(-123456789n, 1n), 0n)
	})

	test('handles negative moduli (remainder strictly in [0n, |m|))', () => {
		assert.strictEqual(moduloBigIntRecursive(7n, -3n), 1n)
		assert.strictEqual(moduloBigIntRecursive(6n, -3n), 0n)
		assert.strictEqual(moduloBigIntRecursive(2n, -5n), 2n)
		assert.strictEqual(moduloBigIntRecursive(-7n, -3n), 2n)
		assert.strictEqual(moduloBigIntRecursive(-6n, -3n), 0n)
		assert.strictEqual(moduloBigIntRecursive(-1n, -5n), 4n)
		assert.strictEqual(moduloBigIntRecursive(-123n, -1n), 0n)
	})

	test('handles power-of-two boundary conditions around binary doubling', () => {
		for (const k of [0n, 1n, 2n, 3n, 7n, 16n, 32n, 64n, 128n]) {
			const m = 1n << k
			for (const offset of [-2n, -1n, 0n, 1n, 2n]) {
				const a = (m << 3n) + offset
				assert.strictEqual(moduloBigIntRecursive(a, m), referenceEuclideanMod(a, m))
				assert.strictEqual(moduloBigIntRecursive(-a, m), referenceEuclideanMod(-a, m))
				if (m > 1n) {
					const mMinus1 = m - 1n
					assert.strictEqual(
						moduloBigIntRecursive(a, mMinus1),
						referenceEuclideanMod(a, mMinus1),
					)
				}
			}
		}
	})

	test('handles huge BigInts (10^100 and beyond)', () => {
		const ten100 = 10n ** 100n
		const ten250 = 10n ** 250n
		const hugePrimeLike = (1n << 127n) - 1n // Mersenne prime M127

		assert.strictEqual(moduloBigIntRecursive(ten100, 97n), referenceEuclideanMod(ten100, 97n))
		assert.strictEqual(moduloBigIntRecursive(-ten100, 97n), referenceEuclideanMod(-ten100, 97n))
		assert.strictEqual(moduloBigIntRecursive(ten100, -97n), referenceEuclideanMod(ten100, -97n))
		assert.strictEqual(moduloBigIntRecursive(-ten100, -97n), referenceEuclideanMod(-ten100, -97n))

		assert.strictEqual(
			moduloBigIntRecursive(ten250 + 1234567890123456789n, hugePrimeLike),
			referenceEuclideanMod(ten250 + 1234567890123456789n, hugePrimeLike),
		)
		assert.strictEqual(
			moduloBigIntRecursive(-(ten250 + 1234567890123456789n), hugePrimeLike),
			referenceEuclideanMod(-(ten250 + 1234567890123456789n), hugePrimeLike),
		)
		// Fixed-point 10^18 scaled values
		const scale = 10n ** 18n
		const scaledA = 314159265358979323846264338327950288n
		assert.strictEqual(
			moduloBigIntRecursive(scaledA, scale),
			846264338327950288n,
		)
		assert.strictEqual(
			moduloBigIntRecursive(-scaledA, scale),
			scale - 846264338327950288n,
		)
	})

	test('throws RangeError when modulus is 0n', () => {
		assert.throws(() => moduloBigIntRecursive(10n, 0n), RangeError)
		assert.throws(() => moduloBigIntRecursive(0n, 0n), RangeError)
		assert.throws(() => moduloBigIntRecursive(-10n, 0n), RangeError)
	})

	test('throws TypeError for non-BigInt inputs', () => {
		const invalidValues = [
			0,
			1,
			-5,
			3.14,
			NaN,
			Infinity,
			'10',
			'0',
			null,
			undefined,
			true,
			false,
			{},
			[],
			Symbol('x'),
			Object(10n),
		]

		for (const invalid of invalidValues) {
			assert.throws(
				() => moduloBigIntRecursive(invalid, 3n),
				TypeError,
				`Expected TypeError for invalid dividend: ${String(invalid)}`,
			)
			assert.throws(
				() => moduloBigIntRecursive(10n, invalid),
				TypeError,
				`Expected TypeError for invalid modulus: ${String(invalid)}`,
			)
		}

		assert.throws(() => moduloBigIntRecursive(), TypeError)
		assert.throws(() => moduloBigIntRecursive(10n), TypeError)
	})

	test('cross-checks extensively against built-in % adjusted to Euclidean modulo', () => {
		// Exhaustive small grid
		for (let a = -25n; a <= 25n; a += 1n) {
			for (let m = -12n; m <= 12n; m += 1n) {
				if (m === 0n) continue
				const actual = moduloBigIntRecursive(a, m)
				const expected = referenceEuclideanMod(a, m)
				const absM = m < 0n ? -m : m
				assert.strictEqual(actual, expected, `Mismatch for (${a}n, ${m}n)`)
				assert.ok(actual >= 0n && actual < absM, `Range invariant failed for (${a}n, ${m}n)`)
				assert.strictEqual((a - actual) % m, 0n, `Congruence invariant failed for (${a}n, ${m}n)`)
			}
		}

		// Deterministic pseudo-random large BigInt cross-check
		let state = 0x123456789abcdef0123456789abcdef0n
		const lcgMod = 1n << 128n
		const nextBig = () => {
			state = (state * 6364136223846793005n + 1442695040888963407n) & (lcgMod - 1n)
			return state
		}

		for (let i = 0; i < 100; i += 1) {
			const magA = (nextBig() << 128n) | nextBig()
			const magM = (nextBig() >> BigInt(i % 120)) + 1n
			const a = i % 2 === 0 ? magA : -magA
			const m = i % 3 === 0 ? -magM : magM

			const actual = moduloBigIntRecursive(a, m)
			const expected = referenceEuclideanMod(a, m)
			assert.strictEqual(actual, expected)
			assert.ok(actual >= 0n && actual < (m < 0n ? -m : m))
			assert.strictEqual((a - actual) % m, 0n)
		}
	})
})
