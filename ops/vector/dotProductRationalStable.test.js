import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductRationalStable } from './dotProductRationalStable.js'

/**
 * Helper to construct a rational object concisely.
 *
 * @param {bigint | number} num
 * @param {bigint | number} [den=1n]
 * @returns {{ num: bigint, den: bigint }}
 */
function r(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

/**
 * Independent reference implementation using a single global common denominator
 * (product of all pairwise denominators) and a single final reduction.
 *
 * @param {{ num: bigint, den: bigint }[]} a
 * @param {{ num: bigint, den: bigint }[]} b
 * @returns {{ num: bigint, den: bigint }}
 */
function referenceDotProduct(a, b) {
	if (a.length === 0) {
		return { num: 0n, den: 1n }
	}

	const normA = a.map(({ num, den }) =>
		den < 0n ? { num: -num, den: -den } : { num, den },
	)
	const normB = b.map(({ num, den }) =>
		den < 0n ? { num: -num, den: -den } : { num, den },
	)

	let commonDen = 1n
	for (let i = 0; i < normA.length; i++) {
		commonDen *= normA[i].den * normB[i].den
	}

	let totalNum = 0n
	for (let i = 0; i < normA.length; i++) {
		const termDen = normA[i].den * normB[i].den
		totalNum += normA[i].num * normB[i].num * (commonDen / termDen)
	}

	if (totalNum === 0n) {
		return { num: 0n, den: 1n }
	}

	let x = totalNum < 0n ? -totalNum : totalNum
	let y = commonDen
	while (y !== 0n) {
		const rem = x % y
		x = y
		y = rem
	}

	return { num: totalNum / x, den: commonDen / x }
}

/**
 * Checks that a rational result is in canonical lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} val
 */
function assertCanonical(val) {
	assert.equal(typeof val.num, 'bigint')
	assert.equal(typeof val.den, 'bigint')
	assert.ok(val.den > 0n, `expected positive denominator, got ${val.den}`)
	if (val.num === 0n) {
		assert.equal(val.den, 1n)
		return
	}
	let x = val.num < 0n ? -val.num : val.num
	let y = val.den
	while (y !== 0n) {
		const rem = x % y
		x = y
		y = rem
	}
	assert.equal(x, 1n, `fraction ${val.num}/${val.den} is not in lowest terms`)
}

describe('dotProductRationalStable', () => {
	describe('normal cases', () => {
		test('computes dot product of integer-valued rationals', () => {
			const a = [r(1), r(2), r(3)]
			const b = [r(4), r(5), r(6)]
			const result = dotProductRationalStable(a, b)
			assertCanonical(result)
			assert.deepEqual(result, r(32, 1))
		})

		test('computes dot product of mixed fractions in lowest terms', () => {
			const a = [r(1, 2), r(1, 3), r(-2, 5)]
			const b = [r(2, 3), r(3, 4), r(5, 6)]
			// (1/3) + (1/4) + (-1/3) = 1/4
			const result = dotProductRationalStable(a, b)
			assertCanonical(result)
			assert.deepEqual(result, r(1, 4))
		})

		test('handles unreduced inputs and negative denominators', () => {
			const a = [r(6, -9), r(-10, -15)]
			const b = [r(-3, 4), r(9, -12)]
			// (-2/3)*(-3/4) + (2/3)*(-3/4) = 1/2 - 1/2 = 0/1
			const result = dotProductRationalStable(a, b)
			assertCanonical(result)
			assert.deepEqual(result, r(0, 1))
		})

		test('reduces sums of terms sharing common denominators', () => {
			const a = [r(1, 6), r(1, 6), r(1, 6), r(1, 6)]
			const b = [r(1, 2), r(1, 2), r(1, 2), r(1, 2)]
			// 4 * (1/12) = 1/3
			const result = dotProductRationalStable(a, b)
			assertCanonical(result)
			assert.deepEqual(result, r(1, 3))
		})

		test('does not mutate input arrays or rational objects', () => {
			const a = [r(4, -6), r(3, 9)]
			const b = [r(-2, 8), r(6, -10)]
			const snapshotA = a.map((x) => ({ ...x }))
			const snapshotB = b.map((x) => ({ ...x }))

			dotProductRationalStable(a, b)

			assert.deepEqual(a, snapshotA)
			assert.deepEqual(b, snapshotB)
		})
	})

	describe('edge cases and numerical robustness', () => {
		test('empty vectors return 0/1', () => {
			const result = dotProductRationalStable([], [])
			assertCanonical(result)
			assert.deepEqual(result, r(0, 1))
		})

		test('single-element vectors', () => {
			assert.deepEqual(dotProductRationalStable([r(7, -14)], [r(-6, 9)]), r(1, 3))
			assert.deepEqual(dotProductRationalStable([r(0, -5)], [r(99, 7)]), r(0, 1))
		})

		test('orthogonal vectors cancel cleanly to 0/1', () => {
			const a = [r(3, 7), r(-5, 11), r(2, 13)]
			const b = [r(5, 11), r(3, 7), r(0, 1)]
			const result = dotProductRationalStable(a, b)
			assertCanonical(result)
			assert.deepEqual(result, r(0, 1))
		})

		test('immune to floating-point catastrophic cancellation', () => {
			const huge = 10n ** 100n
			const tinyDen = 10n ** 100n
			const a = [r(huge, 1n), r(1n, tinyDen), r(-huge, 1n), r(1n, 3n)]
			const b = [r(1n, 1n), r(1n, 1n), r(1n, 1n), r(1n, 1n)]
			const result = dotProductRationalStable(a, b)
			assertCanonical(result)
			// 10^-100 + 1/3 = (3 + 10^100) / (3 * 10^100)
			const expected = {
				num: 3n + tinyDen,
				den: 3n * tinyDen,
			}
			assert.deepEqual(result, expected)
		})

		test('handles odd-length vectors across multiple pairwise tree levels', () => {
			const a = [r(1, 2), r(1, 3), r(1, 5), r(1, 7), r(1, 11), r(1, 13), r(1, 17)]
			const b = [r(1, 1), r(1, 1), r(1, 1), r(1, 1), r(1, 1), r(1, 1), r(1, 1)]
			const result = dotProductRationalStable(a, b)
			assertCanonical(result)
			assert.deepEqual(result, referenceDotProduct(a, b))
		})

		test('handles huge BigInt numerators and denominators with common factors', () => {
			const p = 10n ** 60n + 7n
			const q = 10n ** 60n + 9n
			const a = [r(p * 3n, q * 5n), r(-p * 2n, q * 5n)]
			const b = [r(q * 7n, p * 11n), r(q * 7n, p * 11n)]
			// (3/5)*(7/11) + (-2/5)*(7/11) = (1/5)*(7/11) = 7/55
			const result = dotProductRationalStable(a, b)
			assertCanonical(result)
			assert.deepEqual(result, r(7, 55))
		})
	})

	describe('invalid inputs', () => {
		test('rejects non-array arguments with TypeError', () => {
			assert.throws(() => dotProductRationalStable(null, []), TypeError)
			assert.throws(() => dotProductRationalStable([], undefined), TypeError)
			assert.throws(() => dotProductRationalStable('abc', []), TypeError)
			assert.throws(() => dotProductRationalStable({}, []), TypeError)
			assert.throws(
				() => dotProductRationalStable(new Float64Array([1]), [r(1)]),
				TypeError,
			)
		})

		test('rejects mismatched vector lengths with RangeError', () => {
			assert.throws(() => dotProductRationalStable([r(1)], []), RangeError)
			assert.throws(
				() => dotProductRationalStable([r(1), r(2)], [r(1)]),
				RangeError,
			)
		})

		test('rejects malformed rational elements with TypeError', () => {
			assert.throws(() => dotProductRationalStable([null], [r(1)]), TypeError)
			assert.throws(() => dotProductRationalStable([1], [r(1)]), TypeError)
			assert.throws(
				() => dotProductRationalStable([{ num: 1, den: 2n }], [r(1)]),
				TypeError,
			)
			assert.throws(
				() => dotProductRationalStable([{ num: 1n, den: 2 }], [r(1)]),
				TypeError,
			)
			assert.throws(
				() => dotProductRationalStable([{ num: 1n }], [r(1)]),
				TypeError,
			)
			assert.throws(
				() => dotProductRationalStable([r(1)], [{ num: '1', den: 2n }]),
				TypeError,
			)
		})

		test('rejects sparse arrays with TypeError', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = new Array(2)
			sparse[0] = r(1)
			assert.throws(
				() => dotProductRationalStable(sparse, [r(1), r(2)]),
				TypeError,
			)
			assert.throws(
				() => dotProductRationalStable([r(1), r(2)], sparse),
				TypeError,
			)
		})

		test('rejects zero denominators with RangeError even when paired with zero', () => {
			assert.throws(
				() => dotProductRationalStable([r(1, 0)], [r(1, 1)]),
				RangeError,
			)
			assert.throws(
				() => dotProductRationalStable([r(0, 0)], [r(1, 1)]),
				RangeError,
			)
			assert.throws(
				() => dotProductRationalStable([r(0, 1)], [r(5, 0)]),
				RangeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		test('matches global common-denominator reference across deterministic pseudo-random vectors', () => {
			let seed = 0x5deece66dn
			const nextInt = (bound) => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
				return Number(seed % BigInt(bound))
			}

			for (let trial = 0; trial < 30; trial++) {
				const length = 1 + nextInt(25)
				const a = []
				const b = []
				for (let i = 0; i < length; i++) {
					const numA = BigInt(nextInt(41) - 20)
					const denA = BigInt((nextInt(15) + 1) * (nextInt(2) === 0 ? 1 : -1))
					const numB = BigInt(nextInt(41) - 20)
					const denB = BigInt((nextInt(15) + 1) * (nextInt(2) === 0 ? 1 : -1))
					a.push({ num: numA, den: denA })
					b.push({ num: numB, den: denB })
				}

				const actual = dotProductRationalStable(a, b)
				const expected = referenceDotProduct(a, b)
				assertCanonical(actual)
				assert.deepEqual(actual, expected)
			}
		})

		test('satisfies telescoping series identity sum_{k=1}^{200} 1/(k*(k+1)) = 200/201', () => {
			const n = 200
			const a = []
			const b = []
			for (let k = 1; k <= n; k++) {
				a.push(r(1, k))
				b.push(r(1, k + 1))
			}
			const result = dotProductRationalStable(a, b)
			assertCanonical(result)
			assert.deepEqual(result, r(n, n + 1))
		})

		test('satisfies commutativity, bilinearity, and exact Cauchy-Schwarz inequality', () => {
			const u = [r(3, 4), r(-5, 6), r(7, 10), r(-11, 12), r(13, 15)]
			const v = [r(-2, 3), r(8, 9), r(-4, 7), r(5, 8), r(-1, 5)]
			const w = [r(1, 2), r(3, 5), r(-7, 8), r(2, 9), r(4, 11)]

			// Commutativity: u · v === v · u
			const uv = dotProductRationalStable(u, v)
			const vu = dotProductRationalStable(v, u)
			assert.deepEqual(uv, vu)

			// Bilinearity: (u + v) · w === u · w + v · w
			const uPlusV = u.map((ui, i) => ({
				num: ui.num * v[i].den + v[i].num * ui.den,
				den: ui.den * v[i].den,
			}))
			const lhs = dotProductRationalStable(uPlusV, w)
			const uw = dotProductRationalStable(u, w)
			const vw = dotProductRationalStable(v, w)
			const rhs = dotProductRationalStable([uw, vw], [r(1), r(1)])
			assert.deepEqual(lhs, rhs)

			// Exact Cauchy-Schwarz: (u · v)^2 <= (u · u) * (v · v)
			const uu = dotProductRationalStable(u, u)
			const vv = dotProductRationalStable(v, v)
			const lhsSqNum = uv.num * uv.num
			const lhsSqDen = uv.den * uv.den
			const rhsProdNum = uu.num * vv.num
			const rhsProdDen = uu.den * vv.den
			assert.ok(lhsSqNum * rhsProdDen <= rhsProdNum * lhsSqDen)
		})
	})
})
