import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { powerComplexIterative } from './powerComplexIterative.js'

/**
 * Asserts that two complex numbers are approximately equal within an absolute tolerance.
 *
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [eps=1e-9]
 */
function assertComplexClose(actual, expected, eps = 1e-9) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`real part mismatch: got ${actual.re}, expected ${expected.re} (eps=${eps})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`imaginary part mismatch: got ${actual.im}, expected ${expected.im} (eps=${eps})`,
	)
}

/**
 * Independent polar / De Moivre implementation for cross-checking.
 *
 * @param {{ re: number, im: number }} z
 * @param {number} n
 * @returns {{ re: number, im: number }}
 */
function powerComplexDeMoivre(z, n) {
	if (n === 0) return { re: 1, im: 0 }
	const r = Math.hypot(z.re, z.im)
	const theta = Math.atan2(z.im, z.re)
	const rn = r ** n
	return {
		re: rn * Math.cos(n * theta),
		im: rn * Math.sin(n * theta),
	}
}

describe('powerComplexIterative', () => {
	describe('normal cases', () => {
		test('raises purely real complex numbers to positive and negative integer powers', () => {
			assert.deepStrictEqual(powerComplexIterative({ re: 2, im: 0 }, 5), { re: 32, im: 0 })
			assert.deepStrictEqual(powerComplexIterative({ re: -3, im: 0 }, 3), { re: -27, im: 0 })
			assert.deepStrictEqual(powerComplexIterative({ re: -3, im: 0 }, 4), { re: 81, im: 0 })
			assertComplexClose(powerComplexIterative({ re: 2, im: 0 }, -3), { re: 0.125, im: 0 })
		})

		test('handles cyclic powers of the imaginary unit i', () => {
			const i = { re: 0, im: 1 }
			assert.deepStrictEqual(powerComplexIterative(i, 1), { re: 0, im: 1 })
			assert.deepStrictEqual(powerComplexIterative(i, 2), { re: -1, im: 0 })
			assert.deepStrictEqual(powerComplexIterative(i, 3), { re: 0, im: -1 })
			assert.deepStrictEqual(powerComplexIterative(i, 4), { re: 1, im: 0 })
			assert.deepStrictEqual(powerComplexIterative(i, 5), { re: 0, im: 1 })
			assert.deepStrictEqual(powerComplexIterative(i, -1), { re: 0, im: -1 })
			assert.deepStrictEqual(powerComplexIterative(i, -2), { re: -1, im: 0 })
			assert.deepStrictEqual(powerComplexIterative(i, -3), { re: 0, im: 1 })
			assert.deepStrictEqual(powerComplexIterative(i, -4), { re: 1, im: 0 })
		})

		test('computes positive powers of general complex numbers', () => {
			assert.deepStrictEqual(powerComplexIterative({ re: 1, im: 1 }, 2), { re: 0, im: 2 })
			assert.deepStrictEqual(powerComplexIterative({ re: 1, im: 1 }, 4), { re: -4, im: 0 })
			assert.deepStrictEqual(powerComplexIterative({ re: 2, im: 3 }, 3), { re: -46, im: 9 })
			assert.deepStrictEqual(powerComplexIterative({ re: 3, im: -4 }, 2), { re: -7, im: -24 })
			assertComplexClose(powerComplexIterative({ re: 0.5, im: 0.5 }, 4), { re: -0.25, im: 0 })
		})

		test('computes negative powers of general complex numbers', () => {
			assertComplexClose(powerComplexIterative({ re: 1, im: 1 }, -1), { re: 0.5, im: -0.5 })
			assertComplexClose(powerComplexIterative({ re: 1, im: 1 }, -2), { re: 0, im: -0.5 })
			assertComplexClose(powerComplexIterative({ re: 3, im: 4 }, -1), { re: 0.12, im: -0.16 })
			// (2 + i)^3 = 2 + 11i, so (2 + i)^-3 = (2 - 11i) / 125 = 0.016 - 0.088i
			assertComplexClose(powerComplexIterative({ re: 2, im: 1 }, -3), { re: 0.016, im: -0.088 })
		})

		test('does not mutate the input base object', () => {
			const base = { re: 2, im: -3 }
			const result = powerComplexIterative(base, 3)
			assert.deepStrictEqual(base, { re: 2, im: -3 })
			assert.notStrictEqual(result, base)
		})
	})

	describe('edge cases', () => {
		test('returns { re: 1, im: 0 } for exponent 0 including 0^0', () => {
			assert.deepStrictEqual(powerComplexIterative({ re: 0, im: 0 }, 0), { re: 1, im: 0 })
			assert.deepStrictEqual(powerComplexIterative({ re: 5, im: -7 }, 0), { re: 1, im: 0 })
			assert.deepStrictEqual(powerComplexIterative({ re: 0, im: -3 }, 0), { re: 1, im: 0 })
		})

		test('returns { re: 0, im: 0 } for zero base with positive exponents', () => {
			for (const exp of [1, 2, 5, 10]) {
				const res = powerComplexIterative({ re: 0, im: 0 }, exp)
				assert.deepStrictEqual(res, { re: 0, im: 0 })
				assert.ok(Object.is(res.re, 0))
				assert.ok(Object.is(res.im, 0))
			}
		})

		test('normalizes negative zero in outputs', () => {
			const res = powerComplexIterative({ re: -0, im: -0 }, 1)
			assert.ok(Object.is(res.re, 0))
			assert.ok(Object.is(res.im, 0))
		})

		test('handles unit bases { re: 1, im: 0 } and { re: -1, im: 0 }', () => {
			assert.deepStrictEqual(powerComplexIterative({ re: 1, im: 0 }, 25), { re: 1, im: 0 })
			assert.deepStrictEqual(powerComplexIterative({ re: 1, im: 0 }, -25), { re: 1, im: 0 })
			assert.deepStrictEqual(powerComplexIterative({ re: -1, im: 0 }, 10), { re: 1, im: 0 })
			assert.deepStrictEqual(powerComplexIterative({ re: -1, im: 0 }, 11), { re: -1, im: 0 })
			assert.deepStrictEqual(powerComplexIterative({ re: -1, im: 0 }, -11), { re: -1, im: 0 })
		})

		test('handles large magnitude inversion without intermediate squared-norm overflow', () => {
			assertComplexClose(
				powerComplexIterative({ re: 1e200, im: 0 }, -1),
				{ re: 1e-200, im: 0 },
				1e-210,
			)
			assertComplexClose(
				powerComplexIterative({ re: 0, im: 1e200 }, -1),
				{ re: 0, im: -1e-200 },
				1e-210,
			)
		})
	})

	describe('invalid inputs', () => {
		test('throws TypeError when base is not a valid complex object', () => {
			for (const badBase of [null, undefined, 42, '1+i', [1, 2], true]) {
				assert.throws(() => powerComplexIterative(badBase, 2), TypeError)
			}
		})

		test('throws TypeError when base.re or base.im is missing or non-numeric', () => {
			for (const badBase of [{}, { re: 1 }, { im: 1 }, { re: '1', im: 0 }, { re: 1, im: null }]) {
				assert.throws(() => powerComplexIterative(badBase, 2), TypeError)
			}
		})

		test('throws RangeError when base.re or base.im is non-finite', () => {
			for (const badBase of [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
			]) {
				assert.throws(() => powerComplexIterative(badBase, 2), RangeError)
			}
		})

		test('throws TypeError when exponent is not a number', () => {
			for (const badExp of [null, undefined, '2', { re: 2, im: 0 }, 2n]) {
				assert.throws(() => powerComplexIterative({ re: 1, im: 1 }, badExp), TypeError)
			}
		})

		test('throws RangeError when exponent is non-integer, non-finite, or unsafe', () => {
			for (const badExp of [
				0.5,
				-1.25,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY,
				Number.MAX_SAFE_INTEGER + 1,
			]) {
				assert.throws(() => powerComplexIterative({ re: 1, im: 1 }, badExp), RangeError)
			}
		})

		test('throws RangeError when raising zero complex number to a negative exponent', () => {
			assert.throws(() => powerComplexIterative({ re: 0, im: 0 }, -1), RangeError)
			assert.throws(() => powerComplexIterative({ re: -0, im: 0 }, -5), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		test('matches De Moivre polar formula across all quadrants and positive/negative exponents', () => {
			const bases = [
				{ re: 1.5, im: 0.75 },
				{ re: -1.2, im: 0.9 },
				{ re: -0.8, im: -1.4 },
				{ re: 0.6, im: -1.1 },
				{ re: 0, im: -2.5 },
			]
			const exponents = [-6, -3, -1, 0, 1, 2, 5, 7]

			for (const z of bases) {
				for (const n of exponents) {
					const actual = powerComplexIterative(z, n)
					const expected = powerComplexDeMoivre(z, n)
					const scale = Math.max(1, Math.hypot(expected.re, expected.im))
					assertComplexClose(actual, expected, 1e-11 * scale)
				}
			}
		})

		test('satisfies algebraic exponent laws and roots of unity', () => {
			const z = { re: 1.2, im: -0.7 }
			const z3 = powerComplexIterative(z, 3)
			const zNeg3 = powerComplexIterative(z, -3)
			// z^3 * z^-3 === 1
			const product = {
				re: z3.re * zNeg3.re - z3.im * zNeg3.im,
				im: z3.re * zNeg3.im + z3.im * zNeg3.re,
			}
			assertComplexClose(product, { re: 1, im: 0 }, 1e-12)

			// (z^2)^3 === z^6
			const z2 = powerComplexIterative(z, 2)
			assertComplexClose(powerComplexIterative(z2, 3), powerComplexIterative(z, 6), 1e-11)

			// k-th roots of unity raised to k equal 1
			for (const k of [3, 5, 6, 7, 8, 12]) {
				const omega = { re: Math.cos((2 * Math.PI) / k), im: Math.sin((2 * Math.PI) / k) }
				assertComplexClose(powerComplexIterative(omega, k), { re: 1, im: 0 }, 1e-12)
			}
		})
	})
})
