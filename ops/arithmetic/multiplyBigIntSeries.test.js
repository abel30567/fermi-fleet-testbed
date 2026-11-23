import { describe, test } from 'node:test'
import assert from 'node:assert'
import { multiplyBigIntSeries } from './multiplyBigIntSeries.js'

/**
 * Independent binary (dyadic) series implementation of BigInt multiplication:
 *   a * b = sgn(b) * sum_{k >= 0} bit_k(|b|) * (a << k)
 * Used as an independent cross-check without relying on `*` or `**`.
 */
function binarySeriesMultiply(a, b) {
	let sign = 1n
	let x = a
	let y = b
	if (y < 0n) {
		sign = -sign
		y = -y
	}
	let acc = 0n
	while (y > 0n) {
		if ((y & 1n) === 1n) {
			acc += x
		}
		x <<= 1n
		y >>= 1n
	}
	return sign < 0n ? -acc : acc
}

describe('multiplyBigIntSeries', () => {
	test('multiplies standard positive integers', () => {
		assert.strictEqual(multiplyBigIntSeries(2n, 3n), 6n)
		assert.strictEqual(multiplyBigIntSeries(7n, 6n), 42n)
		assert.strictEqual(multiplyBigIntSeries(123n, 456n), 56088n)
		assert.strictEqual(multiplyBigIntSeries(999999n, 888888n), 888887111112n)
	})

	test('handles zero and identity elements', () => {
		assert.strictEqual(multiplyBigIntSeries(0n, 0n), 0n)
		assert.strictEqual(multiplyBigIntSeries(0n, 123456789n), 0n)
		assert.strictEqual(multiplyBigIntSeries(-987654321n, 0n), 0n)
		assert.strictEqual(multiplyBigIntSeries(1n, 42n), 42n)
		assert.strictEqual(multiplyBigIntSeries(42n, 1n), 42n)
		assert.strictEqual(multiplyBigIntSeries(-1n, 42n), -42n)
		assert.strictEqual(multiplyBigIntSeries(42n, -1n), -42n)
		assert.strictEqual(multiplyBigIntSeries(-1n, -1n), 1n)
	})

	test('handles negative and mixed-sign integers', () => {
		assert.strictEqual(multiplyBigIntSeries(-3n, 5n), -15n)
		assert.strictEqual(multiplyBigIntSeries(3n, -5n), -15n)
		assert.strictEqual(multiplyBigIntSeries(-7n, -9n), 63n)
		assert.strictEqual(multiplyBigIntSeries(-1000000n, 1000000n), -1000000000000n)
		assert.strictEqual(multiplyBigIntSeries(-12345n, -67890n), 838102050n)
	})

	test('handles equal factors and opposite factors', () => {
		assert.strictEqual(multiplyBigIntSeries(13n, 13n), 169n)
		assert.strictEqual(multiplyBigIntSeries(-13n, -13n), 169n)
		assert.strictEqual(multiplyBigIntSeries(13n, -13n), -169n)
		assert.strictEqual(multiplyBigIntSeries(-13n, 13n), -169n)
	})

	test('handles very large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
		const bigA = 10n ** 50n + 12345678901234567890n
		const bigB = -(10n ** 50n - 98765432109876543210n)
		assert.strictEqual(multiplyBigIntSeries(bigA, bigB), bigA * bigB)

		const hugeA = (1n << 256n) - 1n
		const hugeB = (1n << 256n) - 1n
		assert.strictEqual(multiplyBigIntSeries(hugeA, hugeB), hugeA * hugeB)

		const scale = 10n ** 18n
		assert.strictEqual(multiplyBigIntSeries(scale, scale), 10n ** 36n)
	})

	test('satisfies algebraic ring laws (commutativity, associativity, distributivity)', () => {
		const samples = [-99999999999999999999n, -17n, -1n, 0n, 1n, 2n, 37n, 10n ** 30n + 7n]
		for (const a of samples) {
			for (const b of samples) {
				assert.strictEqual(
					multiplyBigIntSeries(a, b),
					multiplyBigIntSeries(b, a),
					`commutativity failed for (${a}, ${b})`
				)
			}
		}

		const a = 123456789012345678901n
		const b = -9876543210987654321n
		const c = 55555555555555555555n
		assert.strictEqual(
			multiplyBigIntSeries(multiplyBigIntSeries(a, b), c),
			multiplyBigIntSeries(a, multiplyBigIntSeries(b, c))
		)
		assert.strictEqual(
			multiplyBigIntSeries(a, b + c),
			multiplyBigIntSeries(a, b) + multiplyBigIntSeries(a, c)
		)
	})

	test('cross-checks against independent binary series multiplication and native *', () => {
		const pairs = [
			[0n, 0n],
			[1n, 0n],
			[0n, -1n],
			[17n, 23n],
			[-17n, 23n],
			[17n, -23n],
			[-17n, -23n],
			[2n ** 64n - 1n, 2n ** 64n + 1n],
			[-(3n ** 40n), 7n ** 35n],
			[10n ** 40n + 314159265358979323n, -(10n ** 40n + 271828182845904523n)]
		]
		for (const [a, b] of pairs) {
			const result = multiplyBigIntSeries(a, b)
			assert.strictEqual(result, binarySeriesMultiply(a, b))
			assert.strictEqual(result, a * b)
		}
	})

	test('cross-checks squaring against the odd-integer series sum_{k=1..n} (2k - 1) = n^2', () => {
		let oddSum = 0n
		for (let n = 1n; n <= 50n; n++) {
			oddSum += 2n * n - 1n
			assert.strictEqual(multiplyBigIntSeries(n, n), oddSum)
			assert.strictEqual(multiplyBigIntSeries(-n, -n), oddSum)
			assert.strictEqual(multiplyBigIntSeries(n, -n), -oddSum)
		}
	})

	test('throws TypeError for non-BigInt inputs', () => {
		const invalidValues = [0, 1, -5, 3.14, NaN, Infinity, '10', '10n', null, undefined, true, false, {}, []]
		for (const invalid of invalidValues) {
			assert.throws(() => multiplyBigIntSeries(invalid, 2n), TypeError)
			assert.throws(() => multiplyBigIntSeries(2n, invalid), TypeError)
		}
		assert.throws(() => multiplyBigIntSeries(), TypeError)
		assert.throws(() => multiplyBigIntSeries(5n), TypeError)
	})
})
