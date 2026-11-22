import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtBigIntIterative } from './sqrtBigIntIterative.js'

const SCALE = 10n ** 18n
const SCALE_SQUARED = SCALE * SCALE

/**
 * Independent reference integer square root via binary search for cross-checking.
 * @param {bigint} n
 * @returns {bigint}
 */
function isqrtBinarySearch(n) {
	if (n === 0n) return 0n
	let low = 1n
	let high = 1n << ((BigInt(n.toString(2).length) + 1n) >> 1n)
	while (low <= high) {
		const mid = (low + high) >> 1n
		const sq = mid * mid
		if (sq === n) return mid
		if (sq < n) {
			low = mid + 1n
		} else {
			high = mid - 1n
		}
	}
	return high
}

describe('sqrtBigIntIterative', () => {
	test('computes exact scaled square roots for perfect squares', () => {
		assert.equal(sqrtBigIntIterative(4n), 2n * SCALE)
		assert.equal(sqrtBigIntIterative(9n), 3n * SCALE)
		assert.equal(sqrtBigIntIterative(16n), 4n * SCALE)
		assert.equal(sqrtBigIntIterative(100n), 10n * SCALE)
		assert.equal(sqrtBigIntIterative(144n), 12n * SCALE)
		assert.equal(sqrtBigIntIterative(10_000n), 100n * SCALE)

		const root = 123_456_789_012_345n
		assert.equal(sqrtBigIntIterative(root * root), root * SCALE)
	})

	test('computes accurate 18-decimal-place fixed-point roots for non-squares', () => {
		// Known digits truncated to 18 decimal places
		assert.equal(sqrtBigIntIterative(2n), 1_414_213_562_373_095_048n)
		assert.equal(sqrtBigIntIterative(3n), 1_732_050_807_568_877_293n)
		assert.equal(sqrtBigIntIterative(5n), 2_236_067_977_499_789_696n)
		assert.equal(sqrtBigIntIterative(10n), 3_162_277_660_168_379_331n)
	})

	test('handles edge cases 0n, 1n, and near-square boundaries', () => {
		assert.equal(sqrtBigIntIterative(0n), 0n)
		assert.equal(sqrtBigIntIterative(1n), SCALE)

		// Boundary values of the form k^2 - 1 and k^2 + 1
		const boundaries = [3n, 8n, 15n, 24n, 99n, 101n, (10n ** 20n) ** 2n - 1n, (10n ** 20n) ** 2n + 1n]
		for (const x of boundaries) {
			const r = sqrtBigIntIterative(x)
			const scaled = x * SCALE_SQUARED
			assert.ok(r * r <= scaled, `r^2 <= x * 10^36 failed for ${x}`)
			assert.ok((r + 1n) * (r + 1n) > scaled, `(r+1)^2 > x * 10^36 failed for ${x}`)
		}
	})

	test('handles huge BigInts (> 2^128)', () => {
		const hugePerfect = (2n ** 128n) ** 2n
		assert.equal(sqrtBigIntIterative(hugePerfect), (2n ** 128n) * SCALE)

		const hugeValues = [
			2n ** 128n,
			2n ** 129n,
			2n ** 200n + 123_456_789n,
			2n ** 256n - 1n,
			10n ** 100n + 7n,
			2n ** 512n + 999_999_999_999n,
		]

		for (const x of hugeValues) {
			const r = sqrtBigIntIterative(x)
			const scaled = x * SCALE_SQUARED
			assert.ok(r * r <= scaled, `lower bound failed for huge input ${x}`)
			assert.ok((r + 1n) * (r + 1n) > scaled, `upper bound failed for huge input ${x}`)
		}
	})

	test('throws RangeError for negative BigInt inputs', () => {
		assert.throws(() => sqrtBigIntIterative(-1n), RangeError)
		assert.throws(() => sqrtBigIntIterative(-4n), RangeError)
		assert.throws(() => sqrtBigIntIterative(-(2n ** 200n)), RangeError)
	})

	test('throws TypeError for non-BigInt inputs', () => {
		const invalidInputs = [0, 4, -4, 2.5, NaN, Infinity, '4', null, undefined, {}, [], true, Symbol('x')]
		for (const input of invalidInputs) {
			assert.throws(() => sqrtBigIntIterative(input), TypeError)
		}
	})

	test('cross-checks against exact floor invariant, binary search isqrt, and Math.sqrt', () => {
		// 1. Exact floor invariant & Math.sqrt comparison for 0..100 and powers of 10
		const smallAndMedium = [
			...Array.from({ length: 101 }, (_, i) => BigInt(i)),
			1_000n,
			999_983n,
			1_000_000_007n,
			10n ** 15n,
		]

		for (const x of smallAndMedium) {
			const r = sqrtBigIntIterative(x)
			const scaled = x * SCALE_SQUARED
			assert.ok(r * r <= scaled, `r^2 <= x*10^36 failed for ${x}`)
			assert.ok((r + 1n) * (r + 1n) > scaled, `(r+1)^2 > x*10^36 failed for ${x}`)

			// Cross-check against Math.sqrt
			const approxFromBigInt = Number(r) / 1e18
			const approxFromMath = Math.sqrt(Number(x))
			if (x === 0n) {
				assert.equal(approxFromBigInt, 0)
			} else {
				const relError = Math.abs(approxFromBigInt - approxFromMath) / approxFromMath
				assert.ok(relError < 1e-14, `Math.sqrt mismatch for ${x}: relError=${relError}`)
			}
		}

		// 2. Cross-check against independent binary-search isqrt on diverse inputs including > 2^128
		const crossCheckInputs = [
			0n,
			1n,
			2n,
			3n,
			10n,
			2n ** 64n - 1n,
			2n ** 128n + 42n,
			2n ** 256n - 1n,
			10n ** 80n + 314_159_265n,
		]
		for (const x of crossCheckInputs) {
			const expected = isqrtBinarySearch(x * SCALE_SQUARED)
			assert.equal(sqrtBigIntIterative(x), expected)
		}

		// 3. Cross-check known digits of sqrt(2)
		const knownSqrt2Digits = '1.414213562373095048'
		const r2 = sqrtBigIntIterative(2n)
		const intPart = r2 / SCALE
		const fracPart = (r2 % SCALE).toString().padStart(18, '0')
		assert.equal(`${intPart}.${fracPart}`, knownSqrt2Digits)
	})
})
