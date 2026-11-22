import { describe, test } from 'node:test'
import assert from 'node:assert'
import { subtractRationalStable } from './subtractRationalStable.js'

/**
 * Independent binary GCD (Stein's algorithm) used for cross-checking without sharing
 * implementation code with subtractRationalStable.
 */
function steinGcd(uInput, vInput) {
	let u = uInput < 0n ? -uInput : uInput
	let v = vInput < 0n ? -vInput : vInput
	if (u === 0n) return v
	if (v === 0n) return u

	let shift = 0n
	while (((u | v) & 1n) === 0n) {
		u >>= 1n
		v >>= 1n
		shift += 1n
	}
	while ((u & 1n) === 0n) {
		u >>= 1n
	}
	while (v !== 0n) {
		while ((v & 1n) === 0n) {
			v >>= 1n
		}
		if (u > v) {
			const tmp = u
			u = v
			v = tmp
		}
		v -= u
	}
	return u << shift
}

/**
 * Independent naive rational subtraction via direct cross-multiplication and Stein's GCD.
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
	const g = steinGcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Deterministic 64-bit xorshift PRNG for reproducible property-style tests.
 */
function createRng(seed) {
	let state = seed
	return () => {
		state ^= (state << 13n) & ((1n << 64n) - 1n)
		state ^= state >> 7n
		state ^= (state << 17n) & ((1n << 64n) - 1n)
		return state
	}
}

describe('subtractRationalStable', () => {
	describe('normal cases', () => {
		test('subtracts fractions with equal denominators and reduces result', () => {
			assert.deepStrictEqual(
				subtractRationalStable({ num: 3n, den: 4n }, { num: 1n, den: 4n }),
				{ num: 1n, den: 2n }
			)
		})

		test('subtracts fractions with coprime denominators', () => {
			assert.deepStrictEqual(
				subtractRationalStable({ num: 1n, den: 2n }, { num: 1n, den: 3n }),
				{ num: 1n, den: 6n }
			)
			assert.deepStrictEqual(
				subtractRationalStable({ num: 5n, den: 7n }, { num: 2n, den: 5n }),
				{ num: 11n, den: 35n }
			)
		})

		test('subtracts fractions with shared denominator factors', () => {
			assert.deepStrictEqual(
				subtractRationalStable({ num: 5n, den: 12n }, { num: 1n, den: 8n }),
				{ num: 7n, den: 24n }
			)
			assert.deepStrictEqual(
				subtractRationalStable({ num: 7n, den: 30n }, { num: 1n, den: 42n }),
				{ num: 22n, den: 105n }
			)
			// Triggers secondary GCD reduction (g2 > 1n): 7/12 - 1/12 = 6/12 = 1/2
			assert.deepStrictEqual(
				subtractRationalStable({ num: 7n, den: 12n }, { num: 1n, den: 12n }),
				{ num: 1n, den: 2n }
			)
		})

		test('handles negative results and negative numerators/denominators', () => {
			assert.deepStrictEqual(
				subtractRationalStable({ num: 1n, den: 3n }, { num: 1n, den: 2n }),
				{ num: -1n, den: 6n }
			)
			assert.deepStrictEqual(
				subtractRationalStable({ num: -3n, den: 4n }, { num: 1n, den: 4n }),
				{ num: -1n, den: 1n }
			)
			assert.deepStrictEqual(
				subtractRationalStable({ num: 1n, den: 4n }, { num: -3n, den: 4n }),
				{ num: 1n, den: 1n }
			)
			assert.deepStrictEqual(
				subtractRationalStable({ num: 1n, den: -2n }, { num: -1n, den: -3n }),
				{ num: -5n, den: 6n }
			)
			assert.deepStrictEqual(
				subtractRationalStable({ num: -2n, den: -6n }, { num: 1n, den: -3n }),
				{ num: 2n, den: 3n }
			)
		})

		test('normalizes unreduced inputs and does not mutate operands', () => {
			const a = Object.freeze({ num: 6n, den: 8n })
			const b = Object.freeze({ num: 3n, den: 12n })
			const result = subtractRationalStable(a, b)
			assert.deepStrictEqual(result, { num: 1n, den: 2n })

			const zero = Object.freeze({ num: 0n, den: 5n })
			const copy = subtractRationalStable(a, zero)
			assert.deepStrictEqual(copy, { num: 3n, den: 4n })
			assert.notStrictEqual(copy, a)
		})
	})

	describe('edge cases', () => {
		test('handles zero operands canonically as { num: 0n, den: 1n }', () => {
			assert.deepStrictEqual(
				subtractRationalStable({ num: 0n, den: 1n }, { num: 0n, den: 1n }),
				{ num: 0n, den: 1n }
			)
			assert.deepStrictEqual(
				subtractRationalStable({ num: 0n, den: 9n }, { num: 0n, den: -7n }),
				{ num: 0n, den: 1n }
			)
			assert.deepStrictEqual(
				subtractRationalStable({ num: 0n, den: 7n }, { num: 4n, den: -6n }),
				{ num: 2n, den: 3n }
			)
			assert.deepStrictEqual(
				subtractRationalStable({ num: -4n, den: -6n }, { num: 0n, den: 99n }),
				{ num: 2n, den: 3n }
			)
		})

		test('handles exact self-cancellation including unreduced equivalents', () => {
			assert.deepStrictEqual(
				subtractRationalStable({ num: 6n, den: 9n }, { num: 2n, den: 3n }),
				{ num: 0n, den: 1n }
			)
			assert.deepStrictEqual(
				subtractRationalStable({ num: 2n, den: -3n }, { num: -4n, den: 6n }),
				{ num: 0n, den: 1n }
			)
		})

		test('avoids catastrophic cancellation for nearly equal high-precision rationals', () => {
			const scale = 10n ** 100n
			// (10^100 / (10^100 + 1)) - ((10^100 - 1) / 10^100) = 1 / (10^100 * (10^100 + 1))
			const res = subtractRationalStable(
				{ num: scale, den: scale + 1n },
				{ num: scale - 1n, den: scale }
			)
			assert.deepStrictEqual(res, {
				num: 1n,
				den: scale * (scale + 1n)
			})
		})

		test('scales large shared denominator factors cleanly and handles worst-case Fibonacci GCDs', () => {
			const hugePower = 1n << 256n
			const res = subtractRationalStable(
				{ num: 3n, den: 5n * hugePower },
				{ num: 1n, den: 5n * hugePower }
			)
			assert.deepStrictEqual(res, {
				num: 1n,
				den: 5n * (1n << 255n)
			})

			// Large consecutive Fibonacci numbers (worst case for Euclidean GCD steps)
			// With F_1 = 1, F_2 = 1: F_{n+1} * F_{n-1} - F_n^2 = (-1)^n (Cassini's identity)
			let fPrev = 1n // F_1
			let fCurr = 1n // F_2
			for (let i = 3; i <= 501; i += 1) {
				const next = fPrev + fCurr
				fPrev = fCurr
				fCurr = next
			}
			const f501 = fCurr
			const f500 = fPrev
			const f499 = f501 - f500
			const fibDiff = subtractRationalStable(
				{ num: f501, den: f500 },
				{ num: f500, den: f499 }
			)
			assert.deepStrictEqual(fibDiff, {
				num: 1n,
				den: f500 * f499
			})
		})
	})

	describe('invalid inputs', () => {
		const invalidValues = [
			undefined,
			null,
			42,
			'1/2',
			1n,
			true,
			[1n, 2n],
			{},
			{ num: 1n },
			{ den: 2n },
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: Number.NaN, den: 1n },
			{ num: 1n, den: Number.POSITIVE_INFINITY },
			{ num: '1', den: '2' }
		]

		test('throws TypeError for malformed operand a or b', () => {
			const valid = { num: 1n, den: 2n }
			for (const bad of invalidValues) {
				assert.throws(
					() => subtractRationalStable(/** @type {any} */ (bad), valid),
					TypeError
				)
				assert.throws(
					() => subtractRationalStable(valid, /** @type {any} */ (bad)),
					TypeError
				)
			}
		})

		test('throws RangeError for zero denominators', () => {
			const valid = { num: 1n, den: 2n }
			assert.throws(
				() => subtractRationalStable({ num: 1n, den: 0n }, valid),
				RangeError
			)
			assert.throws(
				() => subtractRationalStable({ num: 0n, den: 0n }, valid),
				RangeError
			)
			assert.throws(
				() => subtractRationalStable(valid, { num: 1n, den: 0n }),
				RangeError
			)
			assert.throws(
				() => subtractRationalStable(valid, { num: 0n, den: 0n }),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		test('matches independent naive subtraction + Stein GCD and algebraic invariants across 250 random pairs', () => {
			const nextRand = createRng(0x5eed_cafe_beef_1234n)
			const randSigned = (maxAbs) => {
				const raw = nextRand() % (2n * maxAbs + 1n)
				return raw - maxAbs
			}
			const randNonZero = (maxAbs) => {
				let v = randSigned(maxAbs)
				if (v === 0n) v = 1n
				return v
			}

			for (let i = 0; i < 250; i += 1) {
				// Mix small, medium, shared-factor, and large BigInt operands
				const commonFactor = i % 3 === 0 ? (nextRand() % 5000n) + 2n : 1n
				const bound = i % 5 === 0 ? 10n ** 18n : 1000n
				const a = {
					num: randSigned(bound),
					den: randNonZero(bound) * commonFactor
				}
				const b = {
					num: randSigned(bound),
					den: randNonZero(bound) * commonFactor
				}

				const actual = subtractRationalStable(a, b)
				const expected = naiveSubtract(a, b)

				assert.deepStrictEqual(actual, expected)
				assert.ok(actual.den > 0n, 'denominator must be strictly positive')
				assert.strictEqual(
					steinGcd(actual.num, actual.den),
					1n,
					'result must be in lowest terms'
				)
				if (actual.num === 0n) {
					assert.strictEqual(actual.den, 1n)
				}

				// Exact cross-multiplication identity
				assert.strictEqual(
					actual.num * a.den * b.den,
					(a.num * b.den - b.num * a.den) * actual.den
				)

				// Anticommutativity: a - b === -(b - a)
				const reversed = subtractRationalStable(b, a)
				assert.deepStrictEqual(actual, {
					num: -reversed.num,
					den: reversed.den
				})
			}
		})

		test('satisfies exact telescoping series identity sum_{k=1}^{40} (1/k - 1/(k+1)) === 40/41', () => {
			// Verify each term 1/k - 1/(k+1) === 1/(k*(k+1)) and accumulate via double subtraction
			let total = { num: 0n, den: 1n }
			for (let k = 1n; k <= 40n; k += 1n) {
				const term = subtractRationalStable(
					{ num: 1n, den: k },
					{ num: 1n, den: k + 1n }
				)
				assert.deepStrictEqual(term, { num: 1n, den: k * (k + 1n) })
				// total + term === total - (-term)
				total = subtractRationalStable(total, { num: -term.num, den: term.den })
			}
			assert.deepStrictEqual(total, { num: 40n, den: 41n })
		})

		test('agrees exactly with IEEE-754 float64 on exact dyadic rationals', () => {
			for (let k = 0; k <= 12; k += 1) {
				const denA = 1n << BigInt(k)
				const denB = 1n << BigInt(12 - k)
				const a = { num: BigInt(k * 7 - 20), den: denA }
				const b = { num: BigInt(k * 3 - 5), den: denB }
				const res = subtractRationalStable(a, b)
				const expectedFloat =
					Number(a.num) / Number(a.den) - Number(b.num) / Number(b.den)
				assert.strictEqual(Number(res.num) / Number(res.den), expectedFloat)
			}
		})
	})
})
