import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsRationalStable } from './permutationsRationalStable.js'

/**
 * Helper to construct a rational literal concisely in tests.
 *
 * @param {bigint} num
 * @param {bigint} [den=1n]
 * @returns {{ num: bigint, den: bigint }}
 */
function rat(num, den = 1n) {
	return { num, den }
}

/**
 * Independent reference: factorial n! for non-negative BigInt n.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function factorial(n) {
	let acc = 1n
	for (let i = 2n; i <= n; i++) {
		acc *= i
	}
	return acc
}

/**
 * Independent reference: gcd for BigInt.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function refGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Independent reference: naive iterative rational product for P(n, k).
 *
 * @param {{ num: bigint, den: bigint }} n
 * @param {bigint} k
 * @returns {{ num: bigint, den: bigint }}
 */
function naiveFallingFactorialRational(n, k) {
	let num = 1n
	let den = 1n
	for (let i = 0n; i < k; i++) {
		// n - i = (n.num - i * n.den) / n.den
		num *= n.num - i * n.den
		den *= n.den
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = refGcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Asserts that a rational result is strictly in canonical lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} r
 */
function assertCanonical(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(refGcd(r.num, r.den), 1n)
	}
}

describe('permutationsRationalStable', () => {
	test('normal integer cases: P(5,3), P(10,0), P(5,5), P(1,1)', () => {
		assert.deepEqual(permutationsRationalStable(rat(5n), rat(3n)), rat(60n, 1n))
		assert.deepEqual(permutationsRationalStable(rat(10n), rat(0n)), rat(1n, 1n))
		assert.deepEqual(permutationsRationalStable(rat(5n), rat(5n)), rat(120n, 1n))
		assert.deepEqual(permutationsRationalStable(rat(1n), rat(1n)), rat(1n, 1n))
	})

	test('large integer permutation P(100, 20) matches exact value and n!/(n-k)!', () => {
		const res = permutationsRationalStable(rat(100n), rat(20n))
		assertCanonical(res)
		const expected = factorial(100n) / factorial(80n)
		assert.deepEqual(res, rat(expected, 1n))
		assert.equal(res.num, 1303995018204712451095685346159820800000n)
	})

	test('rational falling factorial P(5/2, 3) and other fractional bases', () => {
		// (5/2) * (3/2) * (1/2) = 15/8
		const p1 = permutationsRationalStable(rat(5n, 2n), rat(3n))
		assertCanonical(p1)
		assert.deepEqual(p1, rat(15n, 8n))

		// (1/2) * (-1/2) * (-3/2) = 3/8
		const p2 = permutationsRationalStable(rat(1n, 2n), rat(3n))
		assertCanonical(p2)
		assert.deepEqual(p2, rat(3n, 8n))

		// (-1/3) * (-4/3) * (-7/3) * (-10/3) = 280/81
		const p3 = permutationsRationalStable(rat(-1n, 3n), rat(4n))
		assertCanonical(p3)
		assert.deepEqual(p3, rat(280n, 81n))
	})

	test('negative integer base computes falling factorial without zeroing', () => {
		// (-3) * (-4) * (-5) = -60
		assert.deepEqual(permutationsRationalStable(rat(-3n), rat(3n)), rat(-60n, 1n))
		// (-1) * (-2) * (-3) * (-4) = 24
		assert.deepEqual(permutationsRationalStable(rat(-1n), rat(4n)), rat(24n, 1n))
	})

	test('edge cases: k=0 -> 1/1, k>n for non-negative integer n -> 0/1', () => {
		assert.deepEqual(permutationsRationalStable(rat(0n), rat(0n)), rat(1n, 1n))
		assert.deepEqual(permutationsRationalStable(rat(-7n, 3n), rat(0n)), rat(1n, 1n))
		assert.deepEqual(permutationsRationalStable(rat(0n), rat(1n)), rat(0n, 1n))
		assert.deepEqual(permutationsRationalStable(rat(5n), rat(6n)), rat(0n, 1n))
		// Short-circuit handles huge k > n instantaneously
		assert.deepEqual(permutationsRationalStable(rat(5n), rat(1000000000n)), rat(0n, 1n))
	})

	test('unreduced and negative-denominator inputs normalize properly', () => {
		// n = -10/-4 = 5/2, k = 6/2 = 3 -> 15/8
		const res1 = permutationsRationalStable(rat(-10n, -4n), rat(6n, 2n))
		assertCanonical(res1)
		assert.deepEqual(res1, rat(15n, 8n))

		// n = 15/3 = 5, k = -9/-3 = 3 -> 60/1
		const res2 = permutationsRationalStable(rat(15n, 3n), rat(-9n, -3n))
		assertCanonical(res2)
		assert.deepEqual(res2, rat(60n, 1n))

		// n = 0/-7 = 0, k = 0/-5 = 0 -> 1/1
		const res3 = permutationsRationalStable(rat(0n, -7n), rat(0n, -5n))
		assertCanonical(res3)
		assert.deepEqual(res3, rat(1n, 1n))

		// n = 10/-2 = -5, k = 4/2 = 2 -> (-5)*(-6) = 30/1
		const res4 = permutationsRationalStable(rat(10n, -2n), rat(4n, 2n))
		assertCanonical(res4)
		assert.deepEqual(res4, rat(30n, 1n))
	})

	test('input validation rejects invalid rationals, negative k, and non-integer k', () => {
		// Negative k
		assert.throws(() => permutationsRationalStable(rat(5n), rat(-1n)), RangeError)
		assert.throws(() => permutationsRationalStable(rat(5n), rat(6n, -2n)), RangeError)

		// Non-integer k
		assert.throws(() => permutationsRationalStable(rat(5n), rat(3n, 2n)), RangeError)
		assert.throws(() => permutationsRationalStable(rat(5n, 2n), rat(1n, 3n)), RangeError)

		// Zero denominator
		assert.throws(() => permutationsRationalStable(rat(5n, 0n), rat(2n)), RangeError)
		assert.throws(() => permutationsRationalStable(rat(5n), rat(2n, 0n)), RangeError)

		// Invalid types / shapes
		assert.throws(() => permutationsRationalStable(null, rat(2n)), TypeError)
		assert.throws(() => permutationsRationalStable(rat(5n), undefined), TypeError)
		assert.throws(() => permutationsRationalStable(5, rat(2n)), TypeError)
		assert.throws(() => permutationsRationalStable(rat(5n), 2), TypeError)
		assert.throws(() => permutationsRationalStable([5n, 1n], rat(2n)), TypeError)
		assert.throws(() => permutationsRationalStable({ num: 5, den: 1n }, rat(2n)), TypeError)
		assert.throws(() => permutationsRationalStable(rat(5n), { num: 2n, den: 1 }), TypeError)
	})

	test('cross-check against n! / (n - k)! across integer grid', () => {
		for (let n = 0n; n <= 18n; n++) {
			const factN = factorial(n)
			for (let k = 0n; k <= n + 2n; k++) {
				const actual = permutationsRationalStable(rat(n), rat(k))
				assertCanonical(actual)
				const expectedNum = k > n ? 0n : factN / factorial(n - k)
				assert.deepEqual(actual, rat(expectedNum, 1n), `mismatch for P(${n}, ${k})`)
			}
		}
	})

	test('cross-check against naive iterative rational product for fractional and negative n', () => {
		const bases = [
			rat(7n, 3n),
			rat(-5n, 4n),
			rat(13n, 6n),
			rat(100n, 7n),
			rat(-11n, 5n),
			rat(1n, 11n),
			rat(24n, 9n), // unreduced 8/3
		]
		for (const base of bases) {
			for (let k = 0n; k <= 15n; k++) {
				const actual = permutationsRationalStable(base, rat(k))
				assertCanonical(actual)
				const expected = naiveFallingFactorialRational(base, k)
				assert.deepEqual(
					actual,
					expected,
					`mismatch for P(${base.num}/${base.den}, ${k})`,
				)
			}
		}
	})

	test('larger fractional falling factorial matches naive reference', () => {
		const n = rat(37n, 12n)
		const k = 40n
		const actual = permutationsRationalStable(n, rat(k))
		assertCanonical(actual)
		const expected = naiveFallingFactorialRational(n, k)
		assert.deepEqual(actual, expected)
	})
})
