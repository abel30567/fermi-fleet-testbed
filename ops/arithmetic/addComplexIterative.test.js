import { describe, test } from 'node:test'
import assert from 'node:assert'
import { addComplexIterative } from './addComplexIterative.js'

describe('addComplexIterative', () => {
	describe('normal cases', () => {
		test('adds two complex numbers with positive components', () => {
			assert.deepStrictEqual(
				addComplexIterative({ re: 2, im: 3 }, { re: 4, im: 5 }),
				{ re: 6, im: 8 },
			)
		})

		test('adds complex numbers with negative and fractional components', () => {
			const result = addComplexIterative({ re: -1.5, im: 2.25 }, { re: 4.5, im: -6.75 })
			assert.deepStrictEqual(result, { re: 3, im: -4.5 })
		})

		test('adds multiple variadic complex numbers iteratively', () => {
			const result = addComplexIterative(
				{ re: 1, im: -2 },
				{ re: 3, im: 4 },
				{ re: -5, im: 6 },
				{ re: 7, im: -8 },
			)
			assert.deepStrictEqual(result, { re: 6, im: 0 })
		})

		test('adds an array of complex numbers', () => {
			const terms = [
				{ re: 10, im: 1 },
				{ re: -4, im: 2 },
				{ re: 3, im: -5 },
			]
			assert.deepStrictEqual(addComplexIterative(terms), { re: 9, im: -2 })
		})

		test('adds purely real and purely imaginary numbers', () => {
			assert.deepStrictEqual(
				addComplexIterative({ re: 7, im: 0 }, { re: 0, im: -9 }),
				{ re: 7, im: -9 },
			)
		})
	})

	describe('edge cases', () => {
		test('preserves additive identity with zero complex number', () => {
			const z = { re: -3.5, im: 8.25 }
			const zero = { re: 0, im: 0 }
			assert.deepStrictEqual(addComplexIterative(z, zero), z)
			assert.deepStrictEqual(addComplexIterative(zero, z), z)
			assert.deepStrictEqual(addComplexIterative(zero, zero), zero)
		})

		test('handles additive inverses and normalizes -0 to +0', () => {
			const result = addComplexIterative({ re: 5, im: -7 }, { re: -5, im: 7 })
			assert.deepStrictEqual(result, { re: 0, im: 0 })
			assert.strictEqual(Object.is(result.re, 0), true)
			assert.strictEqual(Object.is(result.im, 0), true)

			const negZeroResult = addComplexIterative({ re: -0, im: -0 }, { re: -0, im: -0 })
			assert.strictEqual(Object.is(negZeroResult.re, 0), true)
			assert.strictEqual(Object.is(negZeroResult.im, 0), true)
		})

		test('returns a new object for a single complex number without mutating inputs', () => {
			const input = { re: 4, im: -2 }
			const result = addComplexIterative(input)
			assert.deepStrictEqual(result, { re: 4, im: -2 })
			assert.notStrictEqual(result, input)
		})

		test('handles very large iterative sequences without stack overflow', () => {
			const count = 10000
			const terms = Array.from({ length: count }, () => ({ re: 1, im: -2 }))
			assert.deepStrictEqual(addComplexIterative(terms), { re: count, im: -2 * count })
		})
	})

	describe('invalid inputs', () => {
		test('throws TypeError when called with no arguments', () => {
			assert.throws(() => addComplexIterative(), TypeError)
		})

		test('throws RangeError when called with an empty array', () => {
			assert.throws(() => addComplexIterative([]), RangeError)
		})

		test('throws TypeError for non-object or nested array arguments', () => {
			assert.throws(() => addComplexIterative(null, { re: 1, im: 2 }), TypeError)
			assert.throws(() => addComplexIterative(undefined, { re: 1, im: 2 }), TypeError)
			assert.throws(() => addComplexIterative(5, { re: 1, im: 2 }), TypeError)
			assert.throws(() => addComplexIterative('1+2i', { re: 1, im: 2 }), TypeError)
			assert.throws(() => addComplexIterative({ re: 1, im: 2 }, [{ re: 3, im: 4 }]), TypeError)
		})

		test('throws TypeError for missing or non-numeric re/im fields', () => {
			assert.throws(() => addComplexIterative({ re: 1 }), TypeError)
			assert.throws(() => addComplexIterative({ im: 2 }), TypeError)
			assert.throws(() => addComplexIterative({ re: '1', im: 2 }), TypeError)
			assert.throws(() => addComplexIterative({ re: 1, im: null }), TypeError)
			assert.throws(() => addComplexIterative({ re: 1, im: true }), TypeError)
		})

		test('throws RangeError for NaN or non-finite components', () => {
			assert.throws(() => addComplexIterative({ re: Number.NaN, im: 0 }), RangeError)
			assert.throws(() => addComplexIterative({ re: 0, im: Number.NaN }), RangeError)
			assert.throws(() => addComplexIterative({ re: Number.POSITIVE_INFINITY, im: 1 }), RangeError)
			assert.throws(() => addComplexIterative({ re: 1, im: Number.NEGATIVE_INFINITY }), RangeError)
			assert.throws(
				() => addComplexIterative({ re: 1, im: 2 }, { re: 3, im: Number.NaN }),
				RangeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		test('matches closed-form Gaussian series sum: sum_{k=1..N} (k + i*(2k-1)) = N(N+1)/2 + i*N^2', () => {
			const n = 250
			const terms = Array.from({ length: n }, (_, idx) => {
				const k = idx + 1
				return { re: k, im: 2 * k - 1 }
			})
			const expected = { re: (n * (n + 1)) / 2, im: n * n }
			assert.deepStrictEqual(addComplexIterative(terms), expected)
		})

		test('satisfies commutativity, associativity, and matches polar-coordinate reconstruction', () => {
			const a = { re: 3, im: -4 }
			const b = { re: -7, im: 11 }
			const c = { re: 5, im: 2 }

			assert.deepStrictEqual(addComplexIterative(a, b), addComplexIterative(b, a))
			assert.deepStrictEqual(
				addComplexIterative(addComplexIterative(a, b), c),
				addComplexIterative(a, addComplexIterative(b, c)),
			)

			// Independent polar -> Cartesian cross-check for two vectors
			const r1 = 5
			const theta1 = Math.PI / 6
			const r2 = 3
			const theta2 = (2 * Math.PI) / 3
			const z1 = { re: r1 * Math.cos(theta1), im: r1 * Math.sin(theta1) }
			const z2 = { re: r2 * Math.cos(theta2), im: r2 * Math.sin(theta2) }

			const sum = addComplexIterative(z1, z2)
			const expectedMagnitudeSq =
				r1 * r1 + r2 * r2 + 2 * r1 * r2 * Math.cos(theta1 - theta2)
			const actualMagnitudeSq = sum.re * sum.re + sum.im * sum.im

			assert.ok(Math.abs(actualMagnitudeSq - expectedMagnitudeSq) < 1e-12)
		})
	})
})
