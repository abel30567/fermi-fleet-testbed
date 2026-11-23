import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsRationalRecursive } from './permutationsRationalRecursive.js'

/**
 * Independent iterative helpers for cross-checking.
 */
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

function reduce(num, den) {
	if (den === 0n) throw new RangeError('den === 0n')
	if (num === 0n) return { num: 0n, den: 1n }
	const sign = den < 0n ? -1n : 1n
	const n = num * sign
	const d = den * sign
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

function addRat(a, b) {
	return reduce(a.num * b.den + b.num * a.den, a.den * b.den)
}

function mulRat(a, b) {
	return reduce(a.num * b.num, a.den * b.den)
}

function assertNormalized(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `not in lowest terms: ${r.num}/${r.den}`)
	}
}

function iterativeOracle(n, k) {
	const base = reduce(n.num, n.den)
	let num = 1n
	let den = 1n
	for (let i = 0n; i < BigInt(k); i++) {
		num *= base.num - i * base.den
		den *= base.den
	}
	return reduce(num, den)
}

function factorial(m) {
	let res = 1n
	for (let i = 2n; i <= m; i++) res *= i
	return res
}

function binomial(n, k) {
	return factorial(n) / (factorial(k) * factorial(n - k))
}

describe('permutationsRationalRecursive', () => {
	test('normal cases: standard discrete integer permutations P(n, k)', () => {
		assert.deepEqual(permutationsRationalRecursive({ num: 5n, den: 1n }, 3), { num: 60n, den: 1n })
		assert.deepEqual(permutationsRationalRecursive({ num: 10n, den: 1n }, 4), { num: 5040n, den: 1n })
		assert.deepEqual(permutationsRationalRecursive({ num: 6n, den: 1n }, 6), { num: 720n, den: 1n })
		assert.deepEqual(permutationsRationalRecursive({ num: 7n, den: 1n }, 1), { num: 7n, den: 1n })
		assert.deepEqual(permutationsRationalRecursive({ num: 5n, den: 1n }, 3n), { num: 60n, den: 1n })
	})

	test('normal cases: fractional and negative exact rationals', () => {
		// (5/2) * (3/2) * (1/2) = 15/8
		const r1 = permutationsRationalRecursive({ num: 5n, den: 2n }, 3)
		assertNormalized(r1)
		assert.deepEqual(r1, { num: 15n, den: 8n })

		// (1/2) * (-1/2) * (-3/2) * (-5/2) = -15/16
		const r2 = permutationsRationalRecursive({ num: 1n, den: 2n }, 4)
		assertNormalized(r2)
		assert.deepEqual(r2, { num: -15n, den: 16n })

		// (-3) * (-4) * (-5) = -60
		const r3 = permutationsRationalRecursive({ num: -3n, den: 1n }, 3)
		assertNormalized(r3)
		assert.deepEqual(r3, { num: -60n, den: 1n })

		// (-1/3) * (-4/3) = 4/9
		const r4 = permutationsRationalRecursive({ num: -1n, den: 3n }, 2)
		assertNormalized(r4)
		assert.deepEqual(r4, { num: 4n, den: 9n })
	})

	test('edge cases: k = 0, n = 0, k > n for non-negative integers, and unreduced/negative-den inputs', () => {
		// Empty product P(n, 0) = 1 for any valid rational n (including 0 and negatives)
		assert.deepEqual(permutationsRationalRecursive({ num: 0n, den: 1n }, 0), { num: 1n, den: 1n })
		assert.deepEqual(permutationsRationalRecursive({ num: -7n, den: 3n }, 0), { num: 1n, den: 1n })
		assert.deepEqual(permutationsRationalRecursive({ num: 5n, den: -2n }, 0n), { num: 1n, den: 1n })

		// P(0, k) = 0 for k >= 1
		assert.deepEqual(permutationsRationalRecursive({ num: 0n, den: 5n }, 1), { num: 0n, den: 1n })
		assert.deepEqual(permutationsRationalRecursive({ num: 0n, den: -9n }, 5), { num: 0n, den: 1n })

		// P(n, k) = 0 when n is a non-negative integer and k > n (including very large k)
		assert.deepEqual(permutationsRationalRecursive({ num: 4n, den: 1n }, 5), { num: 0n, den: 1n })
		assert.deepEqual(permutationsRationalRecursive({ num: 12n, den: 4n }, 4), { num: 0n, den: 1n })
		assert.deepEqual(permutationsRationalRecursive({ num: 5n, den: 1n }, 1000000n), { num: 0n, den: 1n })

		// Unreduced and negative denominator inputs normalize cleanly
		const rNegDen = permutationsRationalRecursive({ num: -10n, den: -4n }, 3) // 5/2
		assertNormalized(rNegDen)
		assert.deepEqual(rNegDen, { num: 15n, den: 8n })

		const rFlip = permutationsRationalRecursive({ num: 6n, den: -4n }, 2) // (-3/2) * (-5/2) = 15/4
		assertNormalized(rFlip)
		assert.deepEqual(rFlip, { num: 15n, den: 4n })
	})

	test('large BigInt exactness beyond Number.MAX_SAFE_INTEGER', () => {
		// P(30, 30) = 30! = 265252859812191058636308480000000n
		const p30 = permutationsRationalRecursive({ num: 30n, den: 1n }, 30)
		assertNormalized(p30)
		assert.deepEqual(p30, { num: factorial(30n), den: 1n })

		// P(50, 25) = 50! / 25!
		const p50_25 = permutationsRationalRecursive({ num: 50n, den: 1n }, 25)
		assertNormalized(p50_25)
		assert.deepEqual(p50_25, { num: factorial(50n) / factorial(25n), den: 1n })

		// Fractional large k: P(101/7, 40)
		const fracLarge = permutationsRationalRecursive({ num: 101n, den: 7n }, 40)
		assertNormalized(fracLarge)
		assert.deepEqual(fracLarge, iterativeOracle({ num: 101n, den: 7n }, 40))
	})

	test('invalid inputs throw appropriate TypeError or RangeError', () => {
		// Invalid n
		assert.throws(() => permutationsRationalRecursive(null, 2), TypeError)
		assert.throws(() => permutationsRationalRecursive(undefined, 2), TypeError)
		assert.throws(() => permutationsRationalRecursive(5, 2), TypeError)
		assert.throws(() => permutationsRationalRecursive('5/2', 2), TypeError)
		assert.throws(() => permutationsRationalRecursive({ num: 5, den: 2n }, 2), TypeError)
		assert.throws(() => permutationsRationalRecursive({ num: 5n, den: 2 }, 2), TypeError)
		assert.throws(() => permutationsRationalRecursive({}, 2), TypeError)
		assert.throws(() => permutationsRationalRecursive({ num: 5n, den: 0n }, 2), RangeError)
		assert.throws(() => permutationsRationalRecursive({ num: 0n, den: 0n }, 0), RangeError)

		// Invalid k
		assert.throws(() => permutationsRationalRecursive({ num: 5n, den: 1n }, -1), RangeError)
		assert.throws(() => permutationsRationalRecursive({ num: 5n, den: 1n }, -1n), RangeError)
		assert.throws(() => permutationsRationalRecursive({ num: 5n, den: 1n }, 1.5), RangeError)
		assert.throws(() => permutationsRationalRecursive({ num: 5n, den: 1n }, Number.NaN), RangeError)
		assert.throws(() => permutationsRationalRecursive({ num: 5n, den: 1n }, Number.POSITIVE_INFINITY), RangeError)
		assert.throws(() => permutationsRationalRecursive({ num: 5n, den: 1n }, Number.MAX_SAFE_INTEGER + 1), RangeError)
		assert.throws(() => permutationsRationalRecursive({ num: 5n, den: 1n }, '3'), TypeError)
		assert.throws(() => permutationsRationalRecursive({ num: 5n, den: 1n }, null), TypeError)
		assert.throws(() => permutationsRationalRecursive({ num: 5n, den: 1n }, {}), TypeError)
	})

	test('independent cross-check: brute-force iterative oracle over rational grid', () => {
		const samples = [
			{ num: 0n, den: 1n },
			{ num: 1n, den: 1n },
			{ num: 7n, den: 1n },
			{ num: -4n, den: 1n },
			{ num: 1n, den: 2n },
			{ num: -5n, den: 3n },
			{ num: 14n, den: 6n },
			{ num: 9n, den: -4n },
			{ num: -18n, den: -12n },
			{ num: 23n, den: 5n },
		]
		for (const n of samples) {
			for (let k = 0; k <= 12; k++) {
				const actual = permutationsRationalRecursive(n, k)
				const expected = iterativeOracle(n, k)
				assertNormalized(actual)
				assert.deepEqual(actual, expected, `mismatch for n=${n.num}/${n.den}, k=${k}`)
			}
		}
	})

	test('independent cross-check: Vandermonde, splitting, and reflection identities', () => {
		const pairs = [
			[{ num: 5n, den: 3n }, { num: 7n, den: 4n }],
			[{ num: -2n, den: 5n }, { num: 11n, den: 6n }],
			[{ num: -7n, den: 2n }, { num: -3n, den: 4n }],
		]

		// Vandermonde's identity: (x + y)_k = sum_{j=0}^k C(k, j) * (x)_j * (y)_{k-j}
		for (const [x, y] of pairs) {
			const sumXY = addRat(x, y)
			for (let k = 0; k <= 8; k++) {
				const lhs = permutationsRationalRecursive(sumXY, k)
				let rhs = { num: 0n, den: 1n }
				for (let j = 0; j <= k; j++) {
					const coeff = { num: binomial(BigInt(k), BigInt(j)), den: 1n }
					const px = permutationsRationalRecursive(x, j)
					const py = permutationsRationalRecursive(y, k - j)
					rhs = addRat(rhs, mulRat(coeff, mulRat(px, py)))
				}
				assertNormalized(lhs)
				assert.deepEqual(lhs, rhs, `Vandermonde failed for k=${k}`)
			}
		}

		// Splitting identity: (x)_{a + b} = (x)_a * (x - a)_b
		const x = { num: 13n, den: 5n }
		for (let a = 0; a <= 6; a++) {
			for (let b = 0; b <= 6; b++) {
				const lhs = permutationsRationalRecursive(x, a + b)
				const xa = { num: x.num - BigInt(a) * x.den, den: x.den }
				const rhs = mulRat(
					permutationsRationalRecursive(x, a),
					permutationsRationalRecursive(xa, b)
				)
				assert.deepEqual(lhs, rhs, `splitting failed for a=${a}, b=${b}`)
			}
		}

		// Reflection identity: (-x)_k = (-1)^k * (x + k - 1)_k
		const negX = { num: -x.num, den: x.den }
		for (let k = 0; k <= 10; k++) {
			const lhs = permutationsRationalRecursive(negX, k)
			const shifted = { num: x.num + BigInt(k - 1) * x.den, den: x.den }
			const sign = k % 2 === 0 ? 1n : -1n
			const rhs = mulRat({ num: sign, den: 1n }, permutationsRationalRecursive(shifted, k))
			assert.deepEqual(lhs, rhs, `reflection failed for k=${k}`)
		}
	})
})
