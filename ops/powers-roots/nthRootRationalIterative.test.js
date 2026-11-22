import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nthRootRationalIterative } from './nthRootRationalIterative.js'

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`)
	}
}

function rationalPow(r, n) {
	const exp = BigInt(n)
	return { num: r.num ** exp, den: r.den ** exp }
}

function rationalAbsDiff(a, b) {
	const num = a.num * b.den - b.num * a.den
	const den = a.den * b.den
	return { num: num < 0n ? -num : num, den: den < 0n ? -den : den }
}

function rationalLessOrEqual(a, b) {
	return a.num * b.den <= b.num * a.den
}

function rationalToNumber(r) {
	return Number(r.num) / Number(r.den)
}

describe('nthRootRationalIterative', () => {
	describe('exact perfect nth powers', () => {
		test('computes exact square roots of perfect square rationals', () => {
			assert.deepEqual(nthRootRationalIterative({ num: 9n, den: 16n }, 2), {
				num: 3n,
				den: 4n,
			})
			assert.deepEqual(nthRootRationalIterative({ num: 25n, den: 1n }, 2), {
				num: 5n,
				den: 1n,
			})
			assert.deepEqual(nthRootRationalIterative({ num: 1n, den: 144n }, 2), {
				num: 1n,
				den: 12n,
			})
		})

		test('normalizes unreduced inputs and negative denominators before exact root check', () => {
			assert.deepEqual(nthRootRationalIterative({ num: 18n, den: 32n }, 2), {
				num: 3n,
				den: 4n,
			})
			assert.deepEqual(nthRootRationalIterative({ num: -16n, den: -2n }, 3), {
				num: 2n,
				den: 1n,
			})
			assert.deepEqual(nthRootRationalIterative({ num: -4n, den: -9n }, 2), {
				num: 2n,
				den: 3n,
			})
		})

		test('computes exact higher-order roots (cube, fourth, fifth, BigInt n)', () => {
			assert.deepEqual(nthRootRationalIterative({ num: 8n, den: 27n }, 3), {
				num: 2n,
				den: 3n,
			})
			assert.deepEqual(nthRootRationalIterative({ num: 81n, den: 256n }, 4), {
				num: 3n,
				den: 4n,
			})
			assert.deepEqual(nthRootRationalIterative({ num: 32n, den: 243n }, 5n), {
				num: 2n,
				den: 3n,
			})
		})

		test('handles large BigInt perfect powers without precision loss', () => {
			const baseNum = 123456789012345678901n
			const baseDen = 98765432109876543211n
			assert.equal(gcd(baseNum, baseDen), 1n)

			const input = { num: baseNum ** 4n, den: baseDen ** 4n }
			const result = nthRootRationalIterative(input, 4)
			assertLowestTerms(result)
			assert.deepEqual(result, { num: baseNum, den: baseDen })
		})
	})

	describe('edge cases', () => {
		test('n = 1 returns the reduced input rational', () => {
			assert.deepEqual(nthRootRationalIterative({ num: 6n, den: 4n }, 1), {
				num: 3n,
				den: 2n,
			})
			assert.deepEqual(nthRootRationalIterative({ num: 5n, den: -10n }, 1n), {
				num: -1n,
				den: 2n,
			})
			assert.deepEqual(nthRootRationalIterative({ num: -7n, den: 3n }, 1), {
				num: -7n,
				den: 3n,
			})
		})

		test('zero rational returns { num: 0n, den: 1n } for any valid n', () => {
			assert.deepEqual(nthRootRationalIterative({ num: 0n, den: 1n }, 2), {
				num: 0n,
				den: 1n,
			})
			assert.deepEqual(nthRootRationalIterative({ num: 0n, den: 99n }, 3), {
				num: 0n,
				den: 1n,
			})
			assert.deepEqual(nthRootRationalIterative({ num: 0n, den: -5n }, 4), {
				num: 0n,
				den: 1n,
			})
		})

		test('unity and negative unity work even for very large n', () => {
			assert.deepEqual(nthRootRationalIterative({ num: 1n, den: 1n }, 1000000n), {
				num: 1n,
				den: 1n,
			})
			assert.deepEqual(nthRootRationalIterative({ num: -1n, den: 1n }, 1000001n), {
				num: -1n,
				den: 1n,
			})
		})

		test('odd roots of negative rationals (exact and irrational)', () => {
			const exact = nthRootRationalIterative({ num: -8n, den: 27n }, 3)
			assertLowestTerms(exact)
			assert.deepEqual(exact, { num: -2n, den: 3n })

			const flippedSign = nthRootRationalIterative({ num: 1n, den: -32n }, 5)
			assertLowestTerms(flippedSign)
			assert.deepEqual(flippedSign, { num: -1n, den: 2n })

			const approx = nthRootRationalIterative({ num: -2n, den: 1n }, 3)
			assertLowestTerms(approx)
			assert.ok(approx.num < 0n)
			const diffFromMath = Math.abs(rationalToNumber(approx) - -Math.cbrt(2))
			assert.ok(diffFromMath < 1e-15, `expected close to -cbrt(2), diff=${diffFromMath}`)
		})

		test('even roots of negative rationals throw RangeError', () => {
			assert.throws(
				() => nthRootRationalIterative({ num: -1n, den: 1n }, 2),
				RangeError,
			)
			assert.throws(
				() => nthRootRationalIterative({ num: 4n, den: -9n }, 2),
				RangeError,
			)
			assert.throws(
				() => nthRootRationalIterative({ num: -16n, den: 81n }, 4),
				RangeError,
			)
			assert.throws(
				() => nthRootRationalIterative({ num: -1n, den: 1n }, 1000000n),
				RangeError,
			)
		})

		test('custom tolerance and maxIterations options', () => {
			const tol = { num: 1n, den: 1000n }
			const r = nthRootRationalIterative({ num: 2n, den: 1n }, 2, { tolerance: tol })
			assertLowestTerms(r)
			assert.equal(r.num, 1414n / 2n)
			assert.equal(r.den, 1000n / 2n)

			const capped = nthRootRationalIterative({ num: 2n, den: 1n }, 2, {
				tolerance: { num: 1n, den: 10n ** 30n },
				maxIterations: 2,
			})
			assertLowestTerms(capped)
			assert.ok(capped.num > 0n)
		})
	})

	describe('cross-checks against independent computations', () => {
		const cases = [
			{ input: { num: 2n, den: 1n }, n: 2 },
			{ input: { num: 1n, den: 2n }, n: 2 },
			{ input: { num: 5n, den: 7n }, n: 3 },
			{ input: { num: 1000n, den: 3n }, n: 4 },
			{ input: { num: -17n, den: 5n }, n: 5 },
			{ input: { num: 3n, den: 11n }, n: 7 },
		]

		for (const { input, n } of cases) {
			test(`raising result^${n} recovers ${input.num}/${input.den} and matches Math.pow`, () => {
				const result = nthRootRationalIterative(input, n)
				assertLowestTerms(result)

				// Cross-check 1: exact rational exponentiation result^n compared to input.
				const powered = rationalPow(result, n)
				const residual = rationalAbsDiff(powered, input)
				// For |r - x^(1/n)| <= 0.5e-18, |r^n - x| is bounded by ~n * |x| * 1e-17.
				const absInputVal = Math.abs(rationalToNumber(input))
				const maxResidualNum = BigInt(Math.ceil((n * Math.max(1, absInputVal) + 1) * 100))
				const bound = { num: maxResidualNum, den: 10n ** 18n }
				assert.ok(
					rationalLessOrEqual(residual, bound),
					`residual ${rationalToNumber(residual)} exceeded bound ${rationalToNumber(bound)}`,
				)

				// Cross-check 2: compare against Math.pow in floating point.
				const inputFloat = rationalToNumber(input)
				const expectedFloat =
					inputFloat < 0
						? -Math.pow(-inputFloat, 1 / n)
						: Math.pow(inputFloat, 1 / n)
				const actualFloat = rationalToNumber(result)
				const relErr = Math.abs(actualFloat - expectedFloat) / Math.max(1, Math.abs(expectedFloat))
				assert.ok(
					relErr < 1e-14,
					`Math.pow mismatch: actual=${actualFloat}, expected=${expectedFloat}, relErr=${relErr}`,
				)
			})
		}

		test('high-precision rational tolerance (1e-40) beats IEEE-754 double precision', () => {
			const input = { num: 2n, den: 1n }
			const tol = { num: 1n, den: 10n ** 40n }
			const result = nthRootRationalIterative(input, 2, { tolerance: tol })
			assertLowestTerms(result)

			// Verify |result^2 - 2| < 2 * sqrt(2) * 0.5e-40 + 1e-80 < 2e-40 in exact BigInt arithmetic.
			const squared = rationalPow(result, 2)
			const diff = rationalAbsDiff(squared, input)
			assert.ok(
				rationalLessOrEqual(diff, { num: 2n, den: 10n ** 40n }),
				'expected |r^2 - 2| <= 2e-40',
			)
		})
	})

	describe('input validation', () => {
		test('rejects invalid rational objects and non-BigInt fields', () => {
			assert.throws(() => nthRootRationalIterative(null, 2), TypeError)
			assert.throws(() => nthRootRationalIterative(undefined, 2), TypeError)
			assert.throws(() => nthRootRationalIterative(4, 2), TypeError)
			assert.throws(() => nthRootRationalIterative([4n, 1n], 2), TypeError)
			assert.throws(() => nthRootRationalIterative({ num: 4, den: 1n }, 2), TypeError)
			assert.throws(() => nthRootRationalIterative({ num: 4n, den: 1 }, 2), TypeError)
			assert.throws(() => nthRootRationalIterative({ num: '4', den: '1' }, 2), TypeError)
		})

		test('rejects zero denominator', () => {
			assert.throws(() => nthRootRationalIterative({ num: 1n, den: 0n }, 2), RangeError)
			assert.throws(() => nthRootRationalIterative({ num: 0n, den: 0n }, 2), RangeError)
		})

		test('rejects invalid root degree n', () => {
			const r = { num: 4n, den: 1n }
			assert.throws(() => nthRootRationalIterative(r, '2'), TypeError)
			assert.throws(() => nthRootRationalIterative(r, null), TypeError)
			assert.throws(() => nthRootRationalIterative(r, undefined), TypeError)
			assert.throws(() => nthRootRationalIterative(r, 0), RangeError)
			assert.throws(() => nthRootRationalIterative(r, -2), RangeError)
			assert.throws(() => nthRootRationalIterative(r, 0n), RangeError)
			assert.throws(() => nthRootRationalIterative(r, -3n), RangeError)
			assert.throws(() => nthRootRationalIterative(r, 1.5), RangeError)
			assert.throws(() => nthRootRationalIterative(r, Number.NaN), RangeError)
			assert.throws(() => nthRootRationalIterative(r, Number.POSITIVE_INFINITY), RangeError)
			assert.throws(
				() => nthRootRationalIterative(r, Number.MAX_SAFE_INTEGER + 1),
				RangeError,
			)
		})

		test('rejects invalid options', () => {
			const r = { num: 2n, den: 1n }
			assert.throws(() => nthRootRationalIterative(r, 2, null), TypeError)
			assert.throws(() => nthRootRationalIterative(r, 2, []), TypeError)
			assert.throws(() => nthRootRationalIterative(r, 2, 'fast'), TypeError)
			assert.throws(
				() => nthRootRationalIterative(r, 2, { tolerance: { num: 0n, den: 1n } }),
				RangeError,
			)
			assert.throws(
				() => nthRootRationalIterative(r, 2, { tolerance: { num: -1n, den: 10n } }),
				RangeError,
			)
			assert.throws(
				() => nthRootRationalIterative(r, 2, { tolerance: { num: 1n, den: 0n } }),
				RangeError,
			)
			assert.throws(
				() => nthRootRationalIterative(r, 2, { tolerance: 1e-6 }),
				TypeError,
			)
			assert.throws(
				() => nthRootRationalIterative(r, 2, { maxIterations: 0 }),
				RangeError,
			)
			assert.throws(
				() => nthRootRationalIterative(r, 2, { maxIterations: -5 }),
				RangeError,
			)
			assert.throws(
				() => nthRootRationalIterative(r, 2, { maxIterations: 2.5 }),
				RangeError,
			)
			assert.throws(
				() => nthRootRationalIterative(r, 2, { maxIterations: '10' }),
				TypeError,
			)
		})
	})
})
