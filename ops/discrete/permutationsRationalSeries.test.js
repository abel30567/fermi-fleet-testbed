import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsRationalSeries } from './permutationsRationalSeries.js'

const rat = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

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

function norm(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

function addRat(a, b) {
	return norm(a.num * b.den + b.num * a.den, a.den * b.den)
}

function mulRat(a, b) {
	return norm(a.num * b.num, a.den * b.den)
}

function powRat(a, exp) {
	let res = { num: 1n, den: 1n }
	for (let i = 0; i < exp; i += 1) {
		res = mulRat(res, a)
	}
	return res
}

function factorial(n) {
	let res = 1n
	for (let i = 2n; i <= n; i += 1n) {
		res *= i
	}
	return res
}

function binomial(n, k) {
	if (k < 0 || k > n) return 0n
	return factorial(BigInt(n)) / (factorial(BigInt(k)) * factorial(BigInt(n - k)))
}

/**
 * Independent reference implementation via direct falling-factorial product:
 *   P(x, k) = prod_{j=0}^{k-1} (x - j)
 */
function directFallingFactorial(x, k) {
	let acc = { num: 1n, den: 1n }
	for (let j = 0n; j < BigInt(k); j += 1n) {
		const factor = norm(x.num - j * x.den, x.den)
		acc = mulRat(acc, factor)
	}
	return acc
}

/**
 * Stirling numbers of the second kind S(n, k) via recurrence
 * S(n, k) = k * S(n - 1, k) + S(n - 1, k - 1).
 */
function stirlingSecond(n, k) {
	if (n === 0 && k === 0) return 1n
	if (n === 0 || k === 0 || k > n) return 0n
	const row = new Array(k + 1).fill(0n)
	row[0] = 1n
	for (let m = 1; m <= n; m += 1) {
		for (let j = Math.min(m, k); j >= 1; j -= 1) {
			row[j] = BigInt(j) * row[j] + row[j - 1]
		}
		row[0] = 0n
	}
	return row[k]
}

function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected reduced fraction, got ${r.num}/${r.den}`)
	}
}

describe('permutationsRationalSeries', () => {
	test('computes standard integer k-permutations P(n, k)', () => {
		assert.deepEqual(permutationsRationalSeries(rat(5), rat(3)), rat(60))
		assert.deepEqual(permutationsRationalSeries(rat(6), rat(6)), rat(720))
		assert.deepEqual(permutationsRationalSeries(rat(10), rat(4)), rat(5040))
		assert.deepEqual(permutationsRationalSeries(rat(8), 2), rat(56))
		assert.deepEqual(permutationsRationalSeries(rat(8), 2n), rat(56))
	})

	test('preserves exact BigInt precision beyond Number.MAX_SAFE_INTEGER', () => {
		const p20 = permutationsRationalSeries(rat(20), rat(20))
		assert.deepEqual(p20, { num: 2432902008176640000n, den: 1n })
		assertLowestTerms(p20)

		const p30_15 = permutationsRationalSeries(rat(30), 15)
		assert.deepEqual(p30_15, { num: factorial(30n) / factorial(15n), den: 1n })
		assertLowestTerms(p30_15)
	})

	test('computes permutations over positive and negative non-integer rationals', () => {
		// P(5/2, 3) = (5/2)(3/2)(1/2) = 15/8
		assert.deepEqual(permutationsRationalSeries(rat(5, 2), rat(3)), rat(15, 8))
		// P(1/2, 4) = (1/2)(-1/2)(-3/2)(-5/2) = -15/16
		assert.deepEqual(permutationsRationalSeries(rat(1, 2), 4), rat(-15, 16))
		// P(7/3, 3) = (7/3)(4/3)(1/3) = 28/27
		assert.deepEqual(permutationsRationalSeries(rat(7, 3), 3n), rat(28, 27))
		// P(-1/3, 3) = (-1/3)(-4/3)(-7/3) = -28/27
		assert.deepEqual(permutationsRationalSeries(rat(-1, 3), rat(3)), rat(-28, 27))
		// P(-5/4, 2) = (-5/4)(-9/4) = 45/16
		assert.deepEqual(permutationsRationalSeries(rat(-5, 4), 2), rat(45, 16))
	})

	test('computes permutations for negative integer n', () => {
		// P(-3, 2) = (-3)(-4) = 12
		assert.deepEqual(permutationsRationalSeries(rat(-3), rat(2)), rat(12))
		// P(-2, 3) = (-2)(-3)(-4) = -24
		assert.deepEqual(permutationsRationalSeries(rat(-2), 3), rat(-24))
		// P(-1, 5) = (-1)(-2)(-3)(-4)(-5) = -120
		assert.deepEqual(permutationsRationalSeries(rat(-1), 5n), rat(-120))
	})

	test('handles k = 0 and k = 1 edge cases across all rational domains', () => {
		const samples = [rat(0), rat(5), rat(-4), rat(3, 7), rat(-5, 2), rat(6, 4), rat(3, -6)]
		for (const x of samples) {
			const r0 = permutationsRationalSeries(x, rat(0))
			assert.deepEqual(r0, rat(1))
			assertLowestTerms(r0)

			const r1 = permutationsRationalSeries(x, rat(1))
			assert.deepEqual(r1, norm(x.num, x.den))
			assertLowestTerms(r1)
			assert.notEqual(r1, x)
		}
		assert.deepEqual(permutationsRationalSeries(rat(5, 2), -0), rat(1))
	})

	test('returns exact zero when n is a non-negative integer and k > n (including huge k)', () => {
		assert.deepEqual(permutationsRationalSeries(rat(0), rat(1)), rat(0))
		assert.deepEqual(permutationsRationalSeries(rat(0), rat(5)), rat(0))
		assert.deepEqual(permutationsRationalSeries(rat(3), rat(4)), rat(0))
		assert.deepEqual(permutationsRationalSeries(rat(3), rat(10)), rat(0))
		assert.deepEqual(permutationsRationalSeries(rat(5), 10n ** 30n), rat(0))
		assert.deepEqual(permutationsRationalSeries(rat(10, 2), rat(12, 2)), rat(0))
	})

	test('normalizes unreduced inputs and negative denominators to lowest terms', () => {
		const res = permutationsRationalSeries({ num: -10n, den: -4n }, { num: -6n, den: -2n })
		assert.deepEqual(res, rat(15, 8))
		assertLowestTerms(res)

		const one = permutationsRationalSeries({ num: 0n, den: -9n }, { num: 0n, den: -3n })
		assert.deepEqual(one, { num: 1n, den: 1n })
		assertLowestTerms(one)

		const zero = permutationsRationalSeries({ num: 0n, den: -9n }, { num: -3n, den: -3n })
		assert.deepEqual(zero, { num: 0n, den: 1n })
		assertLowestTerms(zero)
	})

	test('rejects invalid n inputs with TypeError or RangeError', () => {
		const typeErrors = [
			null,
			undefined,
			5,
			5n,
			'5/2',
			true,
			[5n, 2n],
			{},
			{ num: 5, den: 1n },
			{ num: 5n, den: 1 },
			{ num: 5n }
		]
		for (const bad of typeErrors) {
			assert.throws(() => permutationsRationalSeries(bad, 2), TypeError)
		}

		assert.throws(() => permutationsRationalSeries({ num: 5n, den: 0n }, 2), RangeError)
		assert.throws(() => permutationsRationalSeries({ num: 0n, den: 0n }, 0), RangeError)
	})

	test('rejects invalid k inputs with TypeError or RangeError', () => {
		const typeErrors = [
			undefined,
			null,
			'3',
			true,
			[3n],
			{},
			{ num: 3, den: 1n },
			{ num: 3n, den: 1 }
		]
		for (const bad of typeErrors) {
			assert.throws(() => permutationsRationalSeries(rat(5, 2), bad), TypeError)
		}

		const rangeErrors = [
			-1,
			-1n,
			1.5,
			NaN,
			Infinity,
			-Infinity,
			Number.MAX_SAFE_INTEGER + 1,
			{ num: -2n, den: 1n },
			{ num: 2n, den: -1n },
			{ num: 3n, den: 2n },
			{ num: 3n, den: 0n },
			BigInt(Number.MAX_SAFE_INTEGER) + 1n
		]
		for (const bad of rangeErrors) {
			assert.throws(() => permutationsRationalSeries(rat(5, 2), bad), RangeError)
		}
	})

	test('cross-check: matches direct falling-factorial product over rational grid', () => {
		for (let q = 1; q <= 5; q += 1) {
			for (let p = -6; p <= 6; p += 1) {
				const x = rat(p, q)
				for (let k = 0; k <= 7; k += 1) {
					const actual = permutationsRationalSeries(x, rat(k))
					const expected = directFallingFactorial(x, k)
					assert.deepEqual(actual, expected)
					assertLowestTerms(actual)
				}
			}
		}
	})

	test('cross-check: matches factorial closed form n! / (n - k)! for 0 <= k <= n <= 20', () => {
		for (let n = 0; n <= 20; n += 1) {
			for (let k = 0; k <= n; k += 1) {
				const actual = permutationsRationalSeries(rat(n), k)
				const expected = { num: factorial(BigInt(n)) / factorial(BigInt(n - k)), den: 1n }
				assert.deepEqual(actual, expected)
			}
		}
	})

	test('cross-check: satisfies Chu-Vandermonde, recurrence, chaining, and negation identities', () => {
		const x = rat(7, 3)
		const y = rat(-5, 4)
		const xy = addRat(x, y)

		// Chu-Vandermonde: P(x + y, k) = sum_{j=0}^{k} C(k, j) * P(x, j) * P(y, k - j)
		for (let k = 0; k <= 7; k += 1) {
			const lhs = permutationsRationalSeries(xy, k)
			let rhs = rat(0)
			for (let j = 0; j <= k; j += 1) {
				const term = mulRat(
					rat(binomial(k, j)),
					mulRat(permutationsRationalSeries(x, j), permutationsRationalSeries(y, k - j))
				)
				rhs = addRat(rhs, term)
			}
			assert.deepEqual(lhs, rhs)
		}

		// Recurrence: P(x, k) = P(x - 1, k) + k * P(x - 1, k - 1)
		const xMinus1 = addRat(x, rat(-1))
		for (let k = 1; k <= 8; k += 1) {
			const lhs = permutationsRationalSeries(x, k)
			const rhs = addRat(
				permutationsRationalSeries(xMinus1, k),
				mulRat(rat(k), permutationsRationalSeries(xMinus1, k - 1))
			)
			assert.deepEqual(lhs, rhs)
		}

		// Chaining: P(x, a + b) = P(x, a) * P(x - a, b)
		for (let a = 0; a <= 4; a += 1) {
			for (let b = 0; b <= 4; b += 1) {
				const lhs = permutationsRationalSeries(x, a + b)
				const rhs = mulRat(
					permutationsRationalSeries(x, a),
					permutationsRationalSeries(addRat(x, rat(-a)), b)
				)
				assert.deepEqual(lhs, rhs)
			}
		}

		// Negation identity: P(-x, k) = (-1)^k * P(x + k - 1, k)
		const negX = { num: -x.num, den: x.den }
		for (let k = 0; k <= 7; k += 1) {
			const lhs = permutationsRationalSeries(negX, k)
			const sign = k % 2 === 0 ? 1n : -1n
			const shifted = addRat(x, rat(k - 1))
			const rhs = mulRat(rat(sign), permutationsRationalSeries(shifted, k))
			assert.deepEqual(lhs, rhs)
		}
	})

	test('cross-check: Stirling second-kind inversion sum_{j=0}^{k} S(k, j) * P(x, j) = x^k', () => {
		const samples = [rat(7, 5), rat(-3, 4), rat(11, 2)]
		for (const x of samples) {
			for (let k = 0; k <= 8; k += 1) {
				let sum = rat(0)
				for (let j = 0; j <= k; j += 1) {
					const coeff = rat(stirlingSecond(k, j))
					sum = addRat(sum, mulRat(coeff, permutationsRationalSeries(x, j)))
				}
				assert.deepEqual(sum, powRat(x, k))
			}
		}
	})
})
