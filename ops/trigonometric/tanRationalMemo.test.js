import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tanRationalMemo } from './tanRationalMemo.js'

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

function rationalToNumber({ num, den }) {
	const intPart = num / den
	const rem = num - intPart * den
	const SCALE = 10n ** 16n
	const fracPart = Number((rem * SCALE) / den) / 1e16
	return Number(intPart) + fracPart
}

function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected reduced rational, got ${r.num}/${r.den}`)
	}
}

describe('tanRationalMemo', () => {
	it('returns exact { num: 0n, den: 1n } for zero inputs', () => {
		assert.deepEqual(tanRationalMemo({ num: 0n, den: 1n }), { num: 0n, den: 1n })
		assert.deepEqual(tanRationalMemo({ num: 0n, den: 7n }), { num: 0n, den: 1n })
		assert.deepEqual(tanRationalMemo({ num: 0n, den: -9n }), { num: 0n, den: 1n })
	})

	it('matches exact hand-calculated rational truncations for small term counts', () => {
		// N = 1: sin_1(x)/cos_1(x) = x / 1 = x
		assert.deepEqual(tanRationalMemo({ num: 3n, den: 7n }, 1), { num: 3n, den: 7n })

		// N = 2, x = 1/2: (1/2 - 1/48) / (1 - 1/8) = (23/48) / (7/8) = 23/42
		assert.deepEqual(tanRationalMemo({ num: 1n, den: 2n }, 2), { num: 23n, den: 42n })

		// N = 3, x = 1: (1 - 1/6 + 1/120) / (1 - 1/2 + 1/24) = (101/120) / (65/120) = 101/65
		assert.deepEqual(tanRationalMemo({ num: 1n, den: 1n }, 3), { num: 101n, den: 65n })
	})

	it('normalizes unreduced inputs and negative denominators identically', () => {
		const canonical = tanRationalMemo({ num: 1n, den: 2n })
		assertLowestTerms(canonical)

		assert.deepEqual(tanRationalMemo({ num: 2n, den: 4n }), canonical)
		assert.deepEqual(tanRationalMemo({ num: 123n, den: 246n }), canonical)
		assert.deepEqual(tanRationalMemo({ num: -3n, den: -6n }), canonical)

		const negCanonical = tanRationalMemo({ num: -1n, den: 4n })
		assertLowestTerms(negCanonical)
		assert.deepEqual(tanRationalMemo({ num: 1n, den: -4n }), negCanonical)
		assert.deepEqual(tanRationalMemo({ num: 5n, den: -20n }), negCanonical)
	})

	it('satisfies exact odd symmetry tan(-x) == -tan(x)', () => {
		const samples = [
			{ num: 1n, den: 10n },
			{ num: 1n, den: 3n },
			{ num: 3n, den: 4n },
			{ num: 1n, den: 1n },
			{ num: 2n, den: 1n },
			{ num: 7n, den: 3n },
			{ num: 355n, den: 113n },
		]

		for (const x of samples) {
			const pos = tanRationalMemo(x)
			const neg = tanRationalMemo({ num: -x.num, den: x.den })
			assertLowestTerms(pos)
			assertLowestTerms(neg)
			assert.equal(neg.num, -pos.num)
			assert.equal(neg.den, pos.den)
		}
	})

	it('agrees with Math.tan within tight tolerance across small, medium, near-pole, and |x| > pi/2 inputs', () => {
		const samples = [
			{ num: 1n, den: 1000n },
			{ num: 1n, den: 4n },
			{ num: 1n, den: 2n },
			{ num: 1n, den: 1n },
			{ num: 157n, den: 100n }, // near pi/2 where tan ~ 1255.77
			{ num: 2n, den: 1n }, // > pi/2 (negative tangent)
			{ num: 3n, den: 1n },
			{ num: 355n, den: 113n }, // near pi
			{ num: 10n, den: 1n },
			{ num: -5n, den: 3n },
		]

		for (const x of samples) {
			const result = tanRationalMemo(x)
			assertLowestTerms(result)
			const approx = rationalToNumber(result)
			const expected = Math.tan(Number(x.num) / Number(x.den))
			const scale = Math.max(1, Math.abs(expected))
			assert.ok(
				Math.abs(approx - expected) <= 1e-13 * scale,
				`tan(${x.num}/${x.den}): got ${approx}, expected ${expected}`
			)
		}
	})

	it('satisfies the exact rational double-angle identity tan(2x) = 2*tan(x)/(1 - tan(x)^2)', () => {
		const x = { num: 1n, den: 3n }
		const twoX = { num: 2n, den: 3n }

		const t1 = tanRationalMemo(x, 20)
		const t2 = tanRationalMemo(twoX, 20)

		// rhs = 2 * t1 / (1 - t1^2) = (2 * t1.num * t1.den) / (t1.den^2 - t1.num^2)
		const rhsNum = 2n * t1.num * t1.den
		const rhsDen = t1.den * t1.den - t1.num * t1.num

		// |t2 - rhs| < 10^-25 checked purely in BigInt arithmetic
		const diffNum = t2.num * rhsDen - rhsNum * t2.den
		const absDiffNum = diffNum < 0n ? -diffNum : diffNum
		const absDiffDen = (t2.den * rhsDen) < 0n ? -(t2.den * rhsDen) : t2.den * rhsDen
		assert.ok(absDiffNum * 10n ** 25n < absDiffDen)
	})

	it('satisfies the exact rational angle-addition identity tan(a + b) = (tan(a) + tan(b)) / (1 - tan(a)*tan(b))', () => {
		const a = { num: 1n, den: 5n }
		const b = { num: 1n, den: 7n }
		const sum = { num: 12n, den: 35n }

		const ta = tanRationalMemo(a, 20)
		const tb = tanRationalMemo(b, 20)
		const tab = tanRationalMemo(sum, 20)

		const rhsNum = ta.num * tb.den + tb.num * ta.den
		const rhsDen = ta.den * tb.den - ta.num * tb.num

		const diffNum = tab.num * rhsDen - rhsNum * tab.den
		const absDiffNum = diffNum < 0n ? -diffNum : diffNum
		const absDiffDen = (tab.den * rhsDen) < 0n ? -(tab.den * rhsDen) : tab.den * rhsDen
		assert.ok(absDiffNum * 10n ** 25n < absDiffDen)
	})

	it('maintains memoization consistency and isolates returned objects from cache mutation', () => {
		const first = tanRationalMemo({ num: 3n, den: 5n })
		const snapshot = { num: first.num, den: first.den }

		// Mutate the returned object and verify subsequent cached calls are unaffected
		first.num = 999999n
		first.den = 1n

		const second = tanRationalMemo({ num: 3n, den: 5n })
		assert.deepEqual(second, snapshot)

		// Unreduced equivalent hits the same normalized cache entry
		const third = tanRationalMemo({ num: 9n, den: 15n })
		assert.deepEqual(third, snapshot)

		// Different term counts do not collide in the cache
		const lowPrecision = tanRationalMemo({ num: 3n, den: 5n }, 2)
		assert.notDeepEqual(lowPrecision, snapshot)
	})

	it('rejects invalid inputs with strict TypeError / RangeError validation', () => {
		assert.throws(() => tanRationalMemo(null), TypeError)
		assert.throws(() => tanRationalMemo(undefined), TypeError)
		assert.throws(() => tanRationalMemo(0.5), TypeError)
		assert.throws(() => tanRationalMemo('1/2'), TypeError)
		assert.throws(() => tanRationalMemo([1n, 2n]), TypeError)
		assert.throws(() => tanRationalMemo({}), TypeError)
		assert.throws(() => tanRationalMemo({ num: 1, den: 2n }), TypeError)
		assert.throws(() => tanRationalMemo({ num: 1n, den: 2 }), TypeError)
		assert.throws(() => tanRationalMemo({ num: '1', den: '2' }), TypeError)

		assert.throws(() => tanRationalMemo({ num: 1n, den: 0n }), RangeError)
		assert.throws(() => tanRationalMemo({ num: 0n, den: 0n }), RangeError)

		assert.throws(() => tanRationalMemo({ num: 1n, den: 2n }, '10'), TypeError)
		assert.throws(() => tanRationalMemo({ num: 1n, den: 2n }, 10n), TypeError)
		assert.throws(() => tanRationalMemo({ num: 1n, den: 2n }, null), TypeError)

		assert.throws(() => tanRationalMemo({ num: 1n, den: 2n }, 0), RangeError)
		assert.throws(() => tanRationalMemo({ num: 1n, den: 2n }, -3), RangeError)
		assert.throws(() => tanRationalMemo({ num: 1n, den: 2n }, 2.5), RangeError)
		assert.throws(() => tanRationalMemo({ num: 1n, den: 2n }, Number.NaN), RangeError)
		assert.throws(() => tanRationalMemo({ num: 1n, den: 2n }, Number.POSITIVE_INFINITY), RangeError)
		assert.throws(() => tanRationalMemo({ num: 1n, den: 2n }, 201), RangeError)

		assert.throws(() => tanRationalMemo({ num: 100000n, den: 1n }), RangeError)
	})
})
