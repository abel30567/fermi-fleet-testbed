import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nthRootComplexSeries } from './nthRootComplexSeries.js'

/**
 * Independent complex multiplication helper.
 */
function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Independent integer exponentiation via binary exponentiation.
 */
function complexPowInt(z, n) {
	let result = { re: 1, im: 0 }
	let base = { re: z.re, im: z.im }
	let exp = n
	while (exp > 0) {
		if (exp & 1) {
			result = complexMul(result, base)
		}
		base = complexMul(base, base)
		exp = Math.floor(exp / 2)
	}
	return result
}

/**
 * Independent reference using built-in Math.hypot, Math.atan2, Math.pow, Math.cos, Math.sin.
 */
function referenceNthRoot(z, n, k = 0) {
	const re = z.re === 0 ? 0 : z.re
	const im = z.im === 0 ? 0 : z.im
	if (re === 0 && im === 0) return { re: 0, im: 0 }
	const kMod = ((k % n) + n) % n
	const r = Math.pow(Math.hypot(re, im), 1 / n)
	const phi = (Math.atan2(im, re) + 2 * Math.PI * kMod) / n
	return { re: r * Math.cos(phi), im: r * Math.sin(phi) }
}

function assertComplexClose(actual, expected, relTol = 1e-12, absTol = 1e-12, msg = '') {
	const expectedMag = Math.hypot(expected.re, expected.im)
	const tol = Math.max(absTol, relTol * expectedMag)
	const errRe = Math.abs(actual.re - expected.re)
	const errIm = Math.abs(actual.im - expected.im)
	assert.ok(
		errRe <= tol && errIm <= tol,
		`${msg} expected (${expected.re}, ${expected.im}), got (${actual.re}, ${actual.im}), tol=${tol}`,
	)
}

describe('nthRootComplexSeries', () => {
	test('positive real numbers (square, cube, fourth, fifth roots)', () => {
		assertComplexClose(nthRootComplexSeries({ re: 9, im: 0 }, 2), { re: 3, im: 0 })
		assertComplexClose(nthRootComplexSeries({ re: 27, im: 0 }, 3), { re: 3, im: 0 })
		assertComplexClose(nthRootComplexSeries({ re: 16, im: 0 }, 4), { re: 2, im: 0 })
		assertComplexClose(nthRootComplexSeries({ re: 32, im: 0 }, 5), { re: 2, im: 0 })
		assertComplexClose(nthRootComplexSeries({ re: 2, im: 0 }, 2), { re: Math.SQRT2, im: 0 })
	})

	test('negative real numbers return principal complex root', () => {
		const sqrtNeg1 = nthRootComplexSeries({ re: -1, im: 0 }, 2)
		assert.equal(sqrtNeg1.re, 0)
		assert.equal(sqrtNeg1.im, 1)

		assertComplexClose(nthRootComplexSeries({ re: -4, im: 0 }, 2), { re: 0, im: 2 })
		// Principal cube root of -8 is 2 * exp(i*pi/3) = 1 + i*sqrt(3)
		assertComplexClose(nthRootComplexSeries({ re: -8, im: 0 }, 3), {
			re: 1,
			im: Math.sqrt(3),
		})
		// Principal 4th root of -1 is exp(i*pi/4) = sqrt(2)/2 * (1 + i)
		assertComplexClose(nthRootComplexSeries({ re: -1, im: 0 }, 4), {
			re: Math.SQRT1_2,
			im: Math.SQRT1_2,
		})
	})

	test('pure imaginary and all-quadrant complex inputs', () => {
		assertComplexClose(nthRootComplexSeries({ re: 0, im: 1 }, 2), {
			re: Math.SQRT1_2,
			im: Math.SQRT1_2,
		})
		assertComplexClose(nthRootComplexSeries({ re: 0, im: -1 }, 2), {
			re: Math.SQRT1_2,
			im: -Math.SQRT1_2,
		})
		// (2 + i)^2 = 3 + 4i
		assertComplexClose(nthRootComplexSeries({ re: 3, im: 4 }, 2), { re: 2, im: 1 })
		// (1 + 2i)^2 = -3 + 4i
		assertComplexClose(nthRootComplexSeries({ re: -3, im: 4 }, 2), { re: 1, im: 2 })
		// (1 - 2i)^2 = -3 - 4i
		assertComplexClose(nthRootComplexSeries({ re: -3, im: -4 }, 2), { re: 1, im: -2 })
		// (2 - i)^2 = 3 - 4i
		assertComplexClose(nthRootComplexSeries({ re: 3, im: -4 }, 2), { re: 2, im: -1 })
	})

	test('branch index k returns all distinct roots and wraps modulo n', () => {
		// 4th roots of unity: 1, i, -1, -i
		assertComplexClose(nthRootComplexSeries({ re: 1, im: 0 }, 4, 0), { re: 1, im: 0 })
		assertComplexClose(nthRootComplexSeries({ re: 1, im: 0 }, 4, 1), { re: 0, im: 1 })
		assertComplexClose(nthRootComplexSeries({ re: 1, im: 0 }, 4, 2), { re: -1, im: 0 })
		assertComplexClose(nthRootComplexSeries({ re: 1, im: 0 }, 4, 3), { re: 0, im: -1 })

		// Wrapping for k >= n and negative k
		assertComplexClose(nthRootComplexSeries({ re: 1, im: 0 }, 4, 5), { re: 0, im: 1 })
		assertComplexClose(nthRootComplexSeries({ re: 1, im: 0 }, 4, -1), { re: 0, im: -1 })
		assertComplexClose(nthRootComplexSeries({ re: -8, im: 0 }, 3, 1), { re: -2, im: 0 })
		assertComplexClose(nthRootComplexSeries({ re: -8, im: 0 }, 3, 2), {
			re: 1,
			im: -Math.sqrt(3),
		})
	})

	test('binomial series path near z = 1 and continuity across radius boundary', () => {
		const nearOneCases = [
			{ re: 1, im: 0 },
			{ re: 1.1, im: -0.1 },
			{ re: 0.85, im: 0.1 },
			{ re: 1 + 1e-12, im: 1e-12 },
			{ re: 1, im: 1e-15 },
			{ re: 1 - 0.24, im: 0.05 },
		]
		for (const z of nearOneCases) {
			for (const n of [2, 3, 5, 7]) {
				const root = nthRootComplexSeries(z, n)
				const ref = referenceNthRoot(z, n)
				assertComplexClose(root, ref, 1e-14, 1e-14, `z=${JSON.stringify(z)}, n=${n}`)
				assertComplexClose(complexPowInt(root, n), z, 1e-13, 1e-13)
			}
		}

		// Check smooth continuity across |z - 1| = 0.25 boundary
		const inside = nthRootComplexSeries({ re: 1.249999, im: 0.0 }, 3)
		const outside = nthRootComplexSeries({ re: 1.250001, im: 0.0 }, 3)
		assert.ok(Math.abs(outside.re - inside.re) < 1e-5)
		assert.equal(inside.im, 0)
		assert.equal(outside.im, 0)
	})

	test('edge cases: zero, negative zero, and n = 1', () => {
		const zeroRoot = nthRootComplexSeries({ re: 0, im: 0 }, 3)
		assert.equal(Object.is(zeroRoot.re, 0), true)
		assert.equal(Object.is(zeroRoot.im, 0), true)

		const negZeroRoot = nthRootComplexSeries({ re: -0, im: -0 }, 4, 2)
		assert.equal(Object.is(negZeroRoot.re, 0), true)
		assert.equal(Object.is(negZeroRoot.im, 0), true)

		// Negative real axis with -0 imaginary part uses canonical principal branch (+pi)
		const negRealNegZero = nthRootComplexSeries({ re: -1, im: -0 }, 2)
		assert.equal(negRealNegZero.re, 0)
		assert.equal(negRealNegZero.im, 1)

		// n = 1 returns normalized z regardless of k
		const n1 = nthRootComplexSeries({ re: -5.5, im: -0 }, 1, 7)
		assert.equal(n1.re, -5.5)
		assert.equal(Object.is(n1.im, 0), true)
	})

	test('extreme magnitudes (near overflow and subnormal) and high n', () => {
		// 1.5e308 + 1.5e308i overflows naive Math.hypot, but square root is finite!
		const huge = { re: 1.5e308, im: 1.5e308 }
		const sqrtHuge = nthRootComplexSeries(huge, 2)
		assert.ok(Number.isFinite(sqrtHuge.re) && Number.isFinite(sqrtHuge.im))
		const expectedMag = Math.sqrt(1.5 * Math.SQRT2) * 1e154
		assertComplexClose(
			sqrtHuge,
			{ re: expectedMag * Math.cos(Math.PI / 8), im: expectedMag * Math.sin(Math.PI / 8) },
			1e-13,
			0,
		)

		// Very small / subnormal inputs
		const tiny = { re: 1e-300, im: 1e-300 }
		const sqrtTiny = nthRootComplexSeries(tiny, 2)
		assertComplexClose(complexPowInt(sqrtTiny, 2), tiny, 1e-13, 0)

		const subnormal = { re: Number.MIN_VALUE, im: 0 }
		const sqrtSub = nthRootComplexSeries(subnormal, 2)
		assert.ok(Number.isFinite(sqrtSub.re) && sqrtSub.re > 0)
		assertComplexClose({ re: sqrtSub.re * sqrtSub.re, im: 0 }, subnormal, 1e-12, 0)

		// Large root degree n
		const highN = nthRootComplexSeries({ re: 2, im: 3 }, 1_000_000)
		assertComplexClose(highN, referenceNthRoot({ re: 2, im: 3 }, 1_000_000), 1e-14, 1e-14)
	})

	test('invalid inputs throw TypeError or RangeError', () => {
		// Invalid z
		for (const badZ of [null, undefined, 42, '1+i', [1, 2], true]) {
			assert.throws(() => nthRootComplexSeries(badZ, 2), TypeError)
		}
		assert.throws(() => nthRootComplexSeries({ re: '1', im: 0 }, 2), TypeError)
		assert.throws(() => nthRootComplexSeries({ re: 1, im: undefined }, 2), TypeError)
		assert.throws(() => nthRootComplexSeries({ re: NaN, im: 0 }, 2), RangeError)
		assert.throws(() => nthRootComplexSeries({ re: 0, im: Infinity }, 2), RangeError)
		assert.throws(() => nthRootComplexSeries({ re: -Infinity, im: 1 }, 2), RangeError)

		// Invalid n
		for (const badN of ['2', null, undefined, {}, []]) {
			assert.throws(() => nthRootComplexSeries({ re: 1, im: 0 }, badN), TypeError)
		}
		for (const badN of [0, -1, -3, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 2]) {
			assert.throws(() => nthRootComplexSeries({ re: 1, im: 0 }, badN), RangeError)
		}

		// Invalid k
		for (const badK of ['0', null, {}, []]) {
			assert.throws(() => nthRootComplexSeries({ re: 1, im: 0 }, 2, badK), TypeError)
		}
		for (const badK of [0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 2]) {
			assert.throws(() => nthRootComplexSeries({ re: 1, im: 0 }, 2, badK), RangeError)
		}
	})

	test('independent cross-check: w^n === z and agreement with Math polar reference', () => {
		const samples = [
			{ re: 5, im: 0 },
			{ re: -7, im: 0 },
			{ re: 0, im: 6 },
			{ re: 0, im: -9 },
			{ re: 1.05, im: -0.05 },
			{ re: 3.5, im: 2.25 },
			{ re: -4.1, im: 7.3 },
			{ re: -2.8, im: -5.6 },
			{ re: 6.4, im: -1.9 },
			{ re: 1e-10, im: -2e-10 },
			{ re: 1e10, im: 3e10 },
		]

		for (const z of samples) {
			for (const n of [2, 3, 4, 5, 6, 7]) {
				for (let k = 0; k < n; k += 1) {
					const root = nthRootComplexSeries(z, n, k)
					const ref = referenceNthRoot(z, n, k)
					assertComplexClose(root, ref, 1e-13, 1e-13, `ref z=${JSON.stringify(z)} n=${n} k=${k}`)

					const reconstructed = complexPowInt(root, n)
					assertComplexClose(
						reconstructed,
						z,
						1e-11,
						1e-11,
						`pow z=${JSON.stringify(z)} n=${n} k=${k}`,
					)
				}
			}
		}
	})

	test('independent cross-check: Vieta formulas for sum and product of all n roots', () => {
		const testCases = [
			{ z: { re: 3, im: 4 }, n: 3 },
			{ z: { re: -5, im: 12 }, n: 4 },
			{ z: { re: 0.7, im: -1.3 }, n: 5 },
			{ z: { re: -2.5, im: -3.5 }, n: 6 },
		]

		for (const { z, n } of testCases) {
			let sum = { re: 0, im: 0 }
			let prod = { re: 1, im: 0 }
			for (let k = 0; k < n; k += 1) {
				const root = nthRootComplexSeries(z, n, k)
				sum = { re: sum.re + root.re, im: sum.im + root.im }
				prod = complexMul(prod, root)
			}

			// Sum of all n-th roots of z (n >= 2) is 0
			assertComplexClose(sum, { re: 0, im: 0 }, 1e-12, 1e-12, `sum n=${n}`)

			// Product of all n-th roots of z is (-1)^(n - 1) * z
			const sign = n % 2 === 0 ? -1 : 1
			assertComplexClose(prod, { re: sign * z.re, im: sign * z.im }, 1e-11, 1e-11, `prod n=${n}`)
		}
	})
})
