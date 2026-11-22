import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { addRationalIterative } from './addRationalIterative.js'

/**
 * Independent recursive GCD used only for test verification.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function recursiveGcd(a, b) {
	const x = a < 0n ? -a : a
	const y = b < 0n ? -b : b
	return y === 0n ? x : recursiveGcd(y, x % y)
}

describe('addRationalIterative', () => {
	describe('normal cases', () => {
		it('adds rationals with the same denominator', () => {
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: 3n }, { num: 1n, den: 3n }),
				{ num: 2n, den: 3n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: 4n }, { num: 3n, den: 4n }),
				{ num: 1n, den: 1n },
			)
		})

		it('adds rationals with coprime denominators', () => {
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: 2n }, { num: 1n, den: 3n }),
				{ num: 5n, den: 6n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 2n, den: 5n }, { num: 3n, den: 7n }),
				{ num: 29n, den: 35n },
			)
		})

		it('reduces sums with common factors to lowest terms', () => {
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: 6n }, { num: 1n, den: 3n }),
				{ num: 1n, den: 2n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 5n, den: 12n }, { num: 7n, den: 12n }),
				{ num: 1n, den: 1n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 5n, den: 18n }, { num: 7n, den: 18n }),
				{ num: 2n, den: 3n },
			)
		})

		it('adds integer-valued rationals', () => {
			assert.deepEqual(
				addRationalIterative({ num: 3n, den: 1n }, { num: 4n, den: 1n }),
				{ num: 7n, den: 1n },
			)
		})
	})

	describe('edge cases', () => {
		it('handles zeros and additive inverses', () => {
			assert.deepEqual(
				addRationalIterative({ num: 0n, den: 1n }, { num: 0n, den: 1n }),
				{ num: 0n, den: 1n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 0n, den: 5n }, { num: 3n, den: 4n }),
				{ num: 3n, den: 4n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 3n, den: 4n }, { num: 0n, den: -7n }),
				{ num: 3n, den: 4n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 5n, den: 7n }, { num: -5n, den: 7n }),
				{ num: 0n, den: 1n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 5n, den: 7n }, { num: 5n, den: -7n }),
				{ num: 0n, den: 1n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 0n, den: -9n }, { num: 0n, den: -3n }),
				{ num: 0n, den: 1n },
			)
		})

		it('handles negative numerators and denominators with positive output denominator', () => {
			assert.deepEqual(
				addRationalIterative({ num: -3n, den: 4n }, { num: 1n, den: 2n }),
				{ num: -1n, den: 4n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: -4n }, { num: 1n, den: -4n }),
				{ num: -1n, den: 2n },
			)
			assert.deepEqual(
				addRationalIterative({ num: -1n, den: -2n }, { num: -1n, den: -3n }),
				{ num: 5n, den: 6n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: -3n }, { num: -1n, den: 6n }),
				{ num: -1n, den: 2n },
			)
		})

		it('normalizes unreduced inputs', () => {
			assert.deepEqual(
				addRationalIterative({ num: 6n, den: 9n }, { num: 10n, den: 15n }),
				{ num: 4n, den: 3n },
			)
			assert.deepEqual(
				addRationalIterative({ num: -100n, den: -200n }, { num: 50n, den: 100n }),
				{ num: 1n, den: 1n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 24n, den: -36n }, { num: 0n, den: 99n }),
				{ num: -2n, den: 3n },
			)
		})

		it('handles very large BigInts without precision loss', () => {
			const big = 10n ** 50n
			const a = { num: big + 1n, den: big }
			const b = { num: big - 1n, den: big }
			assert.deepEqual(addRationalIterative(a, b), { num: 2n, den: 1n })

			const p = 100000000000000000000000000000000000000003n
			const q = 100000000000000000000000000000000000000007n
			const sum = addRationalIterative({ num: 1n, den: p }, { num: 1n, den: q })
			assert.deepEqual(sum, { num: p + q, den: p * q })
			assert.equal(recursiveGcd(sum.num, sum.den), 1n)
			assert.ok(sum.den > 0n)
		})

		it('does not mutate inputs', () => {
			const a = { num: 6n, den: -8n }
			const b = { num: 10n, den: 20n }
			const result = addRationalIterative(a, b)
			assert.deepEqual(a, { num: 6n, den: -8n })
			assert.deepEqual(b, { num: 10n, den: 20n })
			assert.notEqual(result, a)
			assert.notEqual(result, b)
			assert.deepEqual(result, { num: -1n, den: 4n })
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-object or null/array arguments', () => {
			const valid = { num: 1n, den: 2n }
			const invalidInputs = [null, undefined, 1, '1/2', true, 1n, [1n, 2n]]

			for (const bad of invalidInputs) {
				assert.throws(() => addRationalIterative(bad, valid), TypeError)
				assert.throws(() => addRationalIterative(valid, bad), TypeError)
			}
		})

		it('throws TypeError when num or den is not a BigInt', () => {
			const valid = { num: 1n, den: 2n }
			const badFields = [
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: 2n },
				{ num: 1n, den: '2' },
				{ num: undefined, den: 2n },
				{ num: 1n, den: null },
				{ num: NaN, den: 2n },
				{},
			]

			for (const bad of badFields) {
				assert.throws(() => addRationalIterative(bad, valid), TypeError)
				assert.throws(() => addRationalIterative(valid, bad), TypeError)
			}
		})

		it('throws RangeError when denominator is 0n', () => {
			const valid = { num: 1n, den: 2n }
			assert.throws(() => addRationalIterative({ num: 1n, den: 0n }, valid), RangeError)
			assert.throws(() => addRationalIterative(valid, { num: 1n, den: 0n }), RangeError)
			assert.throws(() => addRationalIterative({ num: 0n, den: 0n }, valid), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches closed-form telescoping series sum_{k=1}^N 1/(k*(k+1)) = N/(N+1)', () => {
			const N = 60n
			let acc = { num: 0n, den: 1n }
			for (let k = 1n; k <= N; k += 1n) {
				acc = addRationalIterative(acc, { num: 1n, den: k * (k + 1n) })
			}
			assert.deepEqual(acc, { num: N, den: N + 1n })
		})

		it('agrees with exact cross-multiplication, recursive GCD, commutativity, and IEEE-754 float reference across a grid', () => {
			const nums = [-5n, -2n, 0n, 3n, 6n]
			const dens = [-4n, -3n, -1n, 1n, 2n, 6n]

			const rationals = []
			for (const num of nums) {
				for (const den of dens) {
					rationals.push({ num, den })
				}
			}

			for (const a of rationals) {
				for (const b of rationals) {
					const ab = addRationalIterative(a, b)
					const ba = addRationalIterative(b, a)

					// Commutativity
					assert.deepEqual(ab, ba)

					// Canonical lowest terms: den > 0n and gcd(|num|, den) === 1n
					assert.ok(ab.den > 0n)
					assert.equal(recursiveGcd(ab.num, ab.den), 1n)
					if (ab.num === 0n) {
						assert.equal(ab.den, 1n)
					}

					// Exact cross-multiplication identity: ab.num / ab.den == (a.num*b.den + b.num*a.den) / (a.den*b.den)
					assert.equal(
						ab.num * a.den * b.den,
						ab.den * (a.num * b.den + b.num * a.den),
					)

					// Independent floating-point reference check
					const expectedFloat = Number(a.num) / Number(a.den) + Number(b.num) / Number(b.den)
					const actualFloat = Number(ab.num) / Number(ab.den)
					assert.ok(Math.abs(actualFloat - expectedFloat) < 1e-12)
				}
			}
		})
	})
})
