import { describe, test } from 'node:test'
import assert from 'node:assert'
import { combinationsRationalIterative } from './combinationsRationalIterative.js'

const rat = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function factorial(n) {
	let acc = 1n
	for (let i = 2n; i <= n; i++) {
		acc *= i
	}
	return acc
}

function combinationsViaFactorial(n, k) {
	if (k > n) return 0n
	return factorial(n) / (factorial(k) * factorial(n - k))
}

describe('combinationsRationalIterative', () => {
	test('computes standard combinations accurately in lowest terms', () => {
		const cases = [
			[1, 0, 1n],
			[1, 1, 1n],
			[5, 2, 10n],
			[6, 3, 20n],
			[10, 3, 120n],
			[10, 5, 252n],
			[20, 10, 184756n],
			[30, 15, 155117520n],
		]

		for (const [n, k, expected] of cases) {
			const res = combinationsRationalIterative(rat(n), rat(k))
			assert.deepStrictEqual(res, { num: expected, den: 1n })
			assert.strictEqual(typeof res.num, 'bigint')
			assert.strictEqual(typeof res.den, 'bigint')
		}
	})

	test('handles edge cases k=0, k=n, and k>n', () => {
		// k = 0
		assert.deepStrictEqual(combinationsRationalIterative(rat(0), rat(0)), { num: 1n, den: 1n })
		assert.deepStrictEqual(combinationsRationalIterative(rat(7), rat(0)), { num: 1n, den: 1n })
		assert.deepStrictEqual(combinationsRationalIterative(rat(1000000), rat(0)), { num: 1n, den: 1n })

		// k = n
		assert.deepStrictEqual(combinationsRationalIterative(rat(1), rat(1)), { num: 1n, den: 1n })
		assert.deepStrictEqual(combinationsRationalIterative(rat(17), rat(17)), { num: 1n, den: 1n })
		assert.deepStrictEqual(combinationsRationalIterative(rat(1000000), rat(1000000)), { num: 1n, den: 1n })

		// k > n
		assert.deepStrictEqual(combinationsRationalIterative(rat(0), rat(1)), { num: 0n, den: 1n })
		assert.deepStrictEqual(combinationsRationalIterative(rat(5), rat(6)), { num: 0n, den: 1n })
		assert.deepStrictEqual(combinationsRationalIterative(rat(10), rat(100)), { num: 0n, den: 1n })
	})

	test('satisfies symmetry C(n, k) = C(n, n - k)', () => {
		for (let n = 0; n <= 18; n++) {
			for (let k = 0; k <= n; k++) {
				assert.deepStrictEqual(
					combinationsRationalIterative(rat(n), rat(k)),
					combinationsRationalIterative(rat(n), rat(n - k)),
				)
			}
		}

		assert.deepStrictEqual(
			combinationsRationalIterative(rat(100), rat(37)),
			combinationsRationalIterative(rat(100), rat(63)),
		)
		assert.deepStrictEqual(
			combinationsRationalIterative(rat(1000000), rat(3)),
			combinationsRationalIterative(rat(1000000), rat(999997)),
		)
	})

	test('handles large n with exact BigInt precision', () => {
		// C(100, 50)
		assert.deepStrictEqual(
			combinationsRationalIterative(rat(100), rat(50)),
			{ num: 100891344545564193334812497256n, den: 1n },
		)

		// C(200, 100) cross-checked against direct factorials
		assert.deepStrictEqual(
			combinationsRationalIterative(rat(200), rat(100)),
			{ num: combinationsViaFactorial(200n, 100n), den: 1n },
		)

		// Very large n with small k and n - k
		const bigN = 10n ** 18n
		const expectedPair = (bigN * (bigN - 1n)) / 2n
		assert.deepStrictEqual(
			combinationsRationalIterative({ num: bigN, den: 1n }, { num: 2n, den: 1n }),
			{ num: expectedPair, den: 1n },
		)
		assert.deepStrictEqual(
			combinationsRationalIterative({ num: bigN, den: 1n }, { num: bigN - 2n, den: 1n }),
			{ num: expectedPair, den: 1n },
		)
	})

	test('accepts unreduced rationals and negative-denominator equivalents without mutating inputs', () => {
		const nInput = { num: 20n, den: 4n }
		const kInput = { num: -9n, den: -3n }
		assert.deepStrictEqual(combinationsRationalIterative(nInput, kInput), { num: 10n, den: 1n })
		assert.deepStrictEqual(nInput, { num: 20n, den: 4n })
		assert.deepStrictEqual(kInput, { num: -9n, den: -3n })

		// Zero represented with various non-zero denominators
		assert.deepStrictEqual(
			combinationsRationalIterative({ num: 0n, den: 7n }, { num: 0n, den: -5n }),
			{ num: 1n, den: 1n },
		)
		assert.deepStrictEqual(
			combinationsRationalIterative({ num: -18n, den: -3n }, { num: 0n, den: -9n }),
			{ num: 1n, den: 1n },
		)

		// k > n with unreduced inputs
		assert.deepStrictEqual(
			combinationsRationalIterative({ num: 12n, den: 4n }, { num: -25n, den: -5n }),
			{ num: 0n, den: 1n },
		)
	})

	test('rejects invalid inputs with appropriate errors', () => {
		// Type errors: non-objects, arrays, missing or non-BigInt fields
		const badTypeInputs = [
			undefined,
			null,
			5,
			5n,
			'5/1',
			true,
			[5n, 1n],
			{},
			{ num: 5, den: 1n },
			{ num: 5n, den: 1 },
			{ num: '5', den: '1' },
			{ num: 5n },
			{ den: 1n },
		]

		for (const bad of badTypeInputs) {
			assert.throws(() => combinationsRationalIterative(bad, rat(1)), TypeError)
			assert.throws(() => combinationsRationalIterative(rat(5), bad), TypeError)
		}

		// Range errors: zero denominator
		assert.throws(() => combinationsRationalIterative({ num: 5n, den: 0n }, rat(2)), RangeError)
		assert.throws(() => combinationsRationalIterative(rat(5), { num: 0n, den: 0n }), RangeError)

		// Range errors: non-integer rationals
		assert.throws(() => combinationsRationalIterative({ num: 5n, den: 2n }, rat(2)), RangeError)
		assert.throws(() => combinationsRationalIterative(rat(5), { num: 7n, den: 3n }), RangeError)
		assert.throws(() => combinationsRationalIterative({ num: 3n, den: -2n }, rat(1)), RangeError)

		// Range errors: negative integer rationals
		assert.throws(() => combinationsRationalIterative({ num: -1n, den: 1n }, rat(0)), RangeError)
		assert.throws(() => combinationsRationalIterative(rat(5), { num: -1n, den: 1n }), RangeError)
		assert.throws(() => combinationsRationalIterative({ num: -6n, den: 2n }, rat(1)), RangeError)
		assert.throws(() => combinationsRationalIterative(rat(5), { num: 6n, den: -2n }), RangeError)
	})

	test('cross-check: satisfies Pascal identity C(n, k) = C(n-1, k-1) + C(n-1, k)', () => {
		for (let n = 1; n <= 20; n++) {
			for (let k = 1; k <= n; k++) {
				const lhs = combinationsRationalIterative(rat(n), rat(k))
				const left = combinationsRationalIterative(rat(n - 1), rat(k - 1))
				const right = combinationsRationalIterative(rat(n - 1), rat(k))
				assert.strictEqual(lhs.den, 1n)
				assert.strictEqual(lhs.num, left.num + right.num)
			}
		}
	})

	test('cross-check: row sum equals 2^n for n = 0..25', () => {
		for (let n = 0; n <= 25; n++) {
			let rowSum = 0n
			for (let k = 0; k <= n; k++) {
				const c = combinationsRationalIterative(rat(n), rat(k))
				assert.strictEqual(c.den, 1n)
				rowSum += c.num
			}
			assert.strictEqual(rowSum, 1n << BigInt(n))
		}
	})

	test('cross-check: matches factorial definition and hockey-stick identity', () => {
		for (let n = 0; n <= 15; n++) {
			for (let k = 0; k <= n; k++) {
				const res = combinationsRationalIterative(rat(n), rat(k))
				assert.deepStrictEqual(res, { num: combinationsViaFactorial(BigInt(n), BigInt(k)), den: 1n })
			}
		}

		// Hockey-stick identity: sum_{i=r}^{n} C(i, r) = C(n + 1, r + 1)
		for (let r = 0; r <= 10; r++) {
			for (let n = r; n <= 18; n++) {
				let sum = 0n
				for (let i = r; i <= n; i++) {
					sum += combinationsRationalIterative(rat(i), rat(r)).num
				}
				const expected = combinationsRationalIterative(rat(n + 1), rat(r + 1))
				assert.strictEqual(sum, expected.num)
			}
		}
	})
})
