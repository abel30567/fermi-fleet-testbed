import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionRationalMemo } from './convolutionRationalMemo.js'

/**
 * Helper to construct a rational literal concisely in tests.
 * @param {bigint | number} num
 * @param {bigint | number} [den=1n]
 * @returns {{ num: bigint, den: bigint }}
 */
function r(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

/**
 * Independent reference implementation of exact rational arithmetic and naive
 * convolution, using direct pairwise fraction multiplication and addition
 * (no common-denominator scaling, no lookup table, no memoization).
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

function refNorm(q) {
	if (q.num === 0n) return { num: 0n, den: 1n }
	const sign = q.den < 0n ? -1n : 1n
	const n = q.num * sign
	const d = q.den * sign
	const g = refGcd(n, d)
	return { num: n / g, den: d / g }
}

function refAdd(a, b) {
	return refNorm({ num: a.num * b.den + b.num * a.den, den: a.den * b.den })
}

function refConvolution(a, b) {
	if (a.length === 0 || b.length === 0) return []
	const out = Array.from({ length: a.length + b.length - 1 }, () => ({ num: 0n, den: 1n }))
	for (let i = 0; i < a.length; i++) {
		const ai = refNorm(a[i])
		for (let j = 0; j < b.length; j++) {
			const bj = refNorm(b[j])
			const prod = refNorm({ num: ai.num * bj.num, den: ai.den * bj.den })
			out[i + j] = refAdd(out[i + j], prod)
		}
	}
	return out
}

/**
 * Independent polynomial evaluator P(x) = sum_i seq[i] * x^i via Horner's method.
 */
function evalPoly(seq, x) {
	let acc = { num: 0n, den: 1n }
	for (let i = seq.length - 1; i >= 0; i--) {
		const prod = refNorm({ num: acc.num * x.num, den: acc.den * x.den })
		acc = refAdd(prod, refNorm(seq[i]))
	}
	return acc
}

/**
 * Assert every rational in a sequence is canonically reduced with den > 0n.
 */
function assertCanonical(seq) {
	for (let i = 0; i < seq.length; i++) {
		const { num, den } = seq[i]
		assert.equal(typeof num, 'bigint', `index ${i} num must be bigint`)
		assert.equal(typeof den, 'bigint', `index ${i} den must be bigint`)
		assert.ok(den > 0n, `index ${i} den must be positive, got ${den}`)
		if (num === 0n) {
			assert.equal(den, 1n, `index ${i} zero must have den === 1n`)
		} else {
			assert.equal(refGcd(num, den), 1n, `index ${i} ${num}/${den} not in lowest terms`)
		}
	}
}

describe('convolutionRationalMemo', () => {
	describe('normal cases', () => {
		it('convolves simple integer-valued rational sequences', () => {
			// (1 + 2x + 3x^2) * (4 + 5x) = 4 + 13x + 22x^2 + 15x^3
			const a = [r(1), r(2), r(3)]
			const b = [r(4), r(5)]
			const res = convolutionRationalMemo(a, b)
			assert.deepEqual(res, [r(4), r(13), r(22), r(15)])
			assertCanonical(res)
		})

		it('convolves fractional sequences and reduces results to lowest terms', () => {
			// (1/2 + 1/3 x) * (2/3 + 3/4 x)
			// k=0: 1/3
			// k=1: 3/8 + 2/9 = 43/72
			// k=2: 1/4
			const a = [r(1, 2), r(1, 3)]
			const b = [r(2, 3), r(3, 4)]
			const res = convolutionRationalMemo(a, b)
			assert.deepEqual(res, [r(1, 3), r(43, 72), r(1, 4)])
			assertCanonical(res)
		})

		it('handles negative numerators, negative denominators, and unreduced inputs', () => {
			// a = [-6/-9, 4/-6] = [2/3, -2/3]
			// b = [15/10, -9/-6] = [3/2, 3/2]
			// conv = [1, 0, -1]
			const a = [r(-6, -9), r(4, -6)]
			const b = [r(15, 10), r(-9, -6)]
			const res = convolutionRationalMemo(a, b)
			assert.deepEqual(res, [r(1, 1), r(0, 1), r(-1, 1)])
			assertCanonical(res)
		})

		it('handles asymmetric sequence lengths', () => {
			const a = [r(3, 5)]
			const b = [r(5, 6), r(-10, 9), r(0, 7), r(25, 12)]
			const res = convolutionRationalMemo(a, b)
			assert.deepEqual(res, [r(1, 2), r(-2, 3), r(0, 1), r(5, 4)])
			assertCanonical(res)
		})

		it('handles exact arbitrary-precision BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
			const big1 = (1n << 120n) + 3n
			const big2 = (1n << 110n) + 7n
			const den1 = (1n << 100n) + 9n
			const den2 = (1n << 95n) + 11n

			const a = [r(big1, den1), r(-big2, den2)]
			const b = [r(big2, den1), r(big1, den2)]
			const res = convolutionRationalMemo(a, b)
			const expected = refConvolution(a, b)

			assert.deepEqual(res, expected)
			assertCanonical(res)
		})
	})

	describe('edge cases', () => {
		it('returns [] when either or both inputs are empty', () => {
			assert.deepEqual(convolutionRationalMemo([], []), [])
			assert.deepEqual(convolutionRationalMemo([], [r(1, 2)]), [])
			assert.deepEqual(convolutionRationalMemo([r(1, 2)], []), [])
		})

		it('convolves single-element sequences', () => {
			assert.deepEqual(convolutionRationalMemo([r(2, 3)], [r(3, 4)]), [r(1, 2)])
			assert.deepEqual(convolutionRationalMemo([r(0, -5)], [r(7, 9)]), [r(0, 1)])
		})

		it('convolves all-zero sequences to canonical zeros', () => {
			const a = [r(0, 3), r(0, -7)]
			const b = [r(0, 11), r(0, 13), r(0, -1)]
			const res = convolutionRationalMemo(a, b)
			assert.deepEqual(res, [r(0, 1), r(0, 1), r(0, 1), r(0, 1)])
			assertCanonical(res)
		})

		it('satisfies impulse and shifted-impulse identities', () => {
			const signal = [r(3, 4), r(-5, 6), r(0, 1), r(7, 8)]
			assert.deepEqual(convolutionRationalMemo(signal, [r(1, 1)]), signal)
			assert.deepEqual(
				convolutionRationalMemo(signal, [r(0, 1), r(0, 1), r(1, 1)]),
				[r(0, 1), r(0, 1), ...signal]
			)
		})

		it('preserves memoization safety against caller mutation of inputs and outputs', () => {
			const a = [r(1, 2), r(1, 3)]
			const b = [r(1, 5), r(1, 7)]

			const first = convolutionRationalMemo(a, b)
			// Mutate returned array and its element objects
			first[0].num = 999999n
			first[0].den = 1n
			first.push(r(42, 1))

			// Second call hits memo cache and must return clean, uncorrupted copies
			const second = convolutionRationalMemo(a, b)
			assert.deepEqual(second, [r(1, 10), r(29, 210), r(1, 21)])

			// Commutative hit with swapped arguments must also return distinct objects
			const swapped = convolutionRationalMemo(b, a)
			assert.deepEqual(swapped, second)
			assert.notEqual(swapped, second)
			assert.notEqual(swapped[0], second[0])

			// Repeated values within a single output must not alias the same object
			const sym = convolutionRationalMemo([r(1, 2), r(1, 2)], [r(1, 2), r(1, 2)])
			assert.deepEqual(sym, [r(1, 4), r(1, 2), r(1, 4)])
			assert.notEqual(sym[0], sym[2])
			sym[0].num = 123n
			assert.equal(sym[2].num, 1n)
		})

		it('handles cache eviction cleanly beyond cache capacity', () => {
			for (let k = 1; k <= 300; k++) {
				const res = convolutionRationalMemo([r(k, k + 1)], [r(k + 1, k + 2)])
				assert.deepEqual(res, [refNorm(r(k, k + 2))])
			}
			// Re-query an evicted early entry
			assert.deepEqual(convolutionRationalMemo([r(1, 2)], [r(2, 3)]), [r(1, 3)])
		})
	})

	describe('input validation', () => {
		it('throws TypeError when a or b is not an array', () => {
			for (const bad of [null, undefined, 42, '1/2', {}, new Int32Array([1]), 1n]) {
				assert.throws(() => convolutionRationalMemo(bad, [r(1)]), TypeError)
				assert.throws(() => convolutionRationalMemo([r(1)], bad), TypeError)
			}
		})

		it('throws TypeError for non-object elements, arrays, missing fields, or non-bigint num/den', () => {
			const badElements = [
				null,
				undefined,
				1,
				1n,
				'1/2',
				[1n, 2n],
				{},
				{ num: 1n },
				{ den: 1n },
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: '2' },
				{ num: NaN, den: 1n },
			]
			for (const el of badElements) {
				assert.throws(() => convolutionRationalMemo([el], [r(1)]), TypeError)
				assert.throws(() => convolutionRationalMemo([r(1)], [el]), TypeError)
			}
		})

		it('throws TypeError for sparse arrays with holes', () => {
			const sparse = new Array(2)
			sparse[0] = r(1, 2)
			assert.throws(() => convolutionRationalMemo(sparse, [r(1)]), TypeError)
			assert.throws(() => convolutionRationalMemo([r(1)], sparse), TypeError)
		})

		it('throws RangeError for zero denominators (including when paired with an empty array)', () => {
			assert.throws(() => convolutionRationalMemo([r(1, 0)], [r(1, 1)]), RangeError)
			assert.throws(() => convolutionRationalMemo([r(0, 0)], [r(1, 1)]), RangeError)
			assert.throws(() => convolutionRationalMemo([r(1, 1)], [r(-3, 0)]), RangeError)
			// Validation still runs even if the other sequence is empty
			assert.throws(() => convolutionRationalMemo([r(1, 0)], []), RangeError)
			assert.throws(() => convolutionRationalMemo([], [r(1, 0)]), RangeError)
		})
	})

	describe('independent cross-checks and algebraic laws', () => {
		it('matches independent naive rational convolution across pseudo-random sequences', () => {
			// Deterministic LCG PRNG for reproducible testing
			let seed = 0x123456789abcdef1n
			const nextBig = () => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
				return seed
			}
			const randRat = () => {
				const num = (nextBig() % 401n) - 200n
				const denMag = (nextBig() % 120n) + 1n
				const den = nextBig() % 5n === 0n ? -denMag : denMag
				return { num, den }
			}

			for (let trial = 0; trial < 25; trial++) {
				const lenA = Number(nextBig() % 12n) + 1
				const lenB = Number(nextBig() % 12n) + 1
				const a = Array.from({ length: lenA }, randRat)
				const b = Array.from({ length: lenB }, randRat)

				const actual = convolutionRationalMemo(a, b)
				const expected = refConvolution(a, b)
				assert.deepEqual(actual, expected, `mismatch on trial ${trial}`)
				assertCanonical(actual)
			}
		})

		it('satisfies the polynomial evaluation theorem C(x) = A(x) * B(x) at exact rational points', () => {
			const a = [r(3, 7), r(-5, 11), r(0, 1), r(13, 17), r(-2, 3)]
			const b = [r(-7, 13), r(4, 9), r(11, 19), r(-1, 23)]
			const c = convolutionRationalMemo(a, b)

			const evalPoints = [r(0), r(1), r(-1), r(2), r(-3, 5), r(7, 11), r(-19, 13)]
			for (const x of evalPoints) {
				const pa = evalPoly(a, x)
				const pb = evalPoly(b, x)
				const pc = evalPoly(c, x)
				const expected = refNorm({ num: pa.num * pb.num, den: pa.den * pb.den })
				assert.deepEqual(pc, expected, `C(x) !== A(x)*B(x) at x = ${x.num}/${x.den}`)
			}
		})

		it('satisfies commutativity, associativity, and distributivity', () => {
			const a = [r(1, 2), r(-3, 4), r(5, 6)]
			const b = [r(-2, 3), r(7, 8)]
			const c = [r(4, 5), r(-1, 7), r(3, 11)]

			// Commutativity: a * b = b * a
			assert.deepEqual(convolutionRationalMemo(a, b), convolutionRationalMemo(b, a))

			// Associativity: (a * b) * c = a * (b * c)
			const leftAssoc = convolutionRationalMemo(convolutionRationalMemo(a, b), c)
			const rightAssoc = convolutionRationalMemo(a, convolutionRationalMemo(b, c))
			assert.deepEqual(leftAssoc, rightAssoc)

			// Distributivity: a * (b + c) = (a * b) + (a * c) (with zero-padded b to match c)
			const bPad = [b[0], b[1], r(0, 1)]
			const bPlusC = bPad.map((v, i) => refAdd(v, c[i]))
			const lhs = convolutionRationalMemo(a, bPlusC)

			const ab = convolutionRationalMemo(a, bPad)
			const ac = convolutionRationalMemo(a, c)
			const rhs = ab.map((v, i) => refAdd(v, ac[i]))
			assert.deepEqual(lhs, rhs)
		})
	})
})
