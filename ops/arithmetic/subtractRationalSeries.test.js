import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { subtractRationalSeries } from './subtractRationalSeries.js'

/**
 * Independent reference GCD using binary GCD (Stein's algorithm),
 * distinct from the Euclidean GCD inside subtractRationalSeries.
 */
function binaryGcd(a, b) {
	let u = a < 0n ? -a : a
	let v = b < 0n ? -b : b
	if (u === 0n) return v
	if (v === 0n) return u

	let shift = 0n
	while (((u | v) & 1n) === 0n) {
		u >>= 1n
		v >>= 1n
		shift++
	}
	while ((u & 1n) === 0n) {
		u >>= 1n
	}
	do {
		while ((v & 1n) === 0n) {
			v >>= 1n
		}
		if (u > v) {
			const tmp = u
			u = v
			v = tmp
		}
		v -= u
	} while (v !== 0n)
	return u << shift
}

/**
 * Independent naive cross-multiplication reference implementation for cross-checking.
 */
function naiveSubtract(a, b) {
	let num = a.num * b.den - b.num * a.den
	let den = a.den * b.den
	if (den < 0n) {
		num = -num
		den = -den
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g = binaryGcd(num, den)
	return { num: num / g, den: den / g }
}

function assertCanonical(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(binaryGcd(r.num, r.den), 1n, `not in lowest terms: ${r.num}/${r.den}`)
	}
}

describe('subtractRationalSeries', () => {
	describe('normal cases', () => {
		it('subtracts simple fractions with coprime denominators', () => {
			const res = subtractRationalSeries({ num: 1n, den: 2n }, { num: 1n, den: 3n })
			assert.deepEqual(res, { num: 1n, den: 6n })
			assertCanonical(res)
		})

		it('reduces results to lowest terms when denominators share factors', () => {
			assert.deepEqual(
				subtractRationalSeries({ num: 3n, den: 4n }, { num: 1n, den: 4n }),
				{ num: 1n, den: 2n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: 5n, den: 6n }, { num: 1n, den: 6n }),
				{ num: 2n, den: 3n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: 1n, den: 6n }, { num: 1n, den: 10n }),
				{ num: 1n, den: 15n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: 7n, den: 12n }, { num: 5n, den: 18n }),
				{ num: 11n, den: 36n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: 5n, den: 12n }, { num: 1n, den: 12n }),
				{ num: 1n, den: 3n },
			)
		})

		it('handles negative results and signed operands', () => {
			assert.deepEqual(
				subtractRationalSeries({ num: 2n, den: 3n }, { num: 5n, den: 6n }),
				{ num: -1n, den: 6n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: -3n, den: 4n }, { num: 1n, den: 4n }),
				{ num: -1n, den: 1n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: -3n, den: 4n }, { num: -1n, den: 4n }),
				{ num: -1n, den: 2n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: 1n, den: 5n }, { num: -2n, den: 5n }),
				{ num: 3n, den: 5n },
			)
		})

		it('handles integer-valued rationals (den === 1n)', () => {
			assert.deepEqual(
				subtractRationalSeries({ num: 10n, den: 1n }, { num: 3n, den: 1n }),
				{ num: 7n, den: 1n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: -5n, den: 1n }, { num: -8n, den: 1n }),
				{ num: 3n, den: 1n },
			)
		})
	})

	describe('edge cases', () => {
		it('handles zero operands and self-subtraction', () => {
			assert.deepEqual(
				subtractRationalSeries({ num: 0n, den: 1n }, { num: 0n, den: 1n }),
				{ num: 0n, den: 1n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: 5n, den: 7n }, { num: 0n, den: 1n }),
				{ num: 5n, den: 7n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: 0n, den: 1n }, { num: 5n, den: 7n }),
				{ num: -5n, den: 7n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: 0n, den: 1n }, { num: -5n, den: 7n }),
				{ num: 5n, den: 7n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: 17n, den: 23n }, { num: 17n, den: 23n }),
				{ num: 0n, den: 1n },
			)
		})

		it('normalizes unreduced inputs and negative denominators', () => {
			assert.deepEqual(
				subtractRationalSeries({ num: 4n, den: 6n }, { num: 2n, den: 6n }),
				{ num: 1n, den: 3n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: 1n, den: -2n }, { num: -1n, den: -3n }),
				{ num: -5n, den: 6n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: 0n, den: -7n }, { num: 0n, den: 99n }),
				{ num: 0n, den: 1n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: -6n, den: -9n }, { num: 2n, den: 3n }),
				{ num: 0n, den: 1n },
			)
			assert.deepEqual(
				subtractRationalSeries({ num: 6n, den: -9n }, { num: 0n, den: -5n }),
				{ num: -2n, den: 3n },
			)
		})

		it('does not mutate input objects and returns fresh objects', () => {
			const a = { num: 3n, den: 5n }
			const b = { num: 0n, den: 1n }
			const res = subtractRationalSeries(a, b)
			assert.notEqual(res, a)
			assert.notEqual(res, b)
			assert.deepEqual(a, { num: 3n, den: 5n })
			assert.deepEqual(b, { num: 0n, den: 1n })
		})

		it('preserves full precision for very large BigInt rationals beyond IEEE-754', () => {
			const big = 10n ** 60n
			const res = subtractRationalSeries({ num: big + 1n, den: big }, { num: 1n, den: 1n })
			assert.deepEqual(res, { num: 1n, den: big })
			assertCanonical(res)

			// Exact decimal subtraction where IEEE-754 float fails (0.3 - 0.1 !== 0.2)
			const dec = subtractRationalSeries({ num: 3n, den: 10n }, { num: 1n, den: 10n })
			assert.deepEqual(dec, { num: 1n, den: 5n })

			// Huge shared factor in denominators
			const shared = 3n ** 40n * 7n ** 25n
			const p = subtractRationalSeries(
				{ num: 11n, den: 2n * shared },
				{ num: 5n, den: 2n * shared },
			)
			assert.deepEqual(p, { num: 1n, den: 3n ** 39n * 7n ** 25n })
			assertCanonical(p)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError for non-object or missing arguments', () => {
			const valid = { num: 1n, den: 2n }
			const badValues = [undefined, null, 0, 1, '1/2', true, 1n, [1n, 2n], () => {}]
			for (const bad of badValues) {
				assert.throws(() => subtractRationalSeries(bad, valid), TypeError)
				assert.throws(() => subtractRationalSeries(valid, bad), TypeError)
			}
		})

		it('throws TypeError when num or den is missing or not a BigInt', () => {
			const valid = { num: 1n, den: 2n }
			const badObjects = [
				{},
				{ num: 1n },
				{ den: 2n },
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: '2' },
				{ num: NaN, den: 1n },
				{ num: 1n, den: Infinity },
				{ num: null, den: 1n },
				Object.create({ num: 1n, den: 2n }),
			]
			for (const bad of badObjects) {
				assert.throws(() => subtractRationalSeries(bad, valid), TypeError)
				assert.throws(() => subtractRationalSeries(valid, bad), TypeError)
			}
		})

		it('throws RangeError when denominator is 0n', () => {
			const valid = { num: 1n, den: 2n }
			assert.throws(() => subtractRationalSeries({ num: 1n, den: 0n }, valid), RangeError)
			assert.throws(() => subtractRationalSeries({ num: 0n, den: 0n }, valid), RangeError)
			assert.throws(() => subtractRationalSeries(valid, { num: 1n, den: 0n }), RangeError)
			assert.throws(() => subtractRationalSeries(valid, { num: 0n, den: 0n }), RangeError)
			assert.throws(
				() => subtractRationalSeries({ num: 1n, den: 0n }, { num: 2n, den: 0n }),
				RangeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		it('matches independent naive cross-multiplication with binary GCD across a deterministic grid', () => {
			const nums = [-12n, -5n, -1n, 0n, 1n, 6n, 15n]
			const dens = [-12n, -6n, -1n, 1n, 4n, 6n, 10n]
			for (const n1 of nums) {
				for (const d1 of dens) {
					const a = { num: n1, den: d1 }
					for (const n2 of nums) {
						for (const d2 of dens) {
							const b = { num: n2, den: d2 }
							const actual = subtractRationalSeries(a, b)
							const expected = naiveSubtract(a, b)
							assertCanonical(actual)
							assert.deepEqual(actual, expected)
						}
					}
				}
			}
		})

		it('satisfies algebraic identities (anticommutativity and shift invariance)', () => {
			const samples = [
				{ num: 7n, den: 12n },
				{ num: -19n, den: 30n },
				{ num: 1000000000000000000003n, den: 999999999999999999997n },
				{ num: 0n, den: 5n },
				{ num: 42n, den: -28n },
			]
			for (const a of samples) {
				for (const b of samples) {
					const ab = subtractRationalSeries(a, b)
					const ba = subtractRationalSeries(b, a)
					assertCanonical(ab)
					assertCanonical(ba)
					assert.equal(ab.num, -ba.num)
					assert.equal(ab.den, ba.den)

					for (const c of samples) {
						const lhs = subtractRationalSeries(
							subtractRationalSeries(a, c),
							subtractRationalSeries(b, c),
						)
						assert.deepEqual(lhs, ab)
					}
				}
			}
		})

		it('satisfies the telescoping series identity sum_{k=1..N} (1/k - 1/(k+1)) = N/(N+1)', () => {
			const N = 100n
			// Accumulate sum via repeated subtraction of negated terms: sum = sum - (-term)
			let sum = { num: 0n, den: 1n }
			for (let k = 1n; k <= N; k++) {
				const term = subtractRationalSeries({ num: 1n, den: k }, { num: 1n, den: k + 1n })
				assert.deepEqual(term, { num: 1n, den: k * (k + 1n) })
				assertCanonical(term)
				sum = subtractRationalSeries(sum, { num: -term.num, den: term.den })
				assertCanonical(sum)
			}
			const closedForm = subtractRationalSeries({ num: 1n, den: 1n }, { num: 1n, den: N + 1n })
			assert.deepEqual(sum, { num: N, den: N + 1n })
			assert.deepEqual(sum, closedForm)
		})
	})
})
