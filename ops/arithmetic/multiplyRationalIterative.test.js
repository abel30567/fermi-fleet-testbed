import { describe, test } from 'node:test'
import assert from 'node:assert'
import { multiplyRationalIterative } from './multiplyRationalIterative.js'

/**
 * Independent recursive binary GCD (Stein's algorithm) for cross-checking
 * without sharing the iterative Euclidean implementation.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function binaryGcd(a, b) {
	let u = a < 0n ? -a : a
	let v = b < 0n ? -b : b
	if (u === 0n) return v
	if (v === 0n) return u
	if ((u & 1n) === 0n && (v & 1n) === 0n) return binaryGcd(u >> 1n, v >> 1n) << 1n
	if ((u & 1n) === 0n) return binaryGcd(u >> 1n, v)
	if ((v & 1n) === 0n) return binaryGcd(u, v >> 1n)
	return u >= v ? binaryGcd((u - v) >> 1n, v) : binaryGcd((v - u) >> 1n, u)
}

/**
 * Independent reference rational multiplication using pre-cancellation
 * via Stein's binary GCD.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function referenceMultiply(a, b) {
	const g1 = binaryGcd(a.num, b.den)
	const g2 = binaryGcd(b.num, a.den)
	let num = (a.num / g1) * (b.num / g2)
	let den = (a.den / g2) * (b.den / g1)
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = binaryGcd(num, den)
	return { num: num / g, den: den / g }
}

describe('multiplyRationalIterative', () => {
	test('multiplies basic coprime and reducible fractions in lowest terms', () => {
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 2n, den: 3n }, { num: 5n, den: 7n }),
			{ num: 10n, den: 21n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 2n, den: 3n }, { num: 3n, den: 4n }),
			{ num: 1n, den: 2n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 6n, den: 10n }, { num: 15n, den: 9n }),
			{ num: 1n, den: 1n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 12n, den: 35n }, { num: 14n, den: 18n }),
			{ num: 4n, den: 15n }
		)
	})

	test('handles multiplicative identity and integer rationals', () => {
		const one = { num: 1n, den: 1n }
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 7n, den: 11n }, one),
			{ num: 7n, den: 11n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative(one, { num: -4n, den: 6n }),
			{ num: -2n, den: 3n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 5n, den: 1n }, { num: 7n, den: 1n }),
			{ num: 35n, den: 1n }
		)
	})

	test('handles zero operands and always normalizes zero to { num: 0n, den: 1n }', () => {
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 0n, den: 1n }, { num: 5n, den: 7n }),
			{ num: 0n, den: 1n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 5n, den: 7n }, { num: 0n, den: 9n }),
			{ num: 0n, den: 1n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 0n, den: -5n }, { num: -3n, den: -4n }),
			{ num: 0n, den: 1n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 0n, den: -13n }, { num: 0n, den: -17n }),
			{ num: 0n, den: 1n }
		)
	})

	test('handles negative numerators and negative denominators, always returning den > 0n', () => {
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: -2n, den: 3n }, { num: 4n, den: 5n }),
			{ num: -8n, den: 15n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 2n, den: -3n }, { num: 4n, den: 5n }),
			{ num: -8n, den: 15n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: -2n, den: 3n }, { num: -4n, den: 5n }),
			{ num: 8n, den: 15n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 2n, den: -3n }, { num: 4n, den: -5n }),
			{ num: 8n, den: 15n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: -6n, den: -9n }, { num: -10n, den: 15n }),
			{ num: -4n, den: 9n }
		)
	})

	test('handles reciprocals and negative reciprocals', () => {
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 13n, den: 29n }, { num: 29n, den: 13n }),
			{ num: 1n, den: 1n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: -13n, den: 29n }, { num: -29n, den: 13n }),
			{ num: 1n, den: 1n }
		)
		assert.deepStrictEqual(
			multiplyRationalIterative({ num: 13n, den: -29n }, { num: 29n, den: 13n }),
			{ num: -1n, den: 1n }
		)
	})

	test('handles very large BigInt operands without precision loss', () => {
		const bigA = 10n ** 60n + 7n
		const bigB = 10n ** 60n + 9n
		const common = 10n ** 40n + 123456789n

		const result = multiplyRationalIterative(
			{ num: bigA * common, den: bigB },
			{ num: bigB * 3n, den: common * 5n }
		)
		// (bigA * common / bigB) * (3 * bigB / (5 * common)) = 3 * bigA / 5
		assert.deepStrictEqual(result, { num: bigA * 3n, den: 5n })
		assert.strictEqual(result.den > 0n, true)
		assert.strictEqual(binaryGcd(result.num, result.den), 1n)
	})

	test('does not mutate input rational objects', () => {
		const a = Object.freeze({ num: -4n, den: -6n })
		const b = Object.freeze({ num: 9n, den: -12n })
		const result = multiplyRationalIterative(a, b)
		assert.deepStrictEqual(result, { num: -1n, den: 2n })
		assert.deepStrictEqual(a, { num: -4n, den: -6n })
		assert.deepStrictEqual(b, { num: 9n, den: -12n })
	})

	test('validates inputs thoroughly', () => {
		const valid = { num: 1n, den: 2n }
		const invalidObjects = [null, undefined, 42, 42n, '1/2', true, [], [1n, 2n], () => {}]

		for (const bad of invalidObjects) {
			assert.throws(() => multiplyRationalIterative(bad, valid), TypeError)
			assert.throws(() => multiplyRationalIterative(valid, bad), TypeError)
		}

		const invalidFields = [
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: '1', den: 2n },
			{ num: 1n, den: '2' },
			{ num: 1n },
			{ den: 2n },
			{},
			{ num: NaN, den: 1n },
			{ num: 1n, den: Infinity },
			{ num: null, den: 1n },
			{ num: 1n, den: undefined },
		]

		for (const bad of invalidFields) {
			assert.throws(() => multiplyRationalIterative(bad, valid), TypeError)
			assert.throws(() => multiplyRationalIterative(valid, bad), TypeError)
		}

		// Zero denominator must throw RangeError even when the other operand is zero
		assert.throws(() => multiplyRationalIterative({ num: 1n, den: 0n }, valid), RangeError)
		assert.throws(() => multiplyRationalIterative(valid, { num: 1n, den: 0n }), RangeError)
		assert.throws(
			() => multiplyRationalIterative({ num: 0n, den: 1n }, { num: 1n, den: 0n }),
			RangeError
		)
		assert.throws(
			() => multiplyRationalIterative({ num: 0n, den: 0n }, { num: 0n, den: 1n }),
			RangeError
		)
	})

	test('cross-checks against independent reference implementation and floating-point arithmetic', () => {
		const samples = [
			{ num: 0n, den: 1n },
			{ num: 0n, den: -7n },
			{ num: 1n, den: 1n },
			{ num: -1n, den: 1n },
			{ num: 3n, den: 8n },
			{ num: -14n, den: 21n },
			{ num: 25n, den: -35n },
			{ num: -18n, den: -24n },
			{ num: 123456789012345678901n, den: 98765432109876543210n },
			{ num: -999999999999999999999999n, den: 111111111111111111111111n },
		]

		for (const a of samples) {
			for (const b of samples) {
				const actual = multiplyRationalIterative(a, b)
				const expected = referenceMultiply(a, b)

				assert.deepStrictEqual(actual, expected)
				assert.strictEqual(actual.den > 0n, true)
				assert.strictEqual(binaryGcd(actual.num, actual.den), 1n)
				// Cross-multiplication exactness invariant
				assert.strictEqual(actual.num * a.den * b.den, a.num * b.num * actual.den)
				// Commutativity check
				assert.deepStrictEqual(multiplyRationalIterative(b, a), actual)
			}
		}

		// Floating-point cross-check over small fractions
		for (let n1 = -5n; n1 <= 5n; n1++) {
			for (let d1 = -4n; d1 <= 4n; d1++) {
				if (d1 === 0n) continue
				for (let n2 = -3n; n2 <= 3n; n2++) {
					for (let d2 = 1n; d2 <= 4n; d2++) {
						const prod = multiplyRationalIterative({ num: n1, den: d1 }, { num: n2, den: d2 })
						const exactFloat = Number(prod.num) / Number(prod.den)
						const approxFloat = (Number(n1) / Number(d1)) * (Number(n2) / Number(d2))
						assert.ok(
							Math.abs(exactFloat - approxFloat) < 1e-12,
							`Mismatch for (${n1}/${d1})*(${n2}/${d2}): ${exactFloat} vs ${approxFloat}`
						)
					}
				}
			}
		}
	})
})
