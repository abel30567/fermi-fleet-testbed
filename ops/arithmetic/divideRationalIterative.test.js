import { describe, test } from 'node:test'
import assert from 'node:assert'
import { divideRationalIterative } from './divideRationalIterative.js'

/**
 * Independent Stein's binary GCD algorithm (uses only bit shifts and subtraction)
 * for cross-checking reduction to lowest terms.
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
 * Independent rational division using Stein's binary GCD.
 */
function referenceDivideRational(a, b) {
	let num = a.num * b.den
	let den = a.den * b.num
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = binaryGcd(num, den)
	return { num: num / g, den: den / g }
}

describe('divideRationalIterative', () => {
	describe('normal cases', () => {
		test('divides simple positive fractions and reduces to lowest terms', () => {
			assert.deepStrictEqual(
				divideRationalIterative({ num: 1n, den: 2n }, { num: 3n, den: 4n }),
				{ num: 2n, den: 3n }
			)
			assert.deepStrictEqual(
				divideRationalIterative({ num: 5n, den: 6n }, { num: 10n, den: 9n }),
				{ num: 3n, den: 4n }
			)
		})

		test('divides integer-valued rationals', () => {
			assert.deepStrictEqual(
				divideRationalIterative({ num: 12n, den: 1n }, { num: 4n, den: 1n }),
				{ num: 3n, den: 1n }
			)
			assert.deepStrictEqual(
				divideRationalIterative({ num: 7n, den: 1n }, { num: 3n, den: 1n }),
				{ num: 7n, den: 3n }
			)
		})

		test('identity and self-division properties', () => {
			assert.deepStrictEqual(
				divideRationalIterative({ num: 5n, den: 7n }, { num: 1n, den: 1n }),
				{ num: 5n, den: 7n }
			)
			assert.deepStrictEqual(
				divideRationalIterative({ num: 17n, den: 23n }, { num: 17n, den: 23n }),
				{ num: 1n, den: 1n }
			)
			assert.deepStrictEqual(
				divideRationalIterative({ num: 1n, den: 1n }, { num: 7n, den: 13n }),
				{ num: 13n, den: 7n }
			)
		})

		test('normalizes unreduced inputs', () => {
			assert.deepStrictEqual(
				divideRationalIterative({ num: 4n, den: 6n }, { num: 8n, den: 9n }),
				{ num: 3n, den: 4n }
			)
		})

		test('does not mutate input objects', () => {
			const a = { num: -6n, den: -9n }
			const b = { num: 4n, den: -10n }
			const result = divideRationalIterative(a, b)
			assert.deepStrictEqual(result, { num: -5n, den: 3n })
			assert.deepStrictEqual(a, { num: -6n, den: -9n })
			assert.deepStrictEqual(b, { num: 4n, den: -10n })
		})
	})

	describe('edge cases', () => {
		test('zero numerator dividend always normalizes to { num: 0n, den: 1n }', () => {
			assert.deepStrictEqual(
				divideRationalIterative({ num: 0n, den: 5n }, { num: 3n, den: 7n }),
				{ num: 0n, den: 1n }
			)
			assert.deepStrictEqual(
				divideRationalIterative({ num: 0n, den: -5n }, { num: -3n, den: 7n }),
				{ num: 0n, den: 1n }
			)
		})

		test('division by zero throws RangeError', () => {
			assert.throws(
				() => divideRationalIterative({ num: 1n, den: 2n }, { num: 0n, den: 1n }),
				RangeError
			)
			assert.throws(
				() => divideRationalIterative({ num: 0n, den: 1n }, { num: 0n, den: 5n }),
				RangeError
			)
			assert.throws(
				() => divideRationalIterative({ num: -3n, den: 4n }, { num: 0n, den: -9n }),
				RangeError
			)
		})

		test('handles all sign combinations and guarantees den > 0n', () => {
			const cases = [
				[{ num: -3n, den: 4n }, { num: 2n, den: 5n }, { num: -15n, den: 8n }],
				[{ num: 3n, den: 4n }, { num: -2n, den: 5n }, { num: -15n, den: 8n }],
				[{ num: -3n, den: 4n }, { num: -2n, den: 5n }, { num: 15n, den: 8n }],
				[{ num: 3n, den: -4n }, { num: 2n, den: 5n }, { num: -15n, den: 8n }],
				[{ num: 3n, den: 4n }, { num: 2n, den: -5n }, { num: -15n, den: 8n }],
				[{ num: 3n, den: -4n }, { num: -2n, den: 5n }, { num: 15n, den: 8n }],
				[{ num: -3n, den: -4n }, { num: -2n, den: -5n }, { num: 15n, den: 8n }],
			]

			for (const [a, b, expected] of cases) {
				const res = divideRationalIterative(a, b)
				assert.deepStrictEqual(res, expected)
				assert.strictEqual(res.den > 0n, true)
			}
		})

		test('handles very large BigInts accurately without precision loss or stack overflow', () => {
			const commonFactor = 10n ** 60n + 7n
			const p = 2n ** 200n + 153n
			const q = 3n ** 130n + 11n
			const a = { num: p * commonFactor, den: 5n ** 80n }
			const b = { num: q * commonFactor, den: 5n ** 40n }

			const res = divideRationalIterative(a, b)
			const expected = referenceDivideRational(a, b)
			assert.deepStrictEqual(res, expected)
			assert.strictEqual(res.den > 0n, true)
			assert.strictEqual(binaryGcd(res.num, res.den), 1n)
			assert.strictEqual(res.num * b.num * a.den, a.num * b.den * res.den)
		})

		test('handles large consecutive Fibonacci numbers (worst-case Euclidean iterations)', () => {
			let fPrev = 0n
			let fCurr = 1n
			for (let i = 0; i < 400; i++) {
				const next = fPrev + fCurr
				fPrev = fCurr
				fCurr = next
			}
			// F_401 and F_400 are coprime; multiplying both by a shared factor tests full reduction
			const k = 123456789012345678901234567890n
			const res = divideRationalIterative(
				{ num: fCurr * k, den: 1n },
				{ num: fPrev * k, den: 1n }
			)
			assert.deepStrictEqual(res, { num: fCurr, den: fPrev })
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-object or array operands', () => {
			const valid = { num: 1n, den: 2n }
			const invalidOperands = [null, undefined, 42, 42n, '1/2', true, [1n, 2n]]

			for (const bad of invalidOperands) {
				assert.throws(() => divideRationalIterative(bad, valid), TypeError)
				assert.throws(() => divideRationalIterative(valid, bad), TypeError)
			}
		})

		test('throws TypeError when num or den is missing or not a BigInt', () => {
			const valid = { num: 1n, den: 2n }
			const invalidRationals = [
				{},
				{ num: 1n },
				{ den: 2n },
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: 2n },
				{ num: 1n, den: '2' },
				{ num: NaN, den: 2n },
				{ num: 1n, den: null },
			]

			for (const bad of invalidRationals) {
				assert.throws(() => divideRationalIterative(bad, valid), TypeError)
				assert.throws(() => divideRationalIterative(valid, bad), TypeError)
			}
		})

		test('throws RangeError when either denominator is 0n', () => {
			assert.throws(
				() => divideRationalIterative({ num: 1n, den: 0n }, { num: 1n, den: 2n }),
				RangeError
			)
			assert.throws(
				() => divideRationalIterative({ num: 1n, den: 2n }, { num: 1n, den: 0n }),
				RangeError
			)
			assert.throws(
				() => divideRationalIterative({ num: 0n, den: 0n }, { num: 1n, den: 2n }),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		test('matches independent Stein binary GCD implementation and algebraic invariants across a grid', () => {
			const nums = [-120n, -17n, -6n, -1n, 0n, 1n, 6n, 17n, 120n]
			const dens = [-36n, -7n, -1n, 1n, 7n, 36n]

			const rationals = []
			for (const num of nums) {
				for (const den of dens) {
					rationals.push({ num, den })
				}
			}

			for (const a of rationals) {
				for (const b of rationals) {
					if (b.num === 0n) continue
					const actual = divideRationalIterative(a, b)
					const expected = referenceDivideRational(a, b)

					assert.deepStrictEqual(actual, expected)
					assert.strictEqual(actual.den > 0n, true)
					assert.strictEqual(binaryGcd(actual.num, actual.den), 1n)
					// Algebraic identity: (a / b) * b === a
					assert.strictEqual(actual.num * b.num * a.den, a.num * b.den * actual.den)
					// Floating-point cross-check for small values
					const approxActual = Number(actual.num) / Number(actual.den)
					const approxExpected =
						(Number(a.num) / Number(a.den)) / (Number(b.num) / Number(b.den))
					assert.ok(Math.abs(approxActual - approxExpected) < 1e-12)
				}
			}
		})
	})
})
