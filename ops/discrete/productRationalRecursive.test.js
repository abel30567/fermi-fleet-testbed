import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productRationalRecursive } from './productRationalRecursive.js'

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function naiveProduct(values) {
	let num = 1n
	let den = 1n
	for (const r of values) {
		num *= r.num
		den *= r.den
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

describe('productRationalRecursive', () => {
	test('computes product of positive rationals with cancellation', () => {
		const result = productRationalRecursive([
			{ num: 2n, den: 3n },
			{ num: 3n, den: 4n },
			{ num: 4n, den: 5n },
		])
		assert.deepEqual(result, { num: 2n, den: 5n })
	})

	test('handles negative numerators and denominators with proper sign normalization', () => {
		assert.deepEqual(
			productRationalRecursive([
				{ num: -2n, den: 3n },
				{ num: 5n, den: -7n },
			]),
			{ num: 10n, den: 21n }
		)
		assert.deepEqual(
			productRationalRecursive([
				{ num: -2n, den: 3n },
				{ num: 5n, den: -7n },
				{ num: -3n, den: 10n },
			]),
			{ num: -1n, den: 7n }
		)
	})

	test('reduces unreduced rational inputs to lowest terms', () => {
		const result = productRationalRecursive([
			{ num: 12n, den: 18n },
			{ num: -15n, den: -25n },
			{ num: 20n, den: -8n },
		])
		assert.deepEqual(result, { num: -1n, den: 1n })
	})

	test('handles exact BigInt values far beyond Number.MAX_SAFE_INTEGER', () => {
		const p1 = 2n ** 120n + 1n
		const p2 = 2n ** 100n + 3n
		const result = productRationalRecursive([
			{ num: p1, den: p2 },
			{ num: p2 * 7n, den: p1 * 11n },
			{ num: 2n ** 80n, den: 1n },
		])
		assert.deepEqual(result, { num: 7n * 2n ** 80n, den: 11n })
	})

	test('returns multiplicative identity { num: 1n, den: 1n } for empty array', () => {
		assert.deepEqual(productRationalRecursive([]), { num: 1n, den: 1n })
	})

	test('normalizes single-element arrays including zero and negative denominator', () => {
		assert.deepEqual(productRationalRecursive([{ num: 6n, den: -9n }]), {
			num: -2n,
			den: 3n,
		})
		assert.deepEqual(productRationalRecursive([{ num: 0n, den: -7n }]), {
			num: 0n,
			den: 1n,
		})
	})

	test('returns { num: 0n, den: 1n } when any element is zero', () => {
		assert.deepEqual(
			productRationalRecursive([
				{ num: 0n, den: 5n },
				{ num: 7n, den: 9n },
			]),
			{ num: 0n, den: 1n }
		)
		assert.deepEqual(
			productRationalRecursive([
				{ num: 3n, den: 4n },
				{ num: 0n, den: -3n },
				{ num: 9n, den: 2n },
			]),
			{ num: 0n, den: 1n }
		)
		assert.deepEqual(
			productRationalRecursive([
				{ num: 3n, den: 4n },
				{ num: 5n, den: 6n },
				{ num: 0n, den: 1n },
			]),
			{ num: 0n, den: 1n }
		)
	})

	test('does not mutate input array or rational objects', () => {
		const a = Object.freeze({ num: 4n, den: -6n })
		const b = Object.freeze({ num: 9n, den: 10n })
		const input = Object.freeze([a, b])
		const result = productRationalRecursive(input)
		assert.deepEqual(result, { num: -3n, den: 5n })
		assert.deepEqual(a, { num: 4n, den: -6n })
		assert.deepEqual(b, { num: 9n, den: 10n })
	})

	test('throws TypeError for non-array inputs', () => {
		for (const bad of [null, undefined, 123, '1/2', {}, new Set()]) {
			assert.throws(() => productRationalRecursive(bad), TypeError)
		}
	})

	test('throws TypeError for malformed rational elements', () => {
		const badElements = [
			null,
			undefined,
			42,
			[1n, 2n],
			{},
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: '1', den: '2' },
			{ num: 1n },
			{ den: 2n },
		]
		for (const bad of badElements) {
			assert.throws(() => productRationalRecursive([bad]), TypeError)
		}
	})

	test('throws RangeError for zero denominator even when another element is zero', () => {
		assert.throws(
			() => productRationalRecursive([{ num: 1n, den: 0n }]),
			RangeError
		)
		assert.throws(
			() => productRationalRecursive([{ num: 0n, den: 0n }]),
			RangeError
		)
		assert.throws(
			() =>
				productRationalRecursive([
					{ num: 0n, den: 1n },
					{ num: 5n, den: 0n },
				]),
			RangeError
		)
		assert.throws(
			() =>
				productRationalRecursive([
					{ num: 0n, den: 1n },
					{ num: 5, den: 2n },
				]),
			TypeError
		)
	})

	test('independent cross-check: telescoping product over 2000 terms', () => {
		const n = 2000n
		const terms = []
		for (let k = 1n; k <= n; k++) {
			terms.push({ num: k, den: k + 1n })
		}
		assert.deepEqual(productRationalRecursive(terms), {
			num: 1n,
			den: n + 1n,
		})
	})

	test('independent cross-check: matches naive sequential accumulation across varied lengths', () => {
		let seed = 0x123456789abcdef1n
		const nextInt = () => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
			return seed
		}

		for (const length of [1, 2, 3, 4, 5, 7, 8, 15, 16, 17, 50, 100]) {
			const terms = []
			for (let i = 0; i < length; i++) {
				const rawNum = (nextInt() % 2001n) - 1000n
				const num = rawNum === 0n ? 1n : rawNum
				const sign = (nextInt() & 1n) === 0n ? 1n : -1n
				const den = sign * ((nextInt() % 1000n) + 1n)
				terms.push({ num, den })
			}
			const actual = productRationalRecursive(terms)
			const expected = naiveProduct(terms)
			assert.deepEqual(actual, expected)
			assert.ok(actual.den > 0n)
			assert.equal(gcd(actual.num, actual.den), 1n)
		}
	})
})
