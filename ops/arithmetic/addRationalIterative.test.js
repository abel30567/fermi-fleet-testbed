import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { addRationalIterative } from './addRationalIterative.js'

/**
 * Independent binary GCD (Stein's algorithm) used solely for test cross-checks.
 *
 * @param {bigint} u
 * @param {bigint} v
 * @returns {bigint}
 */
function binaryGcd(u, v) {
	let a = u < 0n ? -u : u
	let b = v < 0n ? -v : v
	if (a === 0n) return b
	if (b === 0n) return a

	let shift = 0n
	while (((a | b) & 1n) === 0n) {
		a >>= 1n
		b >>= 1n
		shift += 1n
	}
	while ((a & 1n) === 0n) {
		a >>= 1n
	}
	do {
		while ((b & 1n) === 0n) {
			b >>= 1n
		}
		if (a > b) {
			const tmp = a
			a = b
			b = tmp
		}
		b -= a
	} while (b !== 0n)

	return a << shift
}

/**
 * Assert that a rational result is in canonical lowest terms and equals `a + b`
 * by exact cross-multiplication.
 */
function assertCanonicalSum(a, b, result) {
	assert.equal(typeof result.num, 'bigint')
	assert.equal(typeof result.den, 'bigint')
	assert.ok(result.den > 0n, `expected positive denominator, got ${result.den}`)
	if (result.num === 0n) {
		assert.equal(result.den, 1n)
	} else {
		assert.equal(binaryGcd(result.num, result.den), 1n, 'result must be in lowest terms')
	}
	// Cross-multiplication exactness check: result.num / result.den === (a.num*b.den + b.num*a.den) / (a.den*b.den)
	assert.equal(
		result.num * a.den * b.den,
		result.den * (a.num * b.den + b.num * a.den),
	)
}

describe('addRationalIterative', () => {
	describe('normal cases', () => {
		it('adds fractions with the same denominator without reduction', () => {
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: 5n }, { num: 2n, den: 5n }),
				{ num: 3n, den: 5n },
			)
		})

		it('adds fractions with the same denominator and reduces to lowest terms', () => {
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: 4n }, { num: 1n, den: 4n }),
				{ num: 1n, den: 2n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: 6n }, { num: 2n, den: 6n }),
				{ num: 1n, den: 2n },
			)
		})

		it('adds fractions with coprime denominators', () => {
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: 2n }, { num: 1n, den: 3n }),
				{ num: 5n, den: 6n },
			)
		})

		it('adds fractions whose denominators share common factors', () => {
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: 6n }, { num: 1n, den: 10n }),
				{ num: 4n, den: 15n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 5n, den: 12n }, { num: 7n, den: 18n }),
				{ num: 29n, den: 36n },
			)
		})

		it('handles sums that simplify to integers', () => {
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: 3n }, { num: 2n, den: 3n }),
				{ num: 1n, den: 1n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 5n, den: 4n }, { num: 7n, den: 4n }),
				{ num: 3n, den: 1n },
			)
		})

		it('handles negative numerators', () => {
			assert.deepEqual(
				addRationalIterative({ num: -1n, den: 2n }, { num: 1n, den: 3n }),
				{ num: -1n, den: 6n },
			)
			assert.deepEqual(
				addRationalIterative({ num: -1n, den: 2n }, { num: -1n, den: 3n }),
				{ num: -5n, den: 6n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 3n, den: 4n }, { num: -1n, den: 4n }),
				{ num: 1n, den: 2n },
			)
		})
	})

	describe('edge cases', () => {
		it('handles additive identity (zero)', () => {
			assert.deepEqual(
				addRationalIterative({ num: 0n, den: 1n }, { num: 3n, den: 7n }),
				{ num: 3n, den: 7n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 3n, den: 7n }, { num: 0n, den: 1n }),
				{ num: 3n, den: 7n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 0n, den: 1n }, { num: 0n, den: 1n }),
				{ num: 0n, den: 1n },
			)
		})

		it('normalizes zero with non-unit or negative denominators', () => {
			assert.deepEqual(
				addRationalIterative({ num: 0n, den: 5n }, { num: 0n, den: -9n }),
				{ num: 0n, den: 1n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 0n, den: -3n }, { num: 2n, den: 4n }),
				{ num: 1n, den: 2n },
			)
		})

		it('returns canonical zero when additive inverses cancel', () => {
			assert.deepEqual(
				addRationalIterative({ num: 3n, den: 7n }, { num: -3n, den: 7n }),
				{ num: 0n, den: 1n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 2n, den: 4n }, { num: -3n, den: 6n }),
				{ num: 0n, den: 1n },
			)
		})

		it('normalizes negative denominators in inputs', () => {
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: -2n }, { num: 1n, den: 3n }),
				{ num: -1n, den: 6n },
			)
			assert.deepEqual(
				addRationalIterative({ num: -1n, den: -2n }, { num: -1n, den: -3n }),
				{ num: 5n, den: 6n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 1n, den: -4n }, { num: -1n, den: 4n }),
				{ num: -1n, den: 2n },
			)
		})

		it('reduces unreduced inputs cleanly', () => {
			assert.deepEqual(
				addRationalIterative({ num: 6n, den: 9n }, { num: 10n, den: 15n }),
				{ num: 4n, den: 3n },
			)
			assert.deepEqual(
				addRationalIterative({ num: 100n, den: 200n }, { num: 300n, den: 600n }),
				{ num: 1n, den: 1n },
			)
		})

		it('handles very large BigInts and deep Euclidean reductions iteratively', () => {
			// Generate consecutive large Fibonacci numbers (worst case for Euclidean algorithm)
			let fPrev = 1n
			let fCurr = 1n
			for (let i = 0; i < 500; i++) {
				const next = fPrev + fCurr
				fPrev = fCurr
				fCurr = next
			}
			const scale = 10n ** 40n
			const a = { num: fPrev * scale, den: fCurr * scale }
			const b = { num: (fCurr - fPrev) * scale, den: fCurr * scale }
			const sum = addRationalIterative(a, b)
			assert.deepEqual(sum, { num: 1n, den: 1n })

			const bigA = { num: 10n ** 80n + 1n, den: 10n ** 80n }
			const bigB = { num: 10n ** 80n - 1n, den: 10n ** 80n }
			assert.deepEqual(addRationalIterative(bigA, bigB), { num: 2n, den: 1n })
		})

		it('does not mutate input objects', () => {
			const a = Object.freeze({ num: -2n, den: -4n })
			const b = Object.freeze({ num: 3n, den: -6n })
			const result = addRationalIterative(a, b)
			assert.deepEqual(result, { num: 0n, den: 1n })
			assert.notEqual(result, a)
			assert.notEqual(result, b)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when arguments are missing or non-objects', () => {
			const valid = { num: 1n, den: 2n }
			const invalidValues = [undefined, null, 0, 1, '1/2', true, 1n, [1n, 2n], () => {}]
			for (const bad of invalidValues) {
				assert.throws(() => addRationalIterative(bad, valid), TypeError)
				assert.throws(() => addRationalIterative(valid, bad), TypeError)
			}
			assert.throws(() => addRationalIterative(), TypeError)
			assert.throws(() => addRationalIterative(valid), TypeError)
		})

		it('throws TypeError when num or den is missing or not a bigint', () => {
			const valid = { num: 1n, den: 2n }
			const badRationals = [
				{},
				{ num: 1n },
				{ den: 2n },
				{ num: 1, den: 2 },
				{ num: 1n, den: 2 },
				{ num: 1, den: 2n },
				{ num: '1', den: 2n },
				{ num: 1n, den: '2' },
				{ num: NaN, den: 1n },
				{ num: 1n, den: null },
				{ num: undefined, den: 1n },
			]
			for (const bad of badRationals) {
				assert.throws(() => addRationalIterative(bad, valid), TypeError)
				assert.throws(() => addRationalIterative(valid, bad), TypeError)
			}
		})

		it('throws RangeError when either denominator is 0n', () => {
			const valid = { num: 1n, den: 2n }
			assert.throws(() => addRationalIterative({ num: 1n, den: 0n }, valid), RangeError)
			assert.throws(() => addRationalIterative(valid, { num: 1n, den: 0n }), RangeError)
			assert.throws(() => addRationalIterative({ num: 0n, den: 0n }, valid), RangeError)
			assert.throws(() => addRationalIterative(valid, { num: 0n, den: 0n }), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies telescoping series identity sum_{k=1}^{N} 1/(k(k+1)) === N/(N+1)', () => {
			const N = 100n
			let acc = { num: 0n, den: 1n }
			for (let k = 1n; k <= N; k++) {
				const term = { num: 1n, den: k * (k + 1n) }
				const next = addRationalIterative(acc, term)
				assertCanonicalSum(acc, term, next)
				acc = next
			}
			assert.deepEqual(acc, { num: N, den: N + 1n })
		})

		it('satisfies commutativity, associativity, inverse, and floating-point agreement', () => {
			const samples = [
				{ num: 0n, den: 1n },
				{ num: 1n, den: 2n },
				{ num: -3n, den: 4n },
				{ num: 5n, den: -6n },
				{ num: 14n, den: 21n },
				{ num: -22n, den: -33n },
				{ num: 7n, den: 15n },
			]

			for (const a of samples) {
				for (const b of samples) {
					const ab = addRationalIterative(a, b)
					const ba = addRationalIterative(b, a)
					assertCanonicalSum(a, b, ab)
					assert.deepEqual(ab, ba)

					// Cross-check against IEEE-754 floating point within tolerance
					const expectedFloat = Number(a.num) / Number(a.den) + Number(b.num) / Number(b.den)
					const actualFloat = Number(ab.num) / Number(ab.den)
					assert.ok(
						Math.abs(actualFloat - expectedFloat) < 1e-12,
						`float mismatch: ${actualFloat} vs ${expectedFloat}`,
					)

					// Additive inverse recovery: (a + b) + (-b) === normalize(a)
					const negB = { num: -b.num, den: b.den }
					const recovered = addRationalIterative(ab, negB)
					const normalizedA = addRationalIterative(a, { num: 0n, den: 1n })
					assert.deepEqual(recovered, normalizedA)
				}
			}

			// Associativity check on triples
			for (let i = 0; i < samples.length; i++) {
				const a = samples[i]
				const b = samples[(i + 2) % samples.length]
				const c = samples[(i + 5) % samples.length]
				const left = addRationalIterative(addRationalIterative(a, b), c)
				const right = addRationalIterative(a, addRationalIterative(b, c))
				assert.deepEqual(left, right)
			}
		})
	})
})
