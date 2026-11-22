import { test } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsRationalIterative } from './combinationsRationalIterative.js'

const rat = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function factorialBigInt(n) {
	let acc = 1n
	for (let i = 2n; i <= n; i += 1n) {
		acc *= i
	}
	return acc
}

test('basic and boundary combination values', () => {
	assert.deepEqual(combinationsRationalIterative(rat(0), rat(0)), { num: 1n, den: 1n })
	assert.deepEqual(combinationsRationalIterative(rat(5), rat(0)), { num: 1n, den: 1n })
	assert.deepEqual(combinationsRationalIterative(rat(5), rat(1)), { num: 5n, den: 1n })
	assert.deepEqual(combinationsRationalIterative(rat(5), rat(2)), { num: 10n, den: 1n })
	assert.deepEqual(combinationsRationalIterative(rat(5), rat(3)), { num: 10n, den: 1n })
	assert.deepEqual(combinationsRationalIterative(rat(5), rat(5)), { num: 1n, den: 1n })
	assert.deepEqual(combinationsRationalIterative(rat(3), rat(5)), { num: 0n, den: 1n })
	assert.deepEqual(combinationsRationalIterative(rat(0), rat(1)), { num: 0n, den: 1n })
})

test('unreduced and negative-denominator integer rationals are accepted and normalized', () => {
	const nInput = { num: 10n, den: 2n }
	const kInput = { num: 6n, den: 3n }
	assert.deepEqual(combinationsRationalIterative(nInput, kInput), { num: 10n, den: 1n })
	// Verify inputs were not mutated
	assert.deepEqual(nInput, { num: 10n, den: 2n })
	assert.deepEqual(kInput, { num: 6n, den: 3n })

	assert.deepEqual(
		combinationsRationalIterative({ num: -15n, den: -3n }, { num: -8n, den: -4n }),
		{ num: 10n, den: 1n }
	)
	assert.deepEqual(
		combinationsRationalIterative({ num: 0n, den: 7n }, { num: 0n, den: -9n }),
		{ num: 1n, den: 1n }
	)
	assert.deepEqual(
		combinationsRationalIterative({ num: 12n, den: 4n }, { num: 25n, den: 5n }),
		{ num: 0n, den: 1n }
	)
})

test('large binomial coefficients and symmetry efficiency', () => {
	assert.deepEqual(
		combinationsRationalIterative(rat(50), rat(25)),
		{ num: 126410606437752n, den: 1n }
	)

	// Cross-check large values against direct BigInt factorial definition
	for (const [n, k] of [
		[50n, 25n],
		[60n, 20n],
		[100n, 37n],
		[100n, 50n]
	]) {
		const expected = factorialBigInt(n) / (factorialBigInt(k) * factorialBigInt(n - k))
		assert.deepEqual(
			combinationsRationalIterative({ num: n, den: 1n }, { num: k, den: 1n }),
			{ num: expected, den: 1n }
		)
	}

	// Large n with k close to n relies on symmetry m = min(k, n - k)
	const nBig = 1_000_000n
	const expectedC2 = (nBig * (nBig - 1n)) / 2n
	assert.deepEqual(
		combinationsRationalIterative({ num: nBig, den: 1n }, { num: 2n, den: 1n }),
		{ num: expectedC2, den: 1n }
	)
	assert.deepEqual(
		combinationsRationalIterative({ num: nBig, den: 1n }, { num: nBig - 2n, den: 1n }),
		{ num: expectedC2, den: 1n }
	)
})

test('cross-check against Pascal triangle, Pascal identity, symmetry, and binomial sum', () => {
	const maxN = 18

	// Build Pascal's triangle independently using only addition
	const pascal = []
	for (let n = 0; n <= maxN; n += 1) {
		const row = new Array(n + 1).fill(1n)
		for (let k = 1; k < n; k += 1) {
			row[k] = pascal[n - 1][k - 1] + pascal[n - 1][k]
		}
		pascal.push(row)
	}

	for (let n = 0; n <= maxN; n += 1) {
		let rowSum = 0n
		for (let k = 0; k <= n; k += 1) {
			const res = combinationsRationalIterative(rat(n), rat(k))
			assert.equal(res.den, 1n)
			assert.equal(res.num, pascal[n][k])

			// Symmetry: C(n, k) === C(n, n - k)
			const sym = combinationsRationalIterative(rat(n), rat(n - k))
			assert.deepEqual(res, sym)

			// Pascal's identity: C(n, k) === C(n - 1, k - 1) + C(n - 1, k)
			if (n >= 1 && k >= 1) {
				const left = combinationsRationalIterative(rat(n - 1), rat(k - 1))
				const right = combinationsRationalIterative(rat(n - 1), rat(k))
				assert.equal(res.num, left.num + right.num)
			}

			rowSum += res.num
		}

		// Binomial sum: sum_{k=0}^{n} C(n, k) === 2^n
		assert.equal(rowSum, 1n << BigInt(n))
	}
})

test('invalid input types throw TypeError', () => {
	const badTypes = [
		null,
		undefined,
		5,
		5n,
		'5/1',
		[5n, 1n],
		{},
		{ num: 5, den: 1n },
		{ num: 5n, den: 1 },
		{ num: '5', den: '1' },
		{ num: 5n },
		{ den: 1n }
	]

	for (const bad of badTypes) {
		assert.throws(() => combinationsRationalIterative(bad, rat(2)), TypeError)
		assert.throws(() => combinationsRationalIterative(rat(5), bad), TypeError)
	}
})

test('invalid rational domain values throw RangeError', () => {
	const badDomain = [
		{ num: 5n, den: 0n },
		{ num: 0n, den: 0n },
		{ num: 5n, den: 2n },
		{ num: 1n, den: 3n },
		{ num: -7n, den: -2n },
		{ num: -1n, den: 1n },
		{ num: 5n, den: -1n },
		{ num: -10n, den: 2n }
	]

	for (const bad of badDomain) {
		assert.throws(() => combinationsRationalIterative(bad, rat(2)), RangeError)
		assert.throws(() => combinationsRationalIterative(rat(5), bad), RangeError)
	}
})
