import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsRationalStable } from './combinationsRationalStable.js'

const R = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function assertCanonicalRational(result, expectedNum, expectedDen = 1n) {
	assert.equal(typeof result, 'object')
	assert.notEqual(result, null)
	assert.equal(typeof result.num, 'bigint')
	assert.equal(typeof result.den, 'bigint')
	assert.ok(result.den > 0n, 'denominator must be positive')
	assert.equal(gcd(result.num, result.den), 1n, 'result must be in lowest terms')
	assert.deepEqual(result, { num: expectedNum, den: expectedDen })
}

function addRationals(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

describe('combinationsRationalStable', () => {
	test('computes standard small binomial coefficients accurately', () => {
		assertCanonicalRational(combinationsRationalStable(R(5), R(2)), 10n)
		assertCanonicalRational(combinationsRationalStable(R(6), R(3)), 20n)
		assertCanonicalRational(combinationsRationalStable(R(10), R(3)), 120n)
		assertCanonicalRational(combinationsRationalStable(R(10), R(5)), 252n)
		assertCanonicalRational(combinationsRationalStable(R(12), R(4)), 495n)
		assertCanonicalRational(combinationsRationalStable(R(20), R(10)), 184756n)
	})

	test('handles boundary cases: n=0, k=0, k=1, k=n, k=n-1, k>n', () => {
		assertCanonicalRational(combinationsRationalStable(R(0), R(0)), 1n)
		assertCanonicalRational(combinationsRationalStable(R(0), R(1)), 0n)
		assertCanonicalRational(combinationsRationalStable(R(0), R(5)), 0n)

		assertCanonicalRational(combinationsRationalStable(R(7), R(0)), 1n)
		assertCanonicalRational(combinationsRationalStable(R(7), R(1)), 7n)
		assertCanonicalRational(combinationsRationalStable(R(7), R(6)), 7n)
		assertCanonicalRational(combinationsRationalStable(R(7), R(7)), 1n)

		assertCanonicalRational(combinationsRationalStable(R(7), R(8)), 0n)
		assertCanonicalRational(combinationsRationalStable(R(7), R(100)), 0n)
	})

	test('accepts unreduced rational integer inputs including negative-over-negative and zero variants', () => {
		assertCanonicalRational(combinationsRationalStable(R(20, 4), R(6, 3)), 10n)
		assertCanonicalRational(combinationsRationalStable(R(-18, -3), R(-9, -3)), 20n)
		assertCanonicalRational(combinationsRationalStable(R(0, 7), R(0, 11)), 1n)
		assertCanonicalRational(combinationsRationalStable(R(0, -5), R(0, -9)), 1n)
		assertCanonicalRational(combinationsRationalStable(R(14, 2), R(0, -3)), 1n)
		assertCanonicalRational(combinationsRationalStable(R(9, 3), R(12, 3)), 0n)
	})

	test('computes large exact binomial coefficients such as C(100, 50) and C(200, 100)', () => {
		assertCanonicalRational(
			combinationsRationalStable(R(100), R(50)),
			100891344545564193334812497256n
		)
		assertCanonicalRational(
			combinationsRationalStable(R(100), R(25)),
			242519269720337121015504n
		)
		assertCanonicalRational(
			combinationsRationalStable(R(100), R(75)),
			242519269720337121015504n
		)
		assertCanonicalRational(
			combinationsRationalStable(R(200), R(100)),
			90548514656103281165404177077484163874504589675413336841320n
		)
	})

	test('handles very large BigInt n with small k or small n-k via symmetry', () => {
		const bigN = 10n ** 18n
		const expectedC2 = (bigN * (bigN - 1n)) / 2n
		assertCanonicalRational(combinationsRationalStable(R(bigN), R(2n)), expectedC2)
		assertCanonicalRational(combinationsRationalStable(R(bigN), R(bigN - 2n)), expectedC2)
		assertCanonicalRational(combinationsRationalStable(R(bigN), R(bigN - 1n)), bigN)
		assertCanonicalRational(combinationsRationalStable(R(bigN), R(bigN)), 1n)
		assertCanonicalRational(combinationsRationalStable(R(bigN), R(bigN + 1n)), 0n)
	})

	test('does not mutate input rational objects', () => {
		const n = { num: 12n, den: 2n }
		const k = { num: -6n, den: -2n }
		const result = combinationsRationalStable(n, k)
		assertCanonicalRational(result, 20n)
		assert.deepEqual(n, { num: 12n, den: 2n })
		assert.deepEqual(k, { num: -6n, den: -2n })
	})

	test('cross-check: Pascal identity C(n, k) = C(n-1, k-1) + C(n-1, k)', () => {
		for (let n = 1; n <= 20; n += 1) {
			for (let k = 1; k < n; k += 1) {
				const lhs = combinationsRationalStable(R(n), R(k))
				const rhs = addRationals(
					combinationsRationalStable(R(n - 1), R(k - 1)),
					combinationsRationalStable(R(n - 1), R(k))
				)
				assert.deepEqual(lhs, rhs, `Pascal identity failed for n=${n}, k=${k}`)
			}
		}
	})

	test('cross-check: symmetry C(n, k) = C(n, n-k) and row sum sum_{k=0}^n C(n, k) = 2^n', () => {
		for (let n = 0; n <= 25; n += 1) {
			let sum = R(0)
			for (let k = 0; k <= n; k += 1) {
				const c1 = combinationsRationalStable(R(n), R(k))
				const c2 = combinationsRationalStable(R(n), R(n - k))
				assert.deepEqual(c1, c2, `Symmetry failed for n=${n}, k=${k}`)
				sum = addRationals(sum, c1)
			}
			assertCanonicalRational(sum, 1n << BigInt(n))
		}
	})

	test('cross-check: Vandermonde identity sum_{j=0}^r C(m, j) * C(n, r-j) = C(m+n, r)', () => {
		const m = 15
		const n = 12
		for (let r = 0; r <= m + n; r += 3) {
			let sum = 0n
			for (let j = 0; j <= r; j += 1) {
				const a = combinationsRationalStable(R(m), R(j))
				const b = combinationsRationalStable(R(n), R(r - j))
				sum += a.num * b.num
			}
			assertCanonicalRational(combinationsRationalStable(R(m + n), R(r)), sum)
		}
	})

	test('rejects negative and non-integer rational inputs', () => {
		// Negative integers
		assert.throws(() => combinationsRationalStable(R(-1), R(0)), RangeError)
		assert.throws(() => combinationsRationalStable(R(5), R(-1)), RangeError)
		assert.throws(() => combinationsRationalStable(R(5, -1), R(2)), RangeError)
		assert.throws(() => combinationsRationalStable(R(5), R(-4, 2)), RangeError)

		// Non-integer rationals
		assert.throws(() => combinationsRationalStable(R(5, 2), R(1)), RangeError)
		assert.throws(() => combinationsRationalStable(R(5), R(3, 2)), RangeError)
		assert.throws(() => combinationsRationalStable(R(-1, 2), R(0)), RangeError)
		assert.throws(() => combinationsRationalStable(R(10, 3), R(2, 1)), RangeError)

		// Zero denominator
		assert.throws(() => combinationsRationalStable(R(5, 0), R(2)), RangeError)
		assert.throws(() => combinationsRationalStable(R(5), R(0, 0)), RangeError)
	})

	test('rejects malformed or non-rational inputs with TypeError', () => {
		const invalidValues = [
			null,
			undefined,
			5,
			5n,
			'5',
			true,
			[],
			[5n, 1n],
			{},
			{ num: 5n },
			{ den: 1n },
			{ num: 5, den: 1n },
			{ num: 5n, den: 1 },
			{ num: '5', den: '1' },
			{ num: NaN, den: 1n },
		]

		for (const bad of invalidValues) {
			assert.throws(() => combinationsRationalStable(bad, R(1)), TypeError)
			assert.throws(() => combinationsRationalStable(R(5), bad), TypeError)
		}
	})
})
