import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideComplexIterative } from './divideComplexIterative.js'

/**
 * Helper for complex multiplication used in independent cross-checks.
 */
function multiplyComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Helper to assert two complex numbers are approximately equal within a relative/absolute tolerance.
 */
function assertComplexClose(actual, expected, tol = 1e-14, message = '') {
	const scaleRe = Math.max(1, Math.abs(expected.re))
	const scaleIm = Math.max(1, Math.abs(expected.im))
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol * scaleRe,
		`${message} real part mismatch: got ${actual.re}, expected ${expected.re}`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol * scaleIm,
		`${message} imag part mismatch: got ${actual.im}, expected ${expected.im}`,
	)
}

describe('divideComplexIterative', () => {
	describe('normal cases', () => {
		test('divides purely real numbers', () => {
			assert.deepStrictEqual(
				divideComplexIterative({ re: 10, im: 0 }, { re: 2, im: 0 }),
				{ re: 5, im: 0 },
			)
			assert.deepStrictEqual(
				divideComplexIterative({ re: -9, im: 0 }, { re: 4, im: 0 }),
				{ re: -2.25, im: 0 },
			)
		})

		test('divides purely imaginary numbers', () => {
			assert.deepStrictEqual(
				divideComplexIterative({ re: 0, im: 6 }, { re: 0, im: 2 }),
				{ re: 3, im: 0 },
			)
			assert.deepStrictEqual(
				divideComplexIterative({ re: 1, im: 0 }, { re: 0, im: 1 }),
				{ re: 0, im: -1 },
			)
			assert.deepStrictEqual(
				divideComplexIterative({ re: 0, im: 1 }, { re: 1, im: 0 }),
				{ re: 0, im: 1 },
			)
		})

		test('divides general complex numbers when |b.re| >= |b.im| and when |b.im| > |b.re|', () => {
			// (4 + 2i) / (3 - i) = (12 - 2 + i(6 + 4)) / 10 = 1 + i
			assert.deepStrictEqual(
				divideComplexIterative({ re: 4, im: 2 }, { re: 3, im: -1 }),
				{ re: 1, im: 1 },
			)

			// (3 + 2i) / (1 - 4i) = (-5/17) + (14/17)i
			assertComplexClose(
				divideComplexIterative({ re: 3, im: 2 }, { re: 1, im: -4 }),
				{ re: -5 / 17, im: 14 / 17 },
				1e-15,
			)

			// (-7 - 4i) / (-2 + 5i) = (-6/29) + (43/29)i
			assertComplexClose(
				divideComplexIterative({ re: -7, im: -4 }, { re: -2, im: 5 }),
				{ re: -6 / 29, im: 43 / 29 },
				1e-15,
			)
		})

		test('handles zero dividend without negative zeros', () => {
			const q1 = divideComplexIterative({ re: 0, im: 0 }, { re: -3, im: 4 })
			assert.deepStrictEqual(q1, { re: 0, im: 0 })
			assert.ok(Object.is(q1.re, 0))
			assert.ok(Object.is(q1.im, 0))

			const q2 = divideComplexIterative({ re: -0, im: -0 }, { re: -1, im: 0 })
			assert.deepStrictEqual(q2, { re: 0, im: 0 })
			assert.ok(Object.is(q2.re, 0))
			assert.ok(Object.is(q2.im, 0))
		})

		test('does not mutate input objects', () => {
			const a = { re: 5, im: -3 }
			const b = { re: 2, im: 7 }
			divideComplexIterative(a, b)
			assert.deepStrictEqual(a, { re: 5, im: -3 })
			assert.deepStrictEqual(b, { re: 2, im: 7 })
		})
	})

	describe('edge cases and overflow/underflow safety', () => {
		test('avoids intermediate overflow for very large magnitudes (1e200..1e308)', () => {
			// Naive (b.re^2 + b.im^2) overflows to Infinity here
			assertComplexClose(
				divideComplexIterative({ re: 1e200, im: 1e200 }, { re: 1e200, im: 1e200 }),
				{ re: 1, im: 0 },
				1e-15,
			)
			assertComplexClose(
				divideComplexIterative({ re: 1e308, im: 1e308 }, { re: 1e308, im: -1e308 }),
				{ re: 0, im: 1 },
				1e-15,
			)
			assertComplexClose(
				divideComplexIterative(
					{ re: Number.MAX_VALUE, im: 0 },
					{ re: Number.MAX_VALUE, im: 0 },
				),
				{ re: 1, im: 0 },
				1e-15,
			)
			assertComplexClose(
				divideComplexIterative(
					{ re: 4e300, im: 2e300 },
					{ re: 3e300, im: -1e300 },
				),
				{ re: 1, im: 1 },
				1e-15,
			)
		})

		test('avoids intermediate underflow for very small and subnormal magnitudes', () => {
			// Naive (b.re^2 + b.im^2) underflows to 0 here, yielding NaN
			assertComplexClose(
				divideComplexIterative({ re: 1e-200, im: 1e-200 }, { re: 1e-200, im: 1e-200 }),
				{ re: 1, im: 0 },
				1e-15,
			)
			assertComplexClose(
				divideComplexIterative({ re: 4e-305, im: 2e-305 }, { re: 3e-305, im: -1e-305 }),
				{ re: 1, im: 1 },
				1e-15,
			)
			assertComplexClose(
				divideComplexIterative(
					{ re: Number.MIN_VALUE, im: 0 },
					{ re: Number.MIN_VALUE, im: 0 },
				),
				{ re: 1, im: 0 },
				1e-15,
			)
			assertComplexClose(
				divideComplexIterative(
					{ re: 0, im: Number.MIN_VALUE * 4 },
					{ re: 0, im: Number.MIN_VALUE * 2 },
				),
				{ re: 2, im: 0 },
				1e-15,
			)
		})

		test('handles extreme aspect ratios between real and imaginary components', () => {
			// i / (1e100 + 1e-100 i) = (1e-100 + 1e100 i) / (1e200 + 1e-200) ≈ 1e-300 + 1e-100 i
			const q = divideComplexIterative(
				{ re: 0, im: 1 },
				{ re: 1e100, im: 1e-100 },
			)
			assert.ok(Math.abs(q.re - 1e-300) <= 1e-314)
			assert.ok(Math.abs(q.im - 1e-100) <= 1e-114)
		})

		test('handles genuine mathematical overflow cleanly without producing NaN', () => {
			const q = divideComplexIterative({ re: 1e300, im: 0 }, { re: 1e-300, im: 0 })
			assert.strictEqual(q.re, Infinity)
			assert.strictEqual(q.im, 0)
		})

		test('preserves accuracy under near-cancellation via iterative refinement', () => {
			// a = 1 + i, b = 1 + (1 + 2^-52)i
			// Exact imag(a / b) = (1 - (1 + 2^-52)) / (1 + (1 + 2^-52)^2) = -2^-52 / (2 + 2^-51 + 2^-104) ≈ -2^-53
			const eps = Number.EPSILON
			const q = divideComplexIterative({ re: 1, im: 1 }, { re: 1, im: 1 + eps })
			const expectedIm = -eps / (2 + 2 * eps)
			assert.ok(
				Math.abs(q.im - expectedIm) <= Math.abs(expectedIm) * 1e-14,
				`Expected ~${expectedIm}, got ${q.im}`,
			)
		})
	})

	describe('input validation', () => {
		test('throws RangeError on division by zero', () => {
			assert.throws(
				() => divideComplexIterative({ re: 1, im: 2 }, { re: 0, im: 0 }),
				RangeError,
			)
			assert.throws(
				() => divideComplexIterative({ re: 0, im: 0 }, { re: 0, im: 0 }),
				RangeError,
			)
			assert.throws(
				() => divideComplexIterative({ re: 1, im: 0 }, { re: -0, im: -0 }),
				RangeError,
			)
		})

		test('throws RangeError on non-finite components (NaN, Infinity, -Infinity)', () => {
			const badValues = [NaN, Infinity, -Infinity]
			for (const bad of badValues) {
				assert.throws(
					() => divideComplexIterative({ re: bad, im: 1 }, { re: 1, im: 1 }),
					RangeError,
				)
				assert.throws(
					() => divideComplexIterative({ re: 1, im: bad }, { re: 1, im: 1 }),
					RangeError,
				)
				assert.throws(
					() => divideComplexIterative({ re: 1, im: 1 }, { re: bad, im: 1 }),
					RangeError,
				)
				assert.throws(
					() => divideComplexIterative({ re: 1, im: 1 }, { re: 1, im: bad }),
					RangeError,
				)
			}
		})

		test('throws TypeError on invalid argument types or missing numeric properties', () => {
			const invalidObjects = [
				null,
				undefined,
				42,
				'1+2i',
				true,
				[1, 2],
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: null },
				{ re: 1n, im: 2n },
			]
			for (const invalid of invalidObjects) {
				assert.throws(
					() => divideComplexIterative(invalid, { re: 1, im: 1 }),
					TypeError,
				)
				assert.throws(
					() => divideComplexIterative({ re: 1, im: 1 }, invalid),
					TypeError,
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		const pairs = [
			[{ re: 7, im: -3 }, { re: 2, im: 5 }],
			[{ re: -11.5, im: 4.25 }, { re: -3.75, im: -1.125 }],
			[{ re: 0.1, im: 0.2 }, { re: 0.3, im: -0.7 }],
			[{ re: 123456, im: -789012 }, { re: 345678, im: 901234 }],
			[{ re: 1e-10, im: -3e-10 }, { re: -7e-10, im: 2e-10 }],
			[{ re: 1e10, im: 3e10 }, { re: 2e10, im: -9e10 }],
			[{ re: Math.PI, im: -Math.E }, { re: Math.SQRT2, im: Math.LN10 }],
		]

		test('satisfies inverse identity (a / b) * b == a', () => {
			for (const [a, b] of pairs) {
				const q = divideComplexIterative(a, b)
				const reconstructed = multiplyComplex(q, b)
				assertComplexClose(reconstructed, a, 1e-14, 'inverse identity')
			}
		})

		test('agrees with independent polar-form computation', () => {
			for (const [a, b] of pairs) {
				const q = divideComplexIterative(a, b)
				const r = Math.hypot(a.re, a.im) / Math.hypot(b.re, b.im)
				const theta = Math.atan2(a.im, a.re) - Math.atan2(b.im, b.re)
				const polarExpected = {
					re: r * Math.cos(theta),
					im: r * Math.sin(theta),
				}
				assertComplexClose(q, polarExpected, 1e-13, 'polar form')
			}
		})

		test('matches exact BigInt rational arithmetic for integer complex numbers', () => {
			const integerCases = [
				[{ re: 987654321, im: -123456789 }, { re: 314159265, im: 271828182 }],
				[{ re: -999999937, im: 999999929 }, { re: 999999893, im: -999999883 }],
				[{ re: 1000003, im: 1000033 }, { re: 1000037, im: 1000039 }],
			]

			const SCALE = 10n ** 30n
			for (const [a, b] of integerCases) {
				const aRe = BigInt(a.re)
				const aIm = BigInt(a.im)
				const bRe = BigInt(b.re)
				const bIm = BigInt(b.im)
				const denom = bRe * bRe + bIm * bIm
				const exactRe = Number((aRe * bRe + aIm * bIm) * SCALE / denom) / Number(SCALE)
				const exactIm = Number((aIm * bRe - aRe * bIm) * SCALE / denom) / Number(SCALE)

				const q = divideComplexIterative(a, b)
				assertComplexClose(q, { re: exactRe, im: exactIm }, 1e-15, 'BigInt exact')
			}
		})

		test('satisfies algebraic identities: 1/(1/z) == z and (a/b)/c == a/(b*c)', () => {
			const one = { re: 1, im: 0 }
			const a = { re: 5.5, im: -2.25 }
			const b = { re: -1.75, im: 4.5 }
			const c = { re: 3.125, im: 0.875 }

			// Double reciprocal
			const recip = divideComplexIterative(one, b)
			const doubleRecip = divideComplexIterative(one, recip)
			assertComplexClose(doubleRecip, b, 1e-14, 'double reciprocal')

			// Nested division vs division by product
			const lhs = divideComplexIterative(divideComplexIterative(a, b), c)
			const rhs = divideComplexIterative(a, multiplyComplex(b, c))
			assertComplexClose(lhs, rhs, 1e-14, 'nested division')
		})
	})
})
