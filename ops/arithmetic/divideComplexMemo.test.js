import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideComplexMemo } from './divideComplexMemo.js'

/**
 * Independent helper: complex multiplication (a * b).
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Asserts two complex numbers are approximately equal within epsilon.
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [eps=1e-12]
 */
function assertComplexClose(actual, expected, eps = 1e-12) {
	const scaleRe = Math.max(1, Math.abs(expected.re))
	const scaleIm = Math.max(1, Math.abs(expected.im))
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps * scaleRe,
		`real part mismatch: expected ${expected.re}, got ${actual.re}`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps * scaleIm,
		`imag part mismatch: expected ${expected.im}, got ${actual.im}`,
	)
}

describe('divideComplexMemo', () => {
	test('divides standard complex numbers accurately', () => {
		assert.deepEqual(divideComplexMemo({ re: 4, im: 2 }, { re: 1, im: 1 }), { re: 3, im: -1 })
		assert.deepEqual(divideComplexMemo({ re: 3, im: 2 }, { re: 4, im: -3 }), { re: 0.24, im: 0.68 })
		assert.deepEqual(divideComplexMemo({ re: -6, im: -8 }, { re: -2, im: 2 }), { re: -0.5, im: 3.5 })
		assertComplexClose(divideComplexMemo({ re: 1.5, im: -2.5 }, { re: 0.5, im: 1.25 }), {
			re: -1.3103448275862069,
			im: -1.7241379310344827,
		})
	})

	test('handles pure real, pure imaginary, unit, and precomputed table divisors', () => {
		// Pure real
		assert.deepEqual(divideComplexMemo({ re: 10, im: 0 }, { re: 2, im: 0 }), { re: 5, im: 0 })
		// Pure imaginary
		assert.deepEqual(divideComplexMemo({ re: 0, im: 6 }, { re: 0, im: 2 }), { re: 3, im: 0 })
		assert.deepEqual(divideComplexMemo({ re: 1, im: 0 }, { re: 0, im: 1 }), { re: 0, im: -1 })
		assert.deepEqual(divideComplexMemo({ re: 0, im: 1 }, { re: 0, im: 1 }), { re: 1, im: 0 })
		// Power-of-two normSq table entries (normSq = 1, 2, 4, 8, 16, 32, 64, 128)
		assert.deepEqual(divideComplexMemo({ re: 7, im: -3 }, { re: -1, im: 0 }), { re: -7, im: 3 })
		assert.deepEqual(divideComplexMemo({ re: 8, im: 0 }, { re: 2, im: 2 }), { re: 2, im: -2 })
		assert.deepEqual(divideComplexMemo({ re: 128, im: 0 }, { re: 8, im: 8 }), { re: 8, im: -8 })
		// Non-power-of-two table entry (normSq = 5, 25, 65)
		assert.deepEqual(divideComplexMemo({ re: 5, im: 10 }, { re: 1, im: 2 }), { re: 5, im: 0 })
		assert.deepEqual(divideComplexMemo({ re: 25, im: 0 }, { re: 3, im: 4 }), { re: 3, im: -4 })
		assert.deepEqual(divideComplexMemo({ re: 65, im: 0 }, { re: 7, im: 4 }), { re: 7, im: -4 })
	})

	test('handles zero dividend and normalizes negative zero', () => {
		const res1 = divideComplexMemo({ re: 0, im: 0 }, { re: 3, im: -4 })
		assert.deepEqual(res1, { re: 0, im: 0 })
		assert.equal(Object.is(res1.re, -0), false)
		assert.equal(Object.is(res1.im, -0), false)

		const res2 = divideComplexMemo({ re: -0, im: -0 }, { re: -1, im: -0 })
		assert.deepEqual(res2, { re: 0, im: 0 })
		assert.equal(Object.is(res2.re, -0), false)
		assert.equal(Object.is(res2.im, -0), false)

		const res3 = divideComplexMemo({ re: 0, im: 0 }, { re: 12.5, im: -7.25 })
		assert.equal(Object.is(res3.re, -0), false)
		assert.equal(Object.is(res3.im, -0), false)
	})

	test('remains numerically stable for very large and very small magnitudes', () => {
		// Naive (b.re^2 + b.im^2) would overflow to Infinity here
		assertComplexClose(
			divideComplexMemo({ re: 1e200, im: 2e200 }, { re: 1e200, im: 1e200 }),
			{ re: 1.5, im: 0.5 },
		)
		// Extreme near-MAX_VALUE operands
		assertComplexClose(
			divideComplexMemo({ re: 1e308, im: 1e308 }, { re: 1e308, im: 1e308 }),
			{ re: 1, im: 0 },
		)
		// Extreme dividend with small precomputed table divisor
		assertComplexClose(
			divideComplexMemo({ re: 1e308, im: -1e308 }, { re: 1, im: 1 }),
			{ re: 0, im: -1e308 },
		)
		// Naive (b.re^2 + b.im^2) would underflow to 0 here
		assertComplexClose(
			divideComplexMemo({ re: 1e-200, im: 2e-200 }, { re: 1e-200, im: 1e-200 }),
			{ re: 1.5, im: 0.5 },
		)
		// Asymmetric |b.im| > |b.re| branch at large/small scales
		assertComplexClose(
			divideComplexMemo({ re: 2e250, im: 4e250 }, { re: 1e250, im: 3e250 }),
			{ re: 1.4, im: -0.2 },
		)
		assertComplexClose(
			divideComplexMemo({ re: 2e-250, im: 4e-250 }, { re: 1e-250, im: 3e-250 }),
			{ re: 1.4, im: -0.2 },
		)
	})

	test('memoization returns consistent results, isolates returned objects, and handles cache eviction', () => {
		const a = { re: 11, im: -7 }
		const b = { re: 3, im: 5 }

		const first = divideComplexMemo(a, b)
		// Mutate returned object; subsequent cached call must be unaffected
		first.re = 99999
		first.im = -99999

		const second = divideComplexMemo(a, b)
		assert.notEqual(first, second)
		assertComplexClose(second, { re: -2 / 34, im: -76 / 34 })

		// Exercise bounded LRU cache eviction (> 4096 distinct keys)
		for (let i = 1; i <= 4200; i++) {
			const q = divideComplexMemo({ re: i * 2, im: i }, { re: 2, im: 1 })
			assertComplexClose(q, { re: i, im: 0 })
		}
		// Re-query an evicted entry to ensure recomputation still matches
		assertComplexClose(divideComplexMemo(a, b), { re: -2 / 34, im: -76 / 34 })
	})

	test('validates inputs and throws TypeError or RangeError on invalid arguments', () => {
		// Invalid operand types
		for (const bad of [null, undefined, 42, '1+2i', true, [1, 2], () => {}]) {
			assert.throws(() => divideComplexMemo(bad, { re: 1, im: 0 }), TypeError)
			assert.throws(() => divideComplexMemo({ re: 1, im: 0 }, bad), TypeError)
		}

		// Missing or non-finite properties
		for (const badObj of [
			{},
			{ re: 1 },
			{ im: 1 },
			{ re: '1', im: 0 },
			{ re: 0, im: '1' },
			{ re: NaN, im: 0 },
			{ re: 0, im: NaN },
			{ re: Infinity, im: 0 },
			{ re: 0, im: -Infinity },
			{ re: 1n, im: 0 },
		]) {
			assert.throws(() => divideComplexMemo(badObj, { re: 1, im: 0 }), TypeError)
			assert.throws(() => divideComplexMemo({ re: 1, im: 0 }, badObj), TypeError)
		}

		// Division by zero
		assert.throws(() => divideComplexMemo({ re: 1, im: 2 }, { re: 0, im: 0 }), RangeError)
		assert.throws(() => divideComplexMemo({ re: 0, im: 0 }, { re: -0, im: -0 }), RangeError)
	})

	test('independent cross-checks: inverse multiplication, polar coordinates, and algebraic identities', () => {
		const samples = [
			{ re: 3, im: 4 },
			{ re: -5, im: 12 },
			{ re: 0.75, im: -1.25 },
			{ re: -2.3, im: -0.9 },
			{ re: 100, im: -37 },
			{ re: 0, im: -7 },
			{ re: 9, im: 0 },
			{ re: 1, im: 1 },
			{ re: -8, im: 8 },
		]

		for (const a of samples) {
			for (const b of samples) {
				const q = divideComplexMemo(a, b)

				// Cross-check 1: (a / b) * b === a
				const reconstructed = mulComplex(q, b)
				assertComplexClose(reconstructed, a, 1e-11)

				// Cross-check 2: |a / b| === |a| / |b| and arg(a / b) === arg(a) - arg(b) (mod 2π)
				const expectedMag = Math.hypot(a.re, a.im) / Math.hypot(b.re, b.im)
				const actualMag = Math.hypot(q.re, q.im)
				assert.ok(
					Math.abs(actualMag - expectedMag) <= 1e-11 * Math.max(1, expectedMag),
					`magnitude mismatch for (${a.re}+${a.im}i)/(${b.re}+${b.im}i)`,
				)

				const expectedArg = Math.atan2(a.im, a.re) - Math.atan2(b.im, b.re)
				const actualArg = Math.atan2(q.im, q.re)
				// Compare unit vectors on the circle to avoid branch-cut discontinuity at ±π
				assert.ok(
					Math.abs(Math.cos(actualArg) - Math.cos(expectedArg)) <= 1e-11 &&
						Math.abs(Math.sin(actualArg) - Math.sin(expectedArg)) <= 1e-11,
					`argument mismatch for (${a.re}+${a.im}i)/(${b.re}+${b.im}i)`,
				)

				// Cross-check 3: conj(a / b) === conj(a) / conj(b)
				const conjA = { re: a.re, im: -a.im }
				const conjB = { re: b.re, im: -b.im }
				const divConj = divideComplexMemo(conjA, conjB)
				assertComplexClose(divConj, { re: q.re, im: -q.im }, 1e-11)
			}
		}

		// Cross-check 4: transitivity (a / b) * (b / c) === a / c
		const a = { re: 7.25, im: -4.5 }
		const b = { re: -1.75, im: 3.125 }
		const c = { re: 2.5, im: 6.75 }
		const lhs = mulComplex(divideComplexMemo(a, b), divideComplexMemo(b, c))
		const rhs = divideComplexMemo(a, c)
		assertComplexClose(lhs, rhs, 1e-11)
	})
})
