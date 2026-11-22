import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { productRationalIterative } from './productRationalIterative.js'

/**
 * Independent reference implementation: multiplies all numerators and
 * denominators directly without intermediate reduction, then reduces once.
 */
function naiveProduct(values) {
	let num = 1n
	let den = 1n
	for (const { num: n, den: d } of values) {
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
	let x = num < 0n ? -num : num
	let y = den
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return { num: num / x, den: den / x }
}

function factorial(n) {
	let result = 1n
	for (let k = 2n; k <= n; k++) {
		result *= k
	}
	return result
}

describe('productRationalIterative', () => {
	it('returns multiplicative identity 1/1 for an empty array', () => {
		assert.deepEqual(productRationalIterative([]), { num: 1n, den: 1n })
	})

	it('handles single-element arrays and normalizes sign and reduction', () => {
		assert.deepEqual(productRationalIterative([{ num: 3n, den: 7n }]), {
			num: 3n,
			den: 7n
		})
		assert.deepEqual(productRationalIterative([{ num: -3n, den: 7n }]), {
			num: -3n,
			den: 7n
		})
		assert.deepEqual(productRationalIterative([{ num: 3n, den: -7n }]), {
			num: -3n,
			den: 7n
		})
		assert.deepEqual(productRationalIterative([{ num: -12n, den: -18n }]), {
			num: 2n,
			den: 3n
		})
		assert.deepEqual(productRationalIterative([{ num: 0n, den: -9n }]), {
			num: 0n,
			den: 1n
		})
	})

	it('returns 0/1 whenever any factor is zero', () => {
		assert.deepEqual(
			productRationalIterative([
				{ num: 0n, den: 5n },
				{ num: 7n, den: 11n },
				{ num: -3n, den: 2n }
			]),
			{ num: 0n, den: 1n }
		)
		assert.deepEqual(
			productRationalIterative([
				{ num: 7n, den: 11n },
				{ num: 0n, den: -4n },
				{ num: 13n, den: 17n }
			]),
			{ num: 0n, den: 1n }
		)
		assert.deepEqual(
			productRationalIterative([
				{ num: 7n, den: 11n },
				{ num: -3n, den: 2n },
				{ num: 0n, den: 1n }
			]),
			{ num: 0n, den: 1n }
		)
	})

	it('handles negative factors with odd and even parity', () => {
		assert.deepEqual(
			productRationalIterative([
				{ num: -2n, den: 3n },
				{ num: 5n, den: -7n }
			]),
			{ num: 10n, den: 21n }
		)
		assert.deepEqual(
			productRationalIterative([
				{ num: -2n, den: 3n },
				{ num: -5n, den: 7n },
				{ num: 11n, den: -13n }
			]),
			{ num: -110n, den: 273n }
		)
	})

	it('handles canceling fractions and unreduced inputs', () => {
		assert.deepEqual(
			productRationalIterative([
				{ num: 2n, den: 3n },
				{ num: 3n, den: 5n },
				{ num: 5n, den: 7n },
				{ num: 7n, den: 2n }
			]),
			{ num: 1n, den: 1n }
		)

		assert.deepEqual(
			productRationalIterative([
				{ num: 100n, den: 250n }, // 2/5
				{ num: -45n, den: 36n }, // -5/4
				{ num: 24n, den: -18n } // -4/3
			]),
			{ num: 2n, den: 3n }
		)

		// Large common factors that reduce cleanly
		const big = 10n ** 30n
		assert.deepEqual(
			productRationalIterative([
				{ num: 3n * big, den: 4n * big },
				{ num: 8n * big, den: 9n * big }
			]),
			{ num: 2n, den: 3n }
		)
	})

	it('does not mutate the input array or its rational objects', () => {
		const a = Object.freeze({ num: -6n, den: -9n })
		const b = Object.freeze({ num: 15n, den: -10n })
		const values = Object.freeze([a, b])
		const result = productRationalIterative(values)
		assert.deepEqual(result, { num: -1n, den: 1n })
		assert.deepEqual(a, { num: -6n, den: -9n })
		assert.deepEqual(b, { num: 15n, den: -10n })
	})

	it('throws TypeError or RangeError on invalid inputs', () => {
		// Non-array inputs
		for (const bad of [null, undefined, 42, '1/2', { num: 1n, den: 1n }, new Set()]) {
			assert.throws(() => productRationalIterative(bad), TypeError)
		}

		// Invalid elements
		assert.throws(() => productRationalIterative([null]), TypeError)
		assert.throws(() => productRationalIterative([undefined]), TypeError)
		assert.throws(() => productRationalIterative([1]), TypeError)
		assert.throws(() => productRationalIterative([[1n, 2n]]), TypeError)
		assert.throws(() => productRationalIterative([{ num: 1, den: 2n }]), TypeError)
		assert.throws(() => productRationalIterative([{ num: 1n, den: 2 }]), TypeError)
		assert.throws(() => productRationalIterative([{ num: '1', den: '2' }]), TypeError)
		assert.throws(() => productRationalIterative([{ num: 1n }]), TypeError)

		// Sparse array hole
		const sparse = [{ num: 1n, den: 2n }]
		sparse.length = 2
		assert.throws(() => productRationalIterative(sparse), TypeError)

		// Zero denominator
		assert.throws(() => productRationalIterative([{ num: 1n, den: 0n }]), RangeError)
		assert.throws(() => productRationalIterative([{ num: 0n, den: 0n }]), RangeError)
	})

	it('validates all elements even after encountering a zero factor', () => {
		assert.throws(
			() =>
				productRationalIterative([
					{ num: 0n, den: 1n },
					{ num: 1n, den: 0n }
				]),
			RangeError
		)
		assert.throws(
			() =>
				productRationalIterative([
					{ num: 0n, den: 1n },
					{ num: 1, den: 2n }
				]),
			TypeError
		)
		assert.throws(
			() =>
				productRationalIterative([
					{ num: 2n, den: 3n },
					{ num: 0n, den: 5n },
					null
				]),
			TypeError
		)
	})

	it('cross-check: telescoping product prod_{k=1}^{n} (k / (k+1)) === 1 / (n+1)', () => {
		for (const n of [1, 10, 100, 1000]) {
			const factors = []
			for (let k = 1; k <= n; k++) {
				factors.push({ num: BigInt(k), den: BigInt(k + 1) })
			}
			assert.deepEqual(productRationalIterative(factors), {
				num: 1n,
				den: BigInt(n + 1)
			})
		}
	})

	it('cross-check: telescoping identity prod_{k=2}^{n} ((k^2 - 1) / k^2) === (n+1) / (2n)', () => {
		for (const n of [2, 5, 25, 200]) {
			const factors = []
			for (let k = 2n; k <= BigInt(n); k++) {
				factors.push({ num: k * k - 1n, den: k * k })
			}
			const expected = naiveProduct([{ num: BigInt(n + 1), den: BigInt(2 * n) }])
			assert.deepEqual(productRationalIterative(factors), expected)
		}
	})

	it('cross-check: Wallis partial product and double-factorial identities', () => {
		// Identity 1: prod_{k=1}^{n} (2k-1)/(2k) = (2n)! / (2^n * n!)^2
		for (const n of [1n, 5n, 12n, 20n]) {
			const factors = []
			for (let k = 1n; k <= n; k++) {
				factors.push({ num: 2n * k - 1n, den: 2n * k })
			}
			const twoPowN = 1n << n
			const factN = factorial(n)
			const expected = naiveProduct([
				{ num: factorial(2n * n), den: (twoPowN * factN) ** 2n }
			])
			assert.deepEqual(productRationalIterative(factors), expected)
		}

		// Identity 2: Wallis partial product
		// W_n = prod_{k=1}^{n} (2k/(2k-1)) * (2k/(2k+1)) = (2^n * n!)^4 / (((2n)!)^2 * (2n+1))
		for (const n of [1n, 4n, 10n, 15n]) {
			const factors = []
			for (let k = 1n; k <= n; k++) {
				factors.push({ num: 2n * k, den: 2n * k - 1n })
				factors.push({ num: 2n * k, den: 2n * k + 1n })
			}
			const twoPowN = 1n << n
			const factN = factorial(n)
			const fact2N = factorial(2n * n)
			const expected = naiveProduct([
				{
					num: (twoPowN * factN) ** 4n,
					den: fact2N * fact2N * (2n * n + 1n)
				}
			])
			const actual = productRationalIterative(factors)
			assert.deepEqual(actual, expected)
			// Sanity check: W_n approaches pi/2 from below as n grows
			const approx = Number(actual.num) / Number(actual.den)
			assert.ok(approx > 1.3 && approx < Math.PI / 2)
		}
	})

	it('cross-check: matches naive big-product reduction on deterministic pseudo-random inputs', () => {
		let seed = 0x12345678n
		const nextInt = () => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
			return Number((seed >> 33n) % 201n) - 100 // [-100, 100]
		}

		for (let trial = 0; trial < 25; trial++) {
			const len = (trial % 15) + 1
			const factors = []
			for (let i = 0; i < len; i++) {
				const num = BigInt(nextInt())
				let den = BigInt(nextInt())
				if (den === 0n) den = 1n
				factors.push({ num, den })
			}
			assert.deepEqual(
				productRationalIterative(factors),
				naiveProduct(factors)
			)
		}
	})
})
