import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtBigIntStable } from './sqrtBigIntStable.js'

const SCALE = 10n ** 18n
const SCALE_SQ = SCALE * SCALE

/**
 * Independent reference implementation using pure binary search for
 * floor(sqrt(m)) and exact midpoint rounding (no Newton-Raphson, no bit-length
 * heuristics).
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function referenceBinarySearchSqrt(n) {
	if (n === 0n) return 0n
	const m = n * SCALE_SQ
	let lo = 0n
	let hi = 1n
	while (hi * hi <= m) {
		hi *= 2n
	}
	while (lo + 1n < hi) {
		const mid = (lo + hi) / 2n
		if (mid * mid <= m) {
			lo = mid
		} else {
			hi = mid
		}
	}
	// Exact half-ULP check: (lo + 1/2)^2 < m <=> (2*lo + 1)^2 < 4*m
	const twoLoPlus1 = 2n * lo + 1n
	return twoLoPlus1 * twoLoPlus1 < 4n * m ? lo + 1n : lo
}

/**
 * Verifies exact algebraic bracketing and strictly < 0.5 ULP error bound:
 *   1. (r - 1)^2 < n * 10^36 < (r + 1)^2
 *   2. (2r - 1)^2 < 4 * n * 10^36 < (2r + 1)^2
 *
 * @param {bigint} n
 * @param {bigint} r
 */
function assertTightBracket(n, r) {
	const m = n * SCALE_SQ
	if (n === 0n) {
		assert.equal(r, 0n)
		return
	}
	assert.ok((r - 1n) * (r - 1n) < m, `lower unit bracket failed for n=${n}`)
	assert.ok(m < (r + 1n) * (r + 1n), `upper unit bracket failed for n=${n}`)

	const fourM = 4n * m
	const lowerHalf = 2n * r - 1n
	const upperHalf = 2n * r + 1n
	assert.ok(lowerHalf * lowerHalf < fourM, `lower 0.5-ULP bracket failed for n=${n}`)
	assert.ok(fourM < upperHalf * upperHalf, `upper 0.5-ULP bracket failed for n=${n}`)
}

describe('sqrtBigIntStable', () => {
	test('handles zero and one', () => {
		assert.equal(sqrtBigIntStable(0n), 0n)
		assert.equal(sqrtBigIntStable(1n), SCALE)
	})

	test('returns exact scaled integers for perfect squares', () => {
		const roots = [
			0n,
			1n,
			2n,
			3n,
			10n,
			42n,
			123456789n,
			2n ** 53n + 1n,
			10n ** 30n + 7n,
			(1n << 100n) + 12345678901234567890n,
		]
		for (const k of roots) {
			assert.equal(sqrtBigIntStable(k * k), k * SCALE)
		}
	})

	test('matches known high-precision values for non-square integers', () => {
		// sqrt(2)  = 1.4142135623730950488016... -> rounds up to ...5049
		assert.equal(sqrtBigIntStable(2n), 1_414_213_562_373_095_049n)
		// sqrt(3)  = 1.7320508075688772935274... -> rounds up to ...7294
		assert.equal(sqrtBigIntStable(3n), 1_732_050_807_568_877_294n)
		// sqrt(5)  = 2.2360679774997896964091... -> rounds down to ...9696
		assert.equal(sqrtBigIntStable(5n), 2_236_067_977_499_789_696n)
		// sqrt(10) = 3.1622776601683793319988... -> rounds up to ...9332
		assert.equal(sqrtBigIntStable(10n), 3_162_277_660_168_379_332n)
		// sqrt(99) = 9.9498743710661995473447... -> rounds down to ...9547
		assert.equal(sqrtBigIntStable(99n), 9_949_874_371_066_199_547n)
	})

	test('respects exact half-ULP rounding threshold near large perfect squares', () => {
		// For k = 10^18, n = k^2 + 1 => scaled = (10^36)^2 + 10^36.
		// Remainder equals q = 10^36, so sqrt(scaled) < q + 0.5 and must round down.
		const kDown = 10n ** 18n
		const rDown = sqrtBigIntStable(kDown * kDown + 1n)
		assert.equal(rDown, kDown * SCALE)
		assertTightBracket(kDown * kDown + 1n, rDown)

		// For k = 10^18 - 1, n = k^2 + 1 => scaled = q^2 + 10^36 with q = 10^36 - 10^18.
		// Remainder 10^36 > q, so sqrt(scaled) > q + 0.5 and must round up.
		const kUp = 10n ** 18n - 1n
		const rUp = sqrtBigIntStable(kUp * kUp + 1n)
		assert.equal(rUp, kUp * SCALE + 1n)
		assertTightBracket(kUp * kUp + 1n, rUp)
	})

	test('handles huge 200-bit and 1200-bit BigInts beyond IEEE-754 limits', () => {
		const cases = [
			(1n << 200n) - 1n,
			1n << 200n,
			(1n << 200n) + 1n,
			(1n << 201n) + 0x123456789abcdef0123456789abcdefn,
			10n ** 65n + 31415926535897932384626433832795n,
			// Exceeds Number.MAX_VALUE (~2^1024), verifying zero float intermediates.
			(1n << 1200n) + 98765432109876543210987654321n,
		]

		for (const n of cases) {
			const result = sqrtBigIntStable(n)
			assertTightBracket(n, result)
			assert.equal(result, referenceBinarySearchSqrt(n))
		}
	})

	test('cross-checks against independent binary-search reference and tight bracketing', () => {
		const samples = [
			0n,
			1n,
			2n,
			3n,
			4n,
			5n,
			7n,
			8n,
			9n,
			15n,
			16n,
			17n,
			255n,
			256n,
			257n,
			1000n,
			999_999_999_999_999_999n,
			(1n << 64n) - 1n,
			(1n << 64n) + 1n,
			(1n << 127n) - 1n,
			(1n << 199n) + 77777777777777777777n,
			(1n << 200n) + (1n << 100n) + 1n,
		]

		for (const n of samples) {
			const actual = sqrtBigIntStable(n)
			const expected = referenceBinarySearchSqrt(n)
			assert.equal(actual, expected, `mismatch against binary-search reference for n=${n}`)
			assertTightBracket(n, actual)
		}
	})

	test('throws RangeError for negative BigInt inputs', () => {
		for (const bad of [-1n, -2n, -(1n << 200n)]) {
			assert.throws(() => sqrtBigIntStable(bad), {
				name: 'RangeError',
			})
		}
	})

	test('throws TypeError for non-BigInt inputs', () => {
		const invalidInputs = [
			0,
			4,
			-1,
			NaN,
			Infinity,
			'4',
			'0',
			null,
			undefined,
			true,
			false,
			{},
			[4n],
			Symbol('4'),
		]

		for (const bad of invalidInputs) {
			assert.throws(() => sqrtBigIntStable(bad), {
				name: 'TypeError',
			})
		}
	})
})
