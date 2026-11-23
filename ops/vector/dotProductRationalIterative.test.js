import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductRationalIterative } from './dotProductRationalIterative.js'

/**
 * Helper to construct a rational object concisely.
 *
 * @param {bigint | number} num
 * @param {bigint | number} [den=1n]
 */
function rat(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

/**
 * Independent reference implementation using a single global common denominator
 * (product of all pairwise denominators) and a single final reduction.
 *
 * @param {Array<{ num: bigint, den: bigint }>} a
 * @param {Array<{ num: bigint, den: bigint }>} b
 */
function referenceCommonDenominatorDot(a, b) {
	let commonDen = 1n
	for (let i = 0; i < a.length; i++) {
		commonDen *= a[i].den * b[i].den
	}

	let totalNum = 0n
	for (let i = 0; i < a.length; i++) {
		const termDen = a[i].den * b[i].den
		totalNum += a[i].num * b[i].num * (commonDen / termDen)
	}

	if (totalNum === 0n) {
		return { num: 0n, den: 1n }
	}
	if (commonDen < 0n) {
		totalNum = -totalNum
		commonDen = -commonDen
	}

	let x = totalNum < 0n ? -totalNum : totalNum
	let y = commonDen
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return { num: totalNum / x, den: commonDen / x }
}

/**
 * Independent BigInt GCD helper for test reference calculations.
 */
function refGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Independent canonicalization helper for test reference calculations.
 */
function refReduce(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = refGcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Independent exact rational addition helper for algebraic property checks.
 */
function addRat(p, q) {
	return refReduce(p.num * q.den + q.num * p.den, p.den * q.den)
}

/**
 * Independent exact rational multiplication helper for algebraic property checks.
 */
function mulRat(p, q) {
	return refReduce(p.num * q.num, p.den * q.den)
}

describe('dotProductRationalIterative', () => {
	describe('normal cases', () => {
		it('computes dot product of simple positive rationals in lowest terms', () => {
			// (1/2)*(2/3) + (1/3)*(3/4) = 1/3 + 1/4 = 7/12
			const a = [rat(1, 2), rat(1, 3)]
			const b = [rat(2, 3), rat(3, 4)]
			assert.deepEqual(dotProductRationalIterative(a, b), { num: 7n, den: 12n })
		})

		it('reduces sums that simplify to an integer', () => {
			// (1/2)*(1/2) + (3/4)*(1/1) = 1/4 + 3/4 = 1/1
			const a = [rat(1, 2), rat(3, 4)]
			const b = [rat(1, 2), rat(1, 1)]
			assert.deepEqual(dotProductRationalIterative(a, b), { num: 1n, den: 1n })
		})

		it('handles negative numerators, negative denominators, and unreduced inputs', () => {
			// (-2/4)*(6/-9) + (10/-15)*(-9/12)
			// = (-1/2)*(-2/3) + (-2/3)*(-3/4)
			// = 1/3 + 1/2 = 5/6
			const a = [rat(-2, 4), rat(10, -15)]
			const b = [rat(6, -9), rat(-9, 12)]
			assert.deepEqual(dotProductRationalIterative(a, b), { num: 5n, den: 6n })
		})

		it('returns canonical negative fraction with positive denominator', () => {
			// (3/5)*(-2/7) + (-1/5)*(4/7) = -6/35 - 4/35 = -10/35 = -2/7
			const a = [rat(3, 5), rat(-1, 5)]
			const b = [rat(-2, 7), rat(4, 7)]
			const res = dotProductRationalIterative(a, b)
			assert.deepEqual(res, { num: -2n, den: 7n })
			assert.ok(res.den > 0n)
		})

		it('returns exact { num: 0n, den: 1n } for orthogonal vectors', () => {
			// (3/7)*(5/11) + (-5/11)*(3/7) = 0/1
			const a = [rat(3, 7), rat(-5, 11)]
			const b = [rat(5, 11), rat(3, 7)]
			assert.deepEqual(dotProductRationalIterative(a, b), { num: 0n, den: 1n })
		})

		it('preserves exact precision beyond Number.MAX_SAFE_INTEGER', () => {
			const big = 10n ** 30n
			// (big + 1)/big * 1 + (-1) * 1 = 1/big
			const a = [rat(big + 1n, big), rat(-1n, 1n)]
			const b = [rat(1n, 1n), rat(1n, 1n)]
			assert.deepEqual(dotProductRationalIterative(a, b), { num: 1n, den: big })
		})

		it('does not mutate input vectors or rational objects', () => {
			const a = [Object.freeze(rat(4, -6)), Object.freeze(rat(3, 9))]
			const b = [Object.freeze(rat(9, 12)), Object.freeze(rat(-6, -8))]
			Object.freeze(a)
			Object.freeze(b)
			const res = dotProductRationalIterative(a, b)
			// (-2/3)*(3/4) + (1/3)*(3/4) = -1/2 + 1/4 = -1/4
			assert.deepEqual(res, { num: -1n, den: 4n })
		})
	})

	describe('edge cases', () => {
		it('returns { num: 0n, den: 1n } for empty vectors', () => {
			assert.deepEqual(dotProductRationalIterative([], []), { num: 0n, den: 1n })
		})

		it('handles single-element vectors', () => {
			assert.deepEqual(
				dotProductRationalIterative([rat(14, -21)], [rat(-9, 10)]),
				{ num: 3n, den: 5n }
			)
		})

		it('handles vectors containing zero numerators with non-unit denominators', () => {
			const a = [rat(0, 7), rat(2, 3), rat(5, 9)]
			const b = [rat(11, -13), rat(0, -4), rat(3, 10)]
			// 0 + 0 + 15/90 = 1/6
			assert.deepEqual(dotProductRationalIterative(a, b), { num: 1n, den: 6n })
		})

		it('handles vectors where all terms are zero', () => {
			const a = [rat(0, 5), rat(0, -3)]
			const b = [rat(0, -7), rat(4, 9)]
			assert.deepEqual(dotProductRationalIterative(a, b), { num: 0n, den: 1n })
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when arguments are not arrays', () => {
			assert.throws(() => dotProductRationalIterative(null, []), TypeError)
			assert.throws(() => dotProductRationalIterative([], undefined), TypeError)
			assert.throws(() => dotProductRationalIterative('abc', []), TypeError)
			assert.throws(() => dotProductRationalIterative({}, []), TypeError)
			assert.throws(() => dotProductRationalIterative(new Int32Array(1), [rat(1)]), TypeError)
		})

		it('throws RangeError on mismatched vector lengths', () => {
			assert.throws(() => dotProductRationalIterative([rat(1)], []), RangeError)
			assert.throws(
				() => dotProductRationalIterative([rat(1), rat(2)], [rat(1)]),
				RangeError
			)
		})

		it('throws TypeError on sparse arrays', () => {
			const sparse = new Array(2)
			sparse[0] = rat(1, 2)
			assert.throws(
				() => dotProductRationalIterative(sparse, [rat(1, 2), rat(1, 2)]),
				TypeError
			)
			assert.throws(
				() => dotProductRationalIterative([rat(1, 2), rat(1, 2)], sparse),
				TypeError
			)
		})

		it('throws TypeError on non-object elements or non-BigInt fields', () => {
			assert.throws(() => dotProductRationalIterative([null], [rat(1)]), TypeError)
			assert.throws(() => dotProductRationalIterative([rat(1)], [undefined]), TypeError)
			assert.throws(() => dotProductRationalIterative([1], [rat(1)]), TypeError)
			assert.throws(
				() => dotProductRationalIterative([{ num: 1, den: 2n }], [rat(1)]),
				TypeError
			)
			assert.throws(
				() => dotProductRationalIterative([rat(1)], [{ num: 1n, den: 2 }]),
				TypeError
			)
			assert.throws(
				() => dotProductRationalIterative([{ num: '1', den: '2' }], [rat(1)]),
				TypeError
			)
		})

		it('throws RangeError on zero denominator even when paired with a zero numerator', () => {
			assert.throws(() => dotProductRationalIterative([rat(1, 0)], [rat(1, 1)]), RangeError)
			assert.throws(() => dotProductRationalIterative([rat(0, 1)], [rat(1, 0)]), RangeError)
			assert.throws(() => dotProductRationalIterative([rat(0, 0)], [rat(0, 1)]), RangeError)
			assert.throws(
				() => dotProductRationalIterative([rat(1, 2), rat(0, 1)], [rat(1, 2), rat(5, 0)]),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		it('matches closed-form telescoping series sum_{k=1..n} (1/k)*(1/(k+1)) = n/(n+1)', () => {
			for (const n of [1, 5, 25, 100]) {
				const a = []
				const b = []
				for (let k = 1; k <= n; k++) {
					a.push(rat(1, k))
					b.push(rat(1, k + 1))
				}
				assert.deepEqual(dotProductRationalIterative(a, b), {
					num: BigInt(n),
					den: BigInt(n + 1),
				})
			}
		})

		it('matches independent global common-denominator reference across deterministic pseudo-random vectors', () => {
			// Deterministic LCG for reproducible test vectors
			let seed = 0x123456789abcdef1n
			const mod = 1n << 64n
			const nextRand = () => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) % mod
				return seed
			}
			const randInt = (min, max) => {
				const span = BigInt(max - min + 1)
				return BigInt(min) + (nextRand() % span)
			}
			const randRat = () => {
				const num = randInt(-200, 200)
				let den = randInt(-100, 100)
				if (den === 0n) den = 1n
				return { num, den }
			}

			for (let trial = 0; trial < 40; trial++) {
				const len = Number(randInt(0, 15))
				const a = Array.from({ length: len }, randRat)
				const b = Array.from({ length: len }, randRat)

				const actual = dotProductRationalIterative(a, b)
				const expected = referenceCommonDenominatorDot(a, b)
				assert.deepEqual(actual, expected)
				assert.ok(actual.den > 0n)
			}
		})

		it('satisfies commutativity, distributivity, and homogeneity', () => {
			const a = [rat(3, 4), rat(-5, 6), rat(7, -8), rat(0, 5)]
			const b = [rat(2, 9), rat(11, 12), rat(-1, 3), rat(4, 7)]
			const c = [rat(-1, 2), rat(4, 15), rat(5, 6), rat(-3, 11)]
			const k = rat(-7, 13)

			// Commutativity: a·b === b·a
			assert.deepEqual(
				dotProductRationalIterative(a, b),
				dotProductRationalIterative(b, a)
			)

			// Distributivity: a·(b + c) === a·b + a·c
			const bPlusC = b.map((bi, i) => addRat(bi, c[i]))
			const lhsDist = dotProductRationalIterative(a, bPlusC)
			const rhsDist = addRat(
				dotProductRationalIterative(a, b),
				dotProductRationalIterative(a, c)
			)
			assert.deepEqual(lhsDist, rhsDist)

			// Homogeneity: (k*a)·b === k*(a·b)
			const ka = a.map((ai) => mulRat(k, ai))
			const lhsScale = dotProductRationalIterative(ka, b)
			const rhsScale = mulRat(k, dotProductRationalIterative(a, b))
			assert.deepEqual(lhsScale, rhsScale)
		})
	})
})
