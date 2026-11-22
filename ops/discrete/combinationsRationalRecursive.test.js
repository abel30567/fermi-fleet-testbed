import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsRationalRecursive } from './combinationsRationalRecursive.js'

/** Helper to construct a rational literal. */
const rat = (num, den = 1n) => ({ num, den })

/** Independent GCD helper for verifying lowest-terms invariants. */
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

/** Independent rational addition for identity verification. */
function addRat(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

/** Independent rational multiplication for identity verification. */
function mulRat(a, b) {
	const num = a.num * b.num
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

/** Independent BigInt factorial for cross-checking classical binomials. */
function factorial(n) {
	let acc = 1n
	for (let i = 2n; i <= n; i++) acc *= i
	return acc
}

/** Asserts that a rational is strictly normalized to lowest terms with den > 0n. */
function assertNormalized(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`)
	}
}

describe('combinationsRationalRecursive', () => {
	test('handles standard non-negative integer combinations', () => {
		const cases = [
			[5n, 2n, 10n],
			[6n, 3n, 20n],
			[10n, 4n, 210n],
			[20n, 10n, 184756n],
			[52n, 5n, 2598960n],
			[100n, 50n, 100891344545564193334812497256n],
		]
		for (const [n, k, expected] of cases) {
			const res = combinationsRationalRecursive(rat(n), rat(k))
			assertNormalized(res)
			assert.deepEqual(res, rat(expected))
		}
	})

	test('handles edge cases: k=0, k=n, k>n, and n=0', () => {
		// k = 0 gives 1/1 for any rational n
		for (const n of [rat(0n), rat(7n), rat(-5n), rat(1n, 2n), rat(-3n, 7n)]) {
			const res = combinationsRationalRecursive(n, rat(0n))
			assertNormalized(res)
			assert.deepEqual(res, rat(1n, 1n))
		}

		// k = n gives 1/1 for non-negative integers
		for (const n of [0n, 1n, 5n, 37n]) {
			const res = combinationsRationalRecursive(rat(n), rat(n))
			assertNormalized(res)
			assert.deepEqual(res, rat(1n, 1n))
		}

		// k > n gives 0/1 for non-negative integers (including huge k)
		assert.deepEqual(combinationsRationalRecursive(rat(0n), rat(1n)), rat(0n, 1n))
		assert.deepEqual(combinationsRationalRecursive(rat(5n), rat(6n)), rat(0n, 1n))
		assert.deepEqual(
			combinationsRationalRecursive(rat(12n), rat(10n ** 18n)),
			rat(0n, 1n),
		)

		// Symmetry shortcut for large n with k close to n
		assert.deepEqual(
			combinationsRationalRecursive(rat(100000n), rat(99998n)),
			rat(4999950000n, 1n),
		)
	})

	test('normalizes unreduced and negative-denominator rational inputs', () => {
		assert.deepEqual(
			combinationsRationalRecursive(rat(-10n, -2n), rat(-6n, -3n)),
			rat(10n, 1n),
		)
		assert.deepEqual(
			combinationsRationalRecursive(rat(2n, 4n), rat(9n, 3n)),
			rat(1n, 16n),
		)
		assert.deepEqual(
			combinationsRationalRecursive(rat(0n, -9n), rat(0n, -4n)),
			rat(1n, 1n),
		)
		assert.deepEqual(
			combinationsRationalRecursive(rat(3n, -6n), rat(6n, 2n)),
			rat(-5n, 16n),
		)
	})

	test('computes generalized binomial coefficients for fractional rationals', () => {
		// C(1/2, k) for k = 0..5: 1, 1/2, -1/8, 1/16, -5/128, 7/256
		const halfExpected = [
			rat(1n, 1n),
			rat(1n, 2n),
			rat(-1n, 8n),
			rat(1n, 16n),
			rat(-5n, 128n),
			rat(7n, 256n),
		]
		for (let k = 0; k < halfExpected.length; k++) {
			const res = combinationsRationalRecursive(rat(1n, 2n), rat(BigInt(k)))
			assertNormalized(res)
			assert.deepEqual(res, halfExpected[k])
		}

		// C(3/2, 3) = -1/16, C(2/3, 4) = -7/243, C(-5/3, 3) = -220/81
		assert.deepEqual(combinationsRationalRecursive(rat(3n, 2n), rat(3n)), rat(-1n, 16n))
		assert.deepEqual(combinationsRationalRecursive(rat(2n, 3n), rat(4n)), rat(-7n, 243n))
		assert.deepEqual(combinationsRationalRecursive(rat(-5n, 3n), rat(3n)), rat(-220n, 81n))

		// Identity: C(-1/2, k) = (-1)^k * C(2k, k) / 4^k
		for (let k = 0n; k <= 12n; k++) {
			const actual = combinationsRationalRecursive(rat(-1n, 2n), rat(k))
			assertNormalized(actual)
			const central = factorial(2n * k) / (factorial(k) * factorial(k))
			const sign = k % 2n === 0n ? 1n : -1n
			const num = sign * central
			const den = 4n ** k
			const g = gcd(num, den)
			assert.deepEqual(actual, { num: num / g, den: den / g })
		}
	})

	test('computes negative integer upper index via upper negation identity', () => {
		// C(-m, k) = (-1)^k * C(m + k - 1, k)
		for (let m = 1n; m <= 8n; m++) {
			for (let k = 0n; k <= 8n; k++) {
				const actual = combinationsRationalRecursive(rat(-m), rat(k))
				assertNormalized(actual)
				const sign = k % 2n === 0n ? 1n : -1n
				const expectedVal =
					sign * (factorial(m + k - 1n) / (factorial(k) * factorial(m - 1n)))
				assert.deepEqual(actual, rat(expectedVal, 1n))
			}
		}
	})

	test("satisfies Pascal's identity C(n, k) + C(n, k - 1) = C(n + 1, k)", () => {
		const nValues = [
			rat(0n),
			rat(7n),
			rat(-4n),
			rat(1n, 2n),
			rat(-1n, 3n),
			rat(7n, 5n),
			rat(-11n, 4n),
		]
		for (const n of nValues) {
			const nPlus1 = addRat(n, rat(1n))
			for (let k = 1n; k <= 10n; k++) {
				const lhs = addRat(
					combinationsRationalRecursive(n, rat(k)),
					combinationsRationalRecursive(n, rat(k - 1n)),
				)
				const rhs = combinationsRationalRecursive(nPlus1, rat(k))
				assertNormalized(rhs)
				assert.deepEqual(lhs, rhs)
			}
		}
	})

	test('satisfies Chu-Vandermonde identity over arbitrary rationals', () => {
		const pairs = [
			[rat(1n, 2n), rat(1n, 3n)],
			[rat(-5n, 4n), rat(7n, 6n)],
			[rat(4n, 1n), rat(-3n, 2n)],
		]
		for (const [x, y] of pairs) {
			const sumXY = addRat(x, y)
			for (let k = 0n; k <= 8n; k++) {
				let conv = rat(0n, 1n)
				for (let j = 0n; j <= k; j++) {
					const term = mulRat(
						combinationsRationalRecursive(x, rat(j)),
						combinationsRationalRecursive(y, rat(k - j)),
					)
					conv = addRat(conv, term)
				}
				const expected = combinationsRationalRecursive(sumXY, rat(k))
				assertNormalized(expected)
				assert.deepEqual(conv, expected)
			}
		}
	})

	test("cross-checks against independent Pascal's triangle DP and factorial formula", () => {
		// Build Pascal's triangle via DP up to N = 25
		const N = 25
		const dp = Array.from({ length: N + 1 }, () => [])
		for (let n = 0; n <= N; n++) {
			dp[n][0] = 1n
			dp[n][n] = 1n
			for (let k = 1; k < n; k++) {
				dp[n][k] = dp[n - 1][k - 1] + dp[n - 1][k]
			}
		}

		for (let n = 0; n <= N; n++) {
			for (let k = 0; k <= n + 2; k++) {
				const expected = k <= n ? dp[n][k] : 0n
				const res = combinationsRationalRecursive(rat(BigInt(n)), rat(BigInt(k)))
				assertNormalized(res)
				assert.deepEqual(res, rat(expected, 1n))
			}
		}

		// Cross-check large binomials against exact BigInt factorial formula
		for (const [n, k] of [
			[60n, 23n],
			[120n, 45n],
			[200n, 100n],
		]) {
			const expected = factorial(n) / (factorial(k) * factorial(n - k))
			const res = combinationsRationalRecursive(rat(n), rat(k))
			assertNormalized(res)
			assert.deepEqual(res, rat(expected, 1n))
		}

		// Cross-check rational n against direct unreduced falling-factorial formula
		const rationals = [rat(5n, 2n), rat(-7n, 3n), rat(11n, 7n), rat(-13n, 5n)]
		for (const { num: p, den: q } of rationals) {
			for (let k = 0n; k <= 12n; k++) {
				let num = 1n
				for (let i = 0n; i < k; i++) {
					num *= p - i * q
				}
				const den = q ** k * factorial(k)
				const g = num === 0n ? den : gcd(num, den)
				const expected = num === 0n ? rat(0n, 1n) : rat(num / g, den / g)

				const actual = combinationsRationalRecursive(rat(p, q), rat(k))
				assertNormalized(actual)
				assert.deepEqual(actual, expected)
			}
		}
	})

	test('rejects invalid inputs with appropriate error types', () => {
		// Non-object / wrong container types
		assert.throws(() => combinationsRationalRecursive(null, rat(1n)), TypeError)
		assert.throws(() => combinationsRationalRecursive(undefined, rat(1n)), TypeError)
		assert.throws(() => combinationsRationalRecursive(5, rat(1n)), TypeError)
		assert.throws(() => combinationsRationalRecursive(5n, rat(1n)), TypeError)
		assert.throws(() => combinationsRationalRecursive([5n, 1n], rat(1n)), TypeError)
		assert.throws(() => combinationsRationalRecursive(rat(5n), null), TypeError)
		assert.throws(() => combinationsRationalRecursive(rat(5n), 2), TypeError)
		assert.throws(() => combinationsRationalRecursive(rat(5n), [2n, 1n]), TypeError)

		// Non-BigInt fields
		assert.throws(() => combinationsRationalRecursive({ num: 5, den: 1n }, rat(1n)), TypeError)
		assert.throws(() => combinationsRationalRecursive({ num: 5n, den: 1 }, rat(1n)), TypeError)
		assert.throws(() => combinationsRationalRecursive(rat(5n), { num: '2', den: 1n }), TypeError)
		assert.throws(() => combinationsRationalRecursive(rat(5n), { num: 2n }), TypeError)

		// Zero denominator
		assert.throws(() => combinationsRationalRecursive(rat(1n, 0n), rat(1n)), RangeError)
		assert.throws(() => combinationsRationalRecursive(rat(0n, 0n), rat(0n)), RangeError)
		assert.throws(() => combinationsRationalRecursive(rat(5n), rat(1n, 0n)), RangeError)

		// Non-integer or negative k
		assert.throws(() => combinationsRationalRecursive(rat(5n), rat(1n, 2n)), RangeError)
		assert.throws(() => combinationsRationalRecursive(rat(5n), rat(-3n, 2n)), RangeError)
		assert.throws(() => combinationsRationalRecursive(rat(5n), rat(-1n, 1n)), RangeError)
		assert.throws(() => combinationsRationalRecursive(rat(5n), rat(2n, -1n)), RangeError)
	})
})
