import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { powerRationalIterative } from './powerRationalIterative.js'

/**
 * Independent helper: GCD for verifying lowest-terms invariant.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		;[x, y] = [y, x % y]
	}
	return x
}

/**
 * Independent helper: normalize rational to lowest terms with den > 0n.
 * @param {bigint} num
 * @param {bigint} den
 */
function reduce(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Independent helper: exact rational multiplication.
 */
function mulRational(a, b) {
	return reduce(a.num * b.num, a.den * b.den)
}

/**
 * Independent reference implementation using naive repeated multiplication
 * (completely separate from exponentiation by squaring).
 */
function referencePowerNaive(base, exp) {
	const e = BigInt(exp)
	let { num, den } = reduce(base.num, base.den)
	if (e === 0n) return { num: 1n, den: 1n }
	if (num === 0n) {
		if (e < 0n) throw new RangeError('Zero to negative exponent')
		return { num: 0n, den: 1n }
	}
	let steps = e
	if (steps < 0n) {
		;({ num, den } = reduce(den, num))
		steps = -steps
	}
	let acc = { num: 1n, den: 1n }
	for (let i = 0n; i < steps; i++) {
		acc = mulRational(acc, { num, den })
	}
	return acc
}

function assertLowestTerms(result) {
	assert.equal(typeof result.num, 'bigint')
	assert.equal(typeof result.den, 'bigint')
	assert.ok(result.den > 0n, `expected den > 0n, got ${result.den}`)
	if (result.num === 0n) {
		assert.equal(result.den, 1n)
	} else {
		assert.equal(gcd(result.num, result.den), 1n, `expected lowest terms, got ${result.num}/${result.den}`)
	}
}

describe('powerRationalIterative', () => {
	describe('normal cases', () => {
		it('raises positive rationals to positive exponents (BigInt and safe integer)', () => {
			assert.deepEqual(powerRationalIterative({ num: 2n, den: 3n }, 4n), { num: 16n, den: 81n })
			assert.deepEqual(powerRationalIterative({ num: 2n, den: 3n }, 4), { num: 16n, den: 81n })
			assert.deepEqual(powerRationalIterative({ num: 5n, den: 7n }, 1), { num: 5n, den: 7n })
			assert.deepEqual(powerRationalIterative({ num: 3n, den: 2n }, 5n), { num: 243n, den: 32n })
		})

		it('reduces unreduced rational inputs and normalizes negative denominators', () => {
			assert.deepEqual(powerRationalIterative({ num: 4n, den: 6n }, 3), { num: 8n, den: 27n })
			assert.deepEqual(powerRationalIterative({ num: -6n, den: -9n }, 2), { num: 4n, den: 9n })
			assert.deepEqual(powerRationalIterative({ num: 6n, den: -9n }, 3), { num: -8n, den: 27n })
			assert.deepEqual(powerRationalIterative({ num: 6n, den: -9n }, 4), { num: 16n, den: 81n })
		})

		it('handles negative bases with even and odd exponents', () => {
			assert.deepEqual(powerRationalIterative({ num: -2n, den: 3n }, 2), { num: 4n, den: 9n })
			assert.deepEqual(powerRationalIterative({ num: -2n, den: 3n }, 3), { num: -8n, den: 27n })
			assert.deepEqual(powerRationalIterative({ num: -5n, den: 1n }, 3n), { num: -125n, den: 1n })
		})

		it('handles negative exponents with positive, negative, and unreduced bases', () => {
			assert.deepEqual(powerRationalIterative({ num: 2n, den: 3n }, -3), { num: 27n, den: 8n })
			assert.deepEqual(powerRationalIterative({ num: 2n, den: 3n }, -3n), { num: 27n, den: 8n })
			assert.deepEqual(powerRationalIterative({ num: -2n, den: 3n }, -3), { num: -27n, den: 8n })
			assert.deepEqual(powerRationalIterative({ num: -2n, den: 3n }, -2), { num: 9n, den: 4n })
			assert.deepEqual(powerRationalIterative({ num: 4n, den: -6n }, -3), { num: -27n, den: 8n })
			assert.deepEqual(powerRationalIterative({ num: 5n, den: 1n }, -2), { num: 1n, den: 25n })
			assert.deepEqual(powerRationalIterative({ num: 1n, den: 5n }, -3), { num: 125n, den: 1n })
		})

		it('does not mutate the input base object', () => {
			const base = { num: -4n, den: -6n }
			const res = powerRationalIterative(base, -2)
			assert.deepEqual(base, { num: -4n, den: -6n })
			assert.deepEqual(res, { num: 9n, den: 4n })
		})
	})

	describe('edge cases', () => {
		it('evaluates 0^0 as 1/1 for both 0 and 0n and arbitrary non-zero denominators', () => {
			assert.deepEqual(powerRationalIterative({ num: 0n, den: 1n }, 0), { num: 1n, den: 1n })
			assert.deepEqual(powerRationalIterative({ num: 0n, den: 1n }, 0n), { num: 1n, den: 1n })
			assert.deepEqual(powerRationalIterative({ num: 0n, den: 5n }, 0), { num: 1n, den: 1n })
			assert.deepEqual(powerRationalIterative({ num: 0n, den: -7n }, 0n), { num: 1n, den: 1n })
		})

		it('evaluates 0^(positive) as 0/1', () => {
			assert.deepEqual(powerRationalIterative({ num: 0n, den: 1n }, 1), { num: 0n, den: 1n })
			assert.deepEqual(powerRationalIterative({ num: 0n, den: 9n }, 5), { num: 0n, den: 1n })
			assert.deepEqual(powerRationalIterative({ num: 0n, den: -4n }, 100n), { num: 0n, den: 1n })
		})

		it('throws RangeError for zero base with negative exponent', () => {
			assert.throws(() => powerRationalIterative({ num: 0n, den: 1n }, -1), RangeError)
			assert.throws(() => powerRationalIterative({ num: 0n, den: 5n }, -3n), RangeError)
			assert.throws(() => powerRationalIterative({ num: 0n, den: -2n }, -1n), RangeError)
		})

		it('evaluates any non-zero rational to the 0th power as 1/1', () => {
			assert.deepEqual(powerRationalIterative({ num: 7n, den: 11n }, 0), { num: 1n, den: 1n })
			assert.deepEqual(powerRationalIterative({ num: -7n, den: 11n }, 0n), { num: 1n, den: 1n })
			assert.deepEqual(powerRationalIterative({ num: 10n, den: -20n }, 0), { num: 1n, den: 1n })
		})

		it('handles unit rationals 1 and -1 with very large positive and negative exponents', () => {
			const hugeEven = 10n ** 30n
			const hugeOdd = hugeEven + 1n
			assert.deepEqual(powerRationalIterative({ num: 5n, den: 5n }, hugeOdd), { num: 1n, den: 1n })
			assert.deepEqual(powerRationalIterative({ num: -5n, den: -5n }, -hugeOdd), { num: 1n, den: 1n })
			assert.deepEqual(powerRationalIterative({ num: -5n, den: 5n }, hugeEven), { num: 1n, den: 1n })
			assert.deepEqual(powerRationalIterative({ num: 5n, den: -5n }, hugeOdd), { num: -1n, den: 1n })
			assert.deepEqual(powerRationalIterative({ num: -1n, den: 1n }, -hugeOdd), { num: -1n, den: 1n })
			assert.deepEqual(powerRationalIterative({ num: -1n, den: 1n }, -hugeEven), { num: 1n, den: 1n })
		})

		it('computes exact arbitrary-precision powers for large BigInt numerators and denominators', () => {
			const base = { num: 123456789012345678901n, den: 98765432109876543211n }
			const res = powerRationalIterative(base, 7)
			assertLowestTerms(res)
			const norm = reduce(base.num, base.den)
			assert.deepEqual(res, { num: norm.num ** 7n, den: norm.den ** 7n })
		})
	})

	describe('input validation', () => {
		it('throws TypeError for invalid base types or non-BigInt fields', () => {
			const invalidBases = [
				null,
				undefined,
				42,
				'2/3',
				true,
				2n,
				[1n, 2n],
				{},
				{ num: 1n },
				{ den: 2n },
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: 2n },
				{ num: 1n, den: null },
			]
			for (const bad of invalidBases) {
				assert.throws(() => powerRationalIterative(bad, 2), TypeError)
			}
		})

		it('throws RangeError when base.den is 0n (including when exponent is 0)', () => {
			assert.throws(() => powerRationalIterative({ num: 1n, den: 0n }, 2), RangeError)
			assert.throws(() => powerRationalIterative({ num: 0n, den: 0n }, 0), RangeError)
			assert.throws(() => powerRationalIterative({ num: -3n, den: 0n }, 0n), RangeError)
		})

		it('throws TypeError for non-BigInt, non-number exponents', () => {
			const invalidExponents = [null, undefined, '2', {}, [], true, Symbol('e')]
			for (const bad of invalidExponents) {
				assert.throws(() => powerRationalIterative({ num: 2n, den: 3n }, bad), TypeError)
			}
		})

		it('throws RangeError for non-integer, non-finite, or unsafe integer number exponents', () => {
			const invalidNumericExponents = [
				1.5,
				-0.25,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
				Number.MIN_SAFE_INTEGER - 1,
			]
			for (const bad of invalidNumericExponents) {
				assert.throws(() => powerRationalIterative({ num: 2n, den: 3n }, bad), RangeError)
			}
		})
	})

	describe('cross-checks against independent computations and algebraic identities', () => {
		it('matches naive repeated multiplication across a grid of bases and exponents', () => {
			const bases = [
				{ num: 0n, den: 1n },
				{ num: 0n, den: -5n },
				{ num: 1n, den: 1n },
				{ num: -1n, den: 1n },
				{ num: 2n, den: 3n },
				{ num: -2n, den: 3n },
				{ num: 6n, den: -10n },
				{ num: -15n, den: -25n },
				{ num: 7n, den: 4n },
				{ num: 13n, den: 1n },
			]

			for (const base of bases) {
				for (let exp = -10; exp <= 10; exp++) {
					if (base.num === 0n && exp < 0) {
						assert.throws(() => powerRationalIterative(base, exp), RangeError)
						continue
					}
					const expected = referencePowerNaive(base, exp)
					const actualNum = powerRationalIterative(base, exp)
					const actualBig = powerRationalIterative(base, BigInt(exp))
					assertLowestTerms(actualNum)
					assertLowestTerms(actualBig)
					assert.deepEqual(actualNum, expected)
					assert.deepEqual(actualBig, expected)
				}
			}
		})

		it('matches native BigInt exponentiation (**) for larger exponents', () => {
			const base = { num: -18n, den: 24n } // reduces to -3/4
			for (const exp of [0n, 1n, 2n, 15n, 31n, 32n, 33n, 64n]) {
				const actual = powerRationalIterative(base, exp)
				assertLowestTerms(actual)
				assert.deepEqual(actual, { num: (-3n) ** exp, den: 4n ** exp })

				if (exp > 0n) {
					const actualNeg = powerRationalIterative(base, -exp)
					assertLowestTerms(actualNeg)
					const sign = exp % 2n === 0n ? 1n : -1n
					assert.deepEqual(actualNeg, { num: sign * 4n ** exp, den: 3n ** exp })
				}
			}
		})

		it('satisfies exponent laws: r^(a+b) = r^a * r^b and (r^a)^b = r^(a*b)', () => {
			const r = { num: -6n, den: 15n } // -2/5
			const pairs = [
				[3, 5],
				[7, -4],
				[-3, -5],
				[0, 6],
				[-4, 4],
			]
			for (const [a, b] of pairs) {
				const lhsAdd = powerRationalIterative(r, a + b)
				const rhsAdd = mulRational(powerRationalIterative(r, a), powerRationalIterative(r, b))
				assert.deepEqual(lhsAdd, rhsAdd)

				const lhsMul = powerRationalIterative(powerRationalIterative(r, a), b)
				const rhsMul = powerRationalIterative(r, a * b)
				assert.deepEqual(lhsMul, rhsMul)
			}
		})
	})
})
