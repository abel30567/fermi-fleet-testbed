import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { subtractComplexIterative } from './subtractComplexIterative.js'

describe('subtractComplexIterative', () => {
	describe('normal cases', () => {
		test('subtracts two complex numbers with positive components', () => {
			assert.deepEqual(
				subtractComplexIterative({ re: 5, im: 7 }, { re: 2, im: 3 }),
				{ re: 3, im: 4 }
			)
		})

		test('subtracts two complex numbers with mixed and negative components', () => {
			assert.deepEqual(
				subtractComplexIterative({ re: -4, im: 2.5 }, { re: 3, im: -1.5 }),
				{ re: -7, im: 4 }
			)
		})

		test('iteratively subtracts three or more complex numbers left-to-right', () => {
			assert.deepEqual(
				subtractComplexIterative(
					{ re: 10, im: 20 },
					{ re: 1, im: 2 },
					{ re: 3, im: 4 },
					{ re: -2, im: 5 }
				),
				{ re: 8, im: 9 }
			)
		})

		test('does not mutate input objects and returns a fresh object', () => {
			const a = { re: 6, im: -2 }
			const b = { re: 1, im: 4 }
			const result = subtractComplexIterative(a, b)

			assert.deepEqual(result, { re: 5, im: -6 })
			assert.deepEqual(a, { re: 6, im: -2 })
			assert.deepEqual(b, { re: 1, im: 4 })
			assert.notEqual(result, a)
			assert.notEqual(result, b)
		})
	})

	describe('edge cases', () => {
		test('subtracting zero leaves the complex number unchanged', () => {
			assert.deepEqual(
				subtractComplexIterative({ re: 3.25, im: -7.5 }, { re: 0, im: 0 }),
				{ re: 3.25, im: -7.5 }
			)
		})

		test('subtracting a complex number from itself yields { re: 0, im: 0 }', () => {
			assert.deepEqual(
				subtractComplexIterative({ re: -42.5, im: 19.75 }, { re: -42.5, im: 19.75 }),
				{ re: 0, im: 0 }
			)
		})

		test('normalizes -0 results to +0', () => {
			const result = subtractComplexIterative({ re: -0, im: -0 }, { re: 0, im: 0 })
			assert.equal(Object.is(result.re, 0), true)
			assert.equal(Object.is(result.im, 0), true)
		})

		test('handles purely real and purely imaginary numbers', () => {
			assert.deepEqual(
				subtractComplexIterative({ re: 9, im: 0 }, { re: 0, im: 4 }),
				{ re: 9, im: -4 }
			)
		})

		test('handles large iterative sequences accurately for exact integers', () => {
			const start = { re: 5000, im: -5000 }
			const terms = Array.from({ length: 100 }, (_, i) => ({ re: i + 1, im: -(i + 1) }))
			// sum(1..100) = 5050
			assert.deepEqual(
				subtractComplexIterative(start, ...terms),
				{ re: -50, im: 50 }
			)
		})

		test('ignores extra properties on operand objects', () => {
			assert.deepEqual(
				subtractComplexIterative({ re: 4, im: 5, label: 'a' }, { re: 1, im: 2, label: 'b' }),
				{ re: 3, im: 3 }
			)
		})
	})

	describe('invalid inputs', () => {
		test('throws TypeError when fewer than two operands are given', () => {
			assert.throws(() => subtractComplexIterative(), TypeError)
			assert.throws(() => subtractComplexIterative({ re: 1, im: 2 }), TypeError)
		})

		test('throws TypeError for non-object, null, or array operands', () => {
			assert.throws(() => subtractComplexIterative(null, { re: 1, im: 1 }), TypeError)
			assert.throws(() => subtractComplexIterative({ re: 1, im: 1 }, undefined), TypeError)
			assert.throws(() => subtractComplexIterative(5, { re: 1, im: 1 }), TypeError)
			assert.throws(() => subtractComplexIterative({ re: 1, im: 1 }, [1, 2]), TypeError)
			assert.throws(() => subtractComplexIterative({ re: 1, im: 1 }, { re: 2, im: 2 }, '3+4i'), TypeError)
		})

		test('throws TypeError for missing or non-numeric re/im fields', () => {
			assert.throws(() => subtractComplexIterative({ re: 1 }, { re: 1, im: 1 }), TypeError)
			assert.throws(() => subtractComplexIterative({ im: 1 }, { re: 1, im: 1 }), TypeError)
			assert.throws(() => subtractComplexIterative({ re: '1', im: 2 }, { re: 1, im: 1 }), TypeError)
			assert.throws(() => subtractComplexIterative({ re: 1, im: 2 }, { re: 1, im: null }), TypeError)
		})

		test('throws RangeError for NaN or Infinity components', () => {
			assert.throws(() => subtractComplexIterative({ re: NaN, im: 0 }, { re: 1, im: 1 }), RangeError)
			assert.throws(() => subtractComplexIterative({ re: 1, im: 1 }, { re: 0, im: Infinity }), RangeError)
			assert.throws(() => subtractComplexIterative({ re: 1, im: -Infinity }, { re: 1, im: 1 }), RangeError)
		})

		test('throws RangeError when subtraction overflows to Infinity', () => {
			assert.throws(
				() => subtractComplexIterative({ re: Number.MAX_VALUE, im: 0 }, { re: -Number.MAX_VALUE, im: 0 }),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		test('isomorphic 2x2 real matrix representation matches iterative subtraction', () => {
			// Complex number a + bi corresponds to the 2x2 real matrix [[a, -b], [b, a]]
			const toMatrix = ({ re, im }) => [
				[re, -im],
				[im, re],
			]
			const subMatrices = (m1, m2) => [
				[m1[0][0] - m2[0][0], m1[0][1] - m2[0][1]],
				[m1[1][0] - m2[1][0], m1[1][1] - m2[1][1]],
			]

			const operands = [
				{ re: 12, im: -7 },
				{ re: -3, im: 5 },
				{ re: 4, im: -2 },
				{ re: 1, im: 9 },
			]

			const result = subtractComplexIterative(...operands)
			const expectedMatrix = operands.map(toMatrix).reduce(subMatrices)

			assert.deepEqual(toMatrix(result), expectedMatrix)
		})

		test('satisfies additive inverse and anticommutativity identities', () => {
			const addComplex = (x, y) => ({ re: x.re + y.re, im: x.im + y.im })
			const negateComplex = (z) => ({ re: z.re === 0 ? 0 : -z.re, im: z.im === 0 ? 0 : -z.im })

			const pairs = [
				[{ re: 7, im: -3 }, { re: -2, im: 11 }],
				[{ re: 0.5, im: 0.25 }, { re: -1.5, im: 0.75 }],
				[{ re: -100, im: 50 }, { re: 25, im: -75 }],
			]

			for (const [a, b] of pairs) {
				const diff = subtractComplexIterative(a, b)
				// (a - b) + b === a
				assert.deepEqual(addComplex(diff, b), a)
				// a - b === -(b - a)
				assert.deepEqual(diff, negateComplex(subtractComplexIterative(b, a)))
			}
		})

		test('matches single subtraction of summed subtrahends', () => {
			const minuend = { re: 100, im: -50 }
			const subtrahends = [
				{ re: 12, im: 8 },
				{ re: -5, im: 17 },
				{ re: 23, im: -30 },
				{ re: 7, im: 4 },
			]

			const summed = subtrahends.reduce(
				(acc, z) => ({ re: acc.re + z.re, im: acc.im + z.im }),
				{ re: 0, im: 0 }
			)
			const expected = { re: minuend.re - summed.re, im: minuend.im - summed.im }

			assert.deepEqual(subtractComplexIterative(minuend, ...subtrahends), expected)
		})
	})
})
