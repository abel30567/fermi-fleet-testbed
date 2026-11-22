import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productRationalRecursive } from './productRationalRecursive.js'

/**
 * Independent reference implementation using naive sequential BigInt
 * multiplication of all numerators and all denominators, followed by a single
 * final Euclidean GCD reduction.
 */
function naiveSequentialProduct(factors) {
	let num = 1n
	let den = 1n
	for (const { num: n, den: d } of factors) {
		num *= n
		den *= d
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den < 0n) {
		num = -num
		den = -den
	}
	let a = num < 0n ? -num : num
	let b = den
	while (b !== 0n) {
		const t = a % b
		a = b
		b = t
	}
	return { num: num / a, den: den / a }
}

describe('productRationalRecursive', () => {
	test('empty product returns multiplicative identity 1/1', () => {
		assert.deepStrictEqual(productRationalRecursive([]), { num: 1n, den: 1n })
	})

	test('single-element inputs are normalized to lowest terms with den > 0n', () => {
		assert.deepStrictEqual(productRationalRecursive([{ num: 3n, den: 7n }]), { num: 3n, den: 7n })
		assert.deepStrictEqual(productRationalRecursive([{ num: 12n, den: 18n }]), { num: 2n, den: 3n })
		assert.deepStrictEqual(productRationalRecursive([{ num: -6n, den: 9n }]), { num: -2n, den: 3n })
		assert.deepStrictEqual(productRationalRecursive([{ num: 6n, den: -9n }]), { num: -2n, den: 3n })
		assert.deepStrictEqual(productRationalRecursive([{ num: -6n, den: -9n }]), { num: 2n, den: 3n })
		assert.deepStrictEqual(productRationalRecursive([{ num: 0n, den: -5n }]), { num: 0n, den: 1n })
	})

	test('normal products across even, odd, and power-of-two lengths', () => {
		assert.deepStrictEqual(
			productRationalRecursive([
				{ num: 2n, den: 3n },
				{ num: 3n, den: 5n },
			]),
			{ num: 2n, den: 5n },
		)
		assert.deepStrictEqual(
			productRationalRecursive([
				{ num: 2n, den: 3n },
				{ num: 9n, den: 4n },
				{ num: 5n, den: 7n },
			]),
			{ num: 15n, den: 14n },
		)
		assert.deepStrictEqual(
			productRationalRecursive([
				{ num: 1n, den: 2n },
				{ num: 2n, den: 3n },
				{ num: 3n, den: 4n },
				{ num: 4n, den: 5n },
			]),
			{ num: 1n, den: 5n },
		)
		assert.deepStrictEqual(
			productRationalRecursive([
				{ num: 7n, den: 11n },
				{ num: 13n, den: 17n },
				{ num: 19n, den: 23n },
				{ num: 29n, den: 31n },
				{ num: 37n, den: 41n },
			]),
			{ num: 7n * 13n * 19n * 29n * 37n, den: 11n * 17n * 23n * 31n * 41n },
		)
	})

	test('zero factors always yield canonical 0/1', () => {
		assert.deepStrictEqual(
			productRationalRecursive([
				{ num: 0n, den: 7n },
				{ num: 5n, den: 3n },
				{ num: -4n, den: 9n },
			]),
			{ num: 0n, den: 1n },
		)
		assert.deepStrictEqual(
			productRationalRecursive([
				{ num: 5n, den: 3n },
				{ num: 0n, den: -11n },
				{ num: 8n, den: 9n },
			]),
			{ num: 0n, den: 1n },
		)
		assert.deepStrictEqual(
			productRationalRecursive([
				{ num: 5n, den: 3n },
				{ num: -8n, den: 9n },
				{ num: 0n, den: 1n },
			]),
			{ num: 0n, den: 1n },
		)
	})

	test('negative factors preserve sign and keep den > 0n', () => {
		// Odd number of negative factors -> negative result
		assert.deepStrictEqual(
			productRationalRecursive([
				{ num: -2n, den: 3n },
				{ num: 5n, den: -7n },
				{ num: -3n, den: 5n },
			]),
			{ num: -2n, den: 7n },
		)
		// Even number of negative factors -> positive result
		assert.deepStrictEqual(
			productRationalRecursive([
				{ num: -2n, den: 3n },
				{ num: 5n, den: -7n },
				{ num: -3n, den: 5n },
				{ num: 14n, den: -1n },
			]),
			{ num: 4n, den: 1n },
		)
		// Negatives cancelling within the same fraction
		assert.deepStrictEqual(
			productRationalRecursive([
				{ num: -4n, den: -6n },
				{ num: -9n, den: -10n },
			]),
			{ num: 3n, den: 5n },
		)
	})

	test('unreduced inputs with large common factors', () => {
		const scale = 10n ** 30n
		const factors = [
			{ num: 14n * scale, den: 21n * scale },
			{ num: -33n * scale, den: 44n * scale },
			{ num: 25n * scale, den: -15n * scale },
		]
		// (2/3) * (-3/4) * (-5/3) = 5/6
		assert.deepStrictEqual(productRationalRecursive(factors), { num: 5n, den: 6n })
	})

	test('telescoping products cross-checked against closed forms', () => {
		// Product_{k=1..N} k / (k + 1) = 1 / (N + 1)
		const n1 = 500
		const linearTelescoping = Array.from({ length: n1 }, (_, i) => {
			const k = BigInt(i + 1)
			return { num: k, den: k + 1n }
		})
		assert.deepStrictEqual(productRationalRecursive(linearTelescoping), {
			num: 1n,
			den: BigInt(n1 + 1),
		})

		// Product_{k=2..N} (k^2 - 1) / k^2 = (N + 1) / (2 * N)
		const n2 = 250
		const quadraticTelescoping = Array.from({ length: n2 - 1 }, (_, i) => {
			const k = BigInt(i + 2)
			return { num: k * k - 1n, den: k * k }
		})
		// (250 + 1) / (2 * 250) = 251 / 500 (already in lowest terms since 251 is prime)
		assert.deepStrictEqual(productRationalRecursive(quadraticTelescoping), {
			num: 251n,
			den: 500n,
		})

		// Even N+1 case where closed form itself reduces: N = 251 -> 252 / 502 = 126 / 251
		const n3 = 251
		const quadraticTelescopingEven = Array.from({ length: n3 - 1 }, (_, i) => {
			const k = BigInt(i + 2)
			return { num: k * k - 1n, den: k * k }
		})
		assert.deepStrictEqual(productRationalRecursive(quadraticTelescopingEven), {
			num: 126n,
			den: 251n,
		})
	})

	test('cross-check against independent direct sequential BigInt multiplication', () => {
		// Deterministic pseudo-random sequence of unreduced, signed, and >64-bit rationals
		const factors = []
		let seed = 0x123456789abcdef1n
		const mod = 1n << 64n
		for (let i = 0; i < 65; i++) {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) % mod
			const rawNum = (seed % 1000003n) + 1n
			seed = (seed * 6364136223846793005n + 1442695040888963407n) % mod
			const rawDen = (seed % 1000033n) + 1n
			const common = BigInt((i % 17) + 1)
			const numSign = i % 3 === 0 ? -1n : 1n
			const denSign = i % 5 === 0 ? -1n : 1n
			factors.push({
				num: numSign * rawNum * common,
				den: denSign * rawDen * common,
			})
		}

		const expected = naiveSequentialProduct(factors)
		const actual = productRationalRecursive(factors)
		assert.deepStrictEqual(actual, expected)
		assert.ok(actual.den > 0n)

		// Commutativity check: reversed order yields identical result
		const reversed = [...factors].reverse()
		assert.deepStrictEqual(productRationalRecursive(reversed), expected)
	})

	test('does not mutate input array or element objects', () => {
		const original = [
			Object.freeze({ num: -4n, den: -6n }),
			Object.freeze({ num: 9n, den: -12n }),
		]
		Object.freeze(original)
		assert.deepStrictEqual(productRationalRecursive(original), { num: -1n, den: 2n })
	})

	test('invalid inputs throw descriptive TypeError or RangeError', () => {
		// Non-array inputs
		for (const bad of [null, undefined, 42, '1/2', {}, new Set()]) {
			assert.throws(() => productRationalRecursive(bad), TypeError)
		}

		// Invalid element types and sparse arrays
		assert.throws(() => productRationalRecursive([null]), TypeError)
		assert.throws(() => productRationalRecursive([undefined]), TypeError)
		assert.throws(() => productRationalRecursive([1n]), TypeError)
		assert.throws(() => productRationalRecursive(['1/2']), TypeError)
		assert.throws(() => productRationalRecursive(new Array(2)), TypeError)

		// Non-BigInt num or den
		assert.throws(() => productRationalRecursive([{ num: 1, den: 2n }]), TypeError)
		assert.throws(() => productRationalRecursive([{ num: 1n, den: 2 }]), TypeError)
		assert.throws(() => productRationalRecursive([{ num: '1', den: 2n }]), TypeError)
		assert.throws(() => productRationalRecursive([{ num: 1n }]), TypeError)
		assert.throws(() => productRationalRecursive([{ den: 2n }]), TypeError)

		// Zero denominator
		assert.throws(() => productRationalRecursive([{ num: 1n, den: 0n }]), RangeError)
		assert.throws(() => productRationalRecursive([{ num: 0n, den: 0n }]), RangeError)

		// Invalid element after a zero factor must still be rejected
		assert.throws(
			() =>
				productRationalRecursive([
					{ num: 0n, den: 1n },
					{ num: 1n, den: 0n },
				]),
			RangeError,
		)
		assert.throws(
			() =>
				productRationalRecursive([
					{ num: 0n, den: 1n },
					null,
				]),
			TypeError,
		)
	})
})
