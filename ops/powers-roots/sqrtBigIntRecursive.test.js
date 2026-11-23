import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtBigIntRecursive } from './sqrtBigIntRecursive.js'

const SCALE = 10n ** 18n
const SCALE_SQUARED = SCALE * SCALE

/**
 * Independent iterative binary-search integer square root for cross-checking.
 * Computes floor(sqrt(m)) without sharing any logic with Karatsuba recursion.
 *
 * @param {bigint} m
 * @returns {bigint}
 */
function independentBinarySearchISqrt(m) {
	if (m === 0n) return 0n
	let low = 1n
	let high = 1n
	while (high * high <= m) {
		high <<= 1n
	}
	low = high >> 1n
	while (low + 1n < high) {
		const mid = (low + high) >> 1n
		if (mid * mid <= m) {
			low = mid
		} else {
			high = mid
		}
	}
	return low
}

/**
 * Independent Newton-Raphson (Heron's method) integer square root for cross-checking.
 *
 * @param {bigint} m
 * @returns {bigint}
 */
function independentNewtonISqrt(m) {
	if (m < 2n) return m
	let x0 = m
	let x1 = (x0 + m / x0) >> 1n
	while (x1 < x0) {
		x0 = x1
		x1 = (x0 + m / x0) >> 1n
	}
	return x0
}

describe('sqrtBigIntRecursive', () => {
	test('handles zero and small perfect squares exactly', () => {
		assert.equal(sqrtBigIntRecursive(0n), 0n)
		assert.equal(sqrtBigIntRecursive(1n), 1n * SCALE)
		assert.equal(sqrtBigIntRecursive(4n), 2n * SCALE)
		assert.equal(sqrtBigIntRecursive(9n), 3n * SCALE)
		assert.equal(sqrtBigIntRecursive(16n), 4n * SCALE)
		assert.equal(sqrtBigIntRecursive(25n), 5n * SCALE)
		assert.equal(sqrtBigIntRecursive(100n), 10n * SCALE)
		assert.equal(sqrtBigIntRecursive(10000n), 100n * SCALE)
	})

	test('computes known irrational square roots to 18 fixed-point decimal places', () => {
		assert.equal(sqrtBigIntRecursive(2n), 1_414_213_562_373_095_048n)
		assert.equal(sqrtBigIntRecursive(3n), 1_732_050_807_568_877_293n)
		assert.equal(sqrtBigIntRecursive(5n), 2_236_067_977_499_789_696n)
		assert.equal(sqrtBigIntRecursive(10n), 3_162_277_660_168_379_331n)
	})

	test('handles edge cases around powers of two and perfect-square boundaries', () => {
		const edgeCases = [
			1n,
			2n,
			3n,
			4n,
			7n,
			8n,
			15n,
			16n,
			17n,
			63n,
			64n,
			65n,
			255n,
			256n,
			257n,
			(1n << 32n) - 1n,
			1n << 32n,
			(1n << 32n) + 1n,
			(1n << 64n) - 1n,
			1n << 64n,
			(1n << 64n) + 1n,
			(1n << 128n) - 1n,
			1n << 128n,
			(1n << 128n) + 1n,
		]

		for (const n of edgeCases) {
			const root = sqrtBigIntRecursive(n)
			const scaled = n * SCALE_SQUARED
			assert.ok(root * root <= scaled, `root^2 <= n*10^36 failed for n=${n}`)
			assert.ok((root + 1n) * (root + 1n) > scaled, `(root+1)^2 > n*10^36 failed for n=${n}`)
		}
	})

	test('handles very large BigInt inputs including huge perfect squares and non-squares', () => {
		const k = 10n ** 120n + 12345678901234567890123456789n
		assert.equal(sqrtBigIntRecursive(k * k), k * SCALE)

		const hugeNonSquare = (1n << 2048n) - 1n
		const root = sqrtBigIntRecursive(hugeNonSquare)
		const scaled = hugeNonSquare * SCALE_SQUARED
		assert.ok(root * root <= scaled)
		assert.ok((root + 1n) * (root + 1n) > scaled)
		assert.equal(root, independentNewtonISqrt(scaled))
	})

	test('is monotonically non-decreasing over consecutive integers', () => {
		let prev = sqrtBigIntRecursive(0n)
		for (let n = 1n; n <= 200n; n++) {
			const curr = sqrtBigIntRecursive(n)
			assert.ok(curr > prev, `Expected strict increase at n=${n}`)
			prev = curr
		}
	})

	test('cross-checks against independent binary-search and Newton-Raphson implementations', () => {
		const samples = [
			0n,
			1n,
			2n,
			3n,
			6n,
			7n,
			8n,
			11n,
			99n,
			101n,
			999n,
			123456789n,
			98765432109876543210n,
			10n ** 36n - 1n,
			10n ** 36n,
			10n ** 36n + 1n,
			10n ** 50n + 7n,
			(1n << 512n) + 12345n,
		]

		for (const n of samples) {
			const expectedBin = independentBinarySearchISqrt(n * SCALE_SQUARED)
			const expectedNewton = independentNewtonISqrt(n * SCALE_SQUARED)
			const actual = sqrtBigIntRecursive(n)
			assert.equal(actual, expectedBin, `Mismatch vs binary search for n=${n}`)
			assert.equal(actual, expectedNewton, `Mismatch vs Newton-Raphson for n=${n}`)
		}
	})

	test('cross-checks against Math.sqrt within floating-point precision for safe integers', () => {
		const safeValues = [2, 3, 5, 7, 13, 42, 137, 1023, 999983, 1234567890123]
		for (const num of safeValues) {
			const actual = sqrtBigIntRecursive(BigInt(num))
			const asFloat = Number(actual) / 1e18
			const expected = Math.sqrt(num)
			assert.ok(
				Math.abs(asFloat - expected) <= expected * 1e-14,
				`Float cross-check failed for ${num}: got ${asFloat}, expected ${expected}`
			)
		}
	})

	test('rejects invalid input types with TypeError', () => {
		const invalidInputs = [
			4,
			0,
			2.5,
			NaN,
			Infinity,
			-Infinity,
			'4',
			'16n',
			null,
			undefined,
			true,
			false,
			{},
			[4n],
			Symbol('4'),
		]

		for (const bad of invalidInputs) {
			assert.throws(
				() => sqrtBigIntRecursive(bad),
				{ name: 'TypeError' },
				`Expected TypeError for input ${String(bad)}`
			)
		}
	})

	test('rejects negative BigInt inputs with RangeError', () => {
		const negativeInputs = [-1n, -2n, -4n, -100n, -(10n ** 50n)]
		for (const neg of negativeInputs) {
			assert.throws(
				() => sqrtBigIntRecursive(neg),
				{ name: 'RangeError' },
				`Expected RangeError for input ${neg}`
			)
		}
	})
})
