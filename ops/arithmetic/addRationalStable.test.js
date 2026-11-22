import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { addRationalStable } from './addRationalStable.js'

/**
 * Independent reference GCD for test verification.
 */
function refGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		;[x, y] = [y, x % y]
	}
	return x
}

/**
 * Independent naive rational addition via direct cross-multiplication and
 * post-hoc reduction.
 */
function naiveAddRational(a, b) {
	let num = a.num * b.den + b.num * a.den
	let den = a.den * b.den
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
 * Asserts canonical lowest-terms invariants on a Rational result.
 */
function assertCanonical(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(refGcd(r.num, r.den), 1n)
	}
}

describe('addRationalStable', () => {
	describe('normal cases', () => {
		it('adds rationals with coprime denominators', () => {
			assert.deepEqual(
				addRationalStable({ num: 1n, den: 2n }, { num: 1n, den: 3n }),
				{ num: 5n, den: 6n }
			)
			assert.deepEqual(
				addRationalStable({ num: 2n, den: 7n }, { num: 3n, den: 5n }),
				{ num: 31n, den: 35n }
			)
		})

		it('adds rationals with shared denominator factors and reduces to lowest terms', () => {
			assert.deepEqual(
				addRationalStable({ num: 1n, den: 4n }, { num: 1n, den: 4n }),
				{ num: 1n, den: 2n }
			)
			assert.deepEqual(
				addRationalStable({ num: 1n, den: 6n }, { num: 5n, den: 6n }),
				{ num: 1n, den: 1n }
			)
			assert.deepEqual(
				addRationalStable({ num: 1n, den: 6n }, { num: 1n, den: 10n }),
				{ num: 4n, den: 15n }
			)
			assert.deepEqual(
				addRationalStable({ num: 5n, den: 12n }, { num: 7n, den: 18n }),
				{ num: 29n, den: 36n }
			)
			// Case where t shares a prime power factor with d1
			assert.deepEqual(
				addRationalStable({ num: 1n, den: 8n }, { num: 3n, den: 8n }),
				{ num: 1n, den: 2n }
			)
			assert.deepEqual(
				addRationalStable({ num: 5n, den: 24n }, { num: 7n, den: 24n }),
				{ num: 1n, den: 2n }
			)
		})

		it('handles negative numerators and mixed signs', () => {
			assert.deepEqual(
				addRationalStable({ num: -1n, den: 3n }, { num: 1n, den: 2n }),
				{ num: 1n, den: 6n }
			)
			assert.deepEqual(
				addRationalStable({ num: -1n, den: 3n }, { num: -1n, den: 6n }),
				{ num: -1n, den: 2n }
			)
			assert.deepEqual(
				addRationalStable({ num: 1n, den: 2n }, { num: -3n, den: 4n }),
				{ num: -1n, den: 4n }
			)
		})
	})

	describe('edge cases', () => {
		it('handles zero operands and exact cancellation to 0/1', () => {
			assert.deepEqual(
				addRationalStable({ num: 0n, den: 1n }, { num: 0n, den: 1n }),
				{ num: 0n, den: 1n }
			)
			assert.deepEqual(
				addRationalStable({ num: 0n, den: -99n }, { num: 0n, den: 42n }),
				{ num: 0n, den: 1n }
			)
			assert.deepEqual(
				addRationalStable({ num: 0n, den: 5n }, { num: 2n, den: 4n }),
				{ num: 1n, den: 2n }
			)
			assert.deepEqual(
				addRationalStable({ num: 2n, den: 4n }, { num: 0n, den: -7n }),
				{ num: 1n, den: 2n }
			)
			assert.deepEqual(
				addRationalStable({ num: 3n, den: 7n }, { num: -3n, den: 7n }),
				{ num: 0n, den: 1n }
			)
			assert.deepEqual(
				addRationalStable({ num: 6n, den: 14n }, { num: -9n, den: 21n }),
				{ num: 0n, den: 1n }
			)
		})

		it('normalizes negative denominators and unreduced inputs', () => {
			assert.deepEqual(
				addRationalStable({ num: 2n, den: -4n }, { num: -6n, den: -8n }),
				{ num: 1n, den: 4n }
			)
			assert.deepEqual(
				addRationalStable({ num: -4n, den: -6n }, { num: 0n, den: -5n }),
				{ num: 2n, den: 3n }
			)
			assert.deepEqual(
				addRationalStable({ num: 10n, den: -15n }, { num: 4n, den: -6n }),
				{ num: -4n, den: 3n }
			)
		})

		it('does not mutate inputs or alias input objects on fast paths', () => {
			const a = { num: 0n, den: 1n }
			const b = { num: 3n, den: 5n }
			const res = addRationalStable(a, b)
			assert.notEqual(res, b)
			res.num = 999n
			assert.deepEqual(b, { num: 3n, den: 5n })
		})

		it('avoids floating-point catastrophic cancellation and overflow on huge BigInts', () => {
			const huge = 10n ** 100n
			const step1 = addRationalStable(
				{ num: huge, den: 1n },
				{ num: 1n, den: 3n }
			)
			const step2 = addRationalStable(step1, { num: -huge, den: 1n })
			assert.deepEqual(step2, { num: 1n, den: 3n })

			// Huge shared factor in denominators (tests GCD scaling and post-sum cancellation by 5)
			const scale = 10n ** 200n
			const scaledSum = addRationalStable(
				{ num: 1n, den: 2n * scale },
				{ num: 1n, den: 3n * scale }
			)
			assert.deepEqual(scaledSum, { num: 1n, den: 12n * 10n ** 199n })
			assertCanonical(scaledSum)

			// Huge shared factor coprime to resulting numerator 5
			const scaleCoprime = 7n ** 200n
			const scaledCoprimeSum = addRationalStable(
				{ num: 1n, den: 2n * scaleCoprime },
				{ num: 1n, den: 3n * scaleCoprime }
			)
			assert.deepEqual(scaledCoprimeSum, { num: 5n, den: 6n * scaleCoprime })
			assertCanonical(scaledCoprimeSum)
		})

		it('handles large consecutive Fibonacci denominators without stack overflow', () => {
			let fPrev = 1n
			let fCurr = 1n
			for (let i = 0; i < 2000; i++) {
				;[fPrev, fCurr] = [fCurr, fPrev + fCurr]
			}
			const res = addRationalStable(
				{ num: 1n, den: fPrev },
				{ num: 1n, den: fCurr }
			)
			assert.deepEqual(res, { num: fPrev + fCurr, den: fPrev * fCurr })
			assertCanonical(res)
		})

		it('satisfies commutativity and associativity', () => {
			const a = { num: -17n, den: 24n }
			const b = { num: 31n, den: 36n }
			const c = { num: 5n, den: -18n }
			assert.deepEqual(addRationalStable(a, b), addRationalStable(b, a))
			assert.deepEqual(
				addRationalStable(addRationalStable(a, b), c),
				addRationalStable(a, addRationalStable(b, c))
			)
		})
	})

	describe('invalid inputs', () => {
		const valid = { num: 1n, den: 2n }

		it('throws TypeError for missing, null, primitive, or array arguments', () => {
			const badValues = [undefined, null, 0, 1, '1/2', true, [1n, 2n], () => {}]
			for (const bad of badValues) {
				assert.throws(() => addRationalStable(bad, valid), TypeError)
				assert.throws(() => addRationalStable(valid, bad), TypeError)
			}
			assert.throws(() => addRationalStable(), TypeError)
			assert.throws(() => addRationalStable(valid), TypeError)
		})

		it('throws TypeError when num or den is missing or not a bigint', () => {
			const badObjects = [
				{},
				{ num: 1n },
				{ den: 2n },
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: 2n },
				{ num: 1n, den: '2' },
				{ num: NaN, den: 1n },
				{ num: 1n, den: Infinity },
				{ num: null, den: 1n },
				{ num: 1n, den: undefined },
			]
			for (const bad of badObjects) {
				assert.throws(() => addRationalStable(bad, valid), TypeError)
				assert.throws(() => addRationalStable(valid, bad), TypeError)
			}
		})

		it('throws RangeError when denominator is zero', () => {
			assert.throws(
				() => addRationalStable({ num: 1n, den: 0n }, valid),
				RangeError
			)
			assert.throws(
				() => addRationalStable(valid, { num: 1n, den: 0n }),
				RangeError
			)
			assert.throws(
				() => addRationalStable({ num: 0n, den: 0n }, valid),
				RangeError
			)
			assert.throws(
				() => addRationalStable(valid, { num: 0n, den: 0n }),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		it('matches independent naive cross-multiplication across deterministic pseudorandom pairs', () => {
			// Deterministic LCG for reproducible coverage
			let state = 0x123456789abcdef1n
			const mod = 1n << 64n
			const nextBig = (bound) => {
				state = (state * 6364136223846793005n + 1442695040888963407n) % mod
				return state % bound
			}

			const factors = [1n, 2n, 3n, 4n, 6n, 12n, 15n, 36n, 60n, 10n ** 15n]

			for (let i = 0; i < 150; i++) {
				const common = factors[i % factors.length]
				const aNum = (nextBig(2001n) - 1000n) * (i % 5 === 0 ? common : 1n)
				const bNum = (nextBig(2001n) - 1000n) * (i % 7 === 0 ? common : 1n)
				const aDenMag = (nextBig(500n) + 1n) * common
				const bDenMag = (nextBig(500n) + 1n) * common
				const a = { num: aNum, den: i % 3 === 0 ? -aDenMag : aDenMag }
				const b = { num: bNum, den: i % 4 === 0 ? -bDenMag : bDenMag }

				const actual = addRationalStable(a, b)
				const expected = naiveAddRational(a, b)

				assertCanonical(actual)
				assert.deepEqual(actual, expected)
				// Cross-multiplication algebraic identity: actual.num * a.den * b.den === (a.num*b.den + b.num*a.den) * actual.den
				assert.equal(
					actual.num * a.den * b.den,
					(a.num * b.den + b.num * a.den) * actual.den
				)
			}
		})

		it('matches closed-form telescoping series sum_{k=1}^{N} 1/(k*(k+1)) = N/(N+1)', () => {
			const N = 120n
			let acc = { num: 0n, den: 1n }
			for (let k = 1n; k <= N; k++) {
				acc = addRationalStable(acc, { num: 1n, den: k * (k + 1n) })
				assertCanonical(acc)
			}
			assert.deepEqual(acc, { num: N, den: N + 1n })
		})

		it('matches closed-form geometric series sum_{k=0}^{N-1} 1/2^k = (2^N - 1)/2^(N-1)', () => {
			const N = 100n
			let acc = { num: 0n, den: 1n }
			let denom = 1n
			for (let k = 0n; k < N; k++) {
				acc = addRationalStable(acc, { num: 1n, den: denom })
				denom *= 2n
			}
			assert.deepEqual(acc, {
				num: (1n << N) - 1n,
				den: 1n << (N - 1n),
			})
			assertCanonical(acc)
		})
	})
})
