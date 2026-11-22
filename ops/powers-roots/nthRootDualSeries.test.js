import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nthRootDualSeries } from './nthRootDualSeries.js'

/**
 * Asserts that `actual` is close to `expected` using a combined relative/absolute tolerance.
 */
function assertClose(actual, expected, tol = 1e-12, label = '') {
	const scale = Math.max(1, Math.abs(expected))
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol * scale,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff = ${diff})`
	)
}

/**
 * Independent scalar real n-th root helper for cross-checks.
 */
function scalarNthRoot(v, n) {
	if (v === 0) return 0
	return v < 0 ? -Math.pow(-v, 1 / n) : Math.pow(v, 1 / n)
}

/**
 * Independent dual-number integer exponentiation via binary exponentiation:
 * (a + bε)(c + dε) = (ac) + (ad + bc)ε.
 */
function dualPowInt(z, n) {
	let res = { v: 1, d: 0 }
	let base = { v: z.v, d: z.d }
	let exp = n
	while (exp > 0) {
		if (exp & 1) {
			res = { v: res.v * base.v, d: res.v * base.d + res.d * base.v }
		}
		exp >>= 1
		if (exp > 0) {
			base = { v: base.v * base.v, d: 2 * base.v * base.d }
		}
	}
	return res
}

describe('nthRootDualSeries', () => {
	describe('normal cases', () => {
		test('square roots (n = 2) of positive numbers', () => {
			const r1 = nthRootDualSeries({ v: 4, d: 1 }, 2)
			assertClose(r1.v, 2)
			assertClose(r1.d, 0.25)

			const r2 = nthRootDualSeries({ v: 9, d: 6 }, 2)
			assertClose(r2.v, 3)
			assertClose(r2.d, 1)

			const r3 = nthRootDualSeries({ v: 2, d: -3 }, 2)
			assertClose(r3.v, Math.SQRT2)
			assertClose(r3.d, -3 / (2 * Math.SQRT2))
		})

		test('cube roots (n = 3) of positive and negative numbers', () => {
			const pos = nthRootDualSeries({ v: 8, d: 1 }, 3)
			assertClose(pos.v, 2)
			assertClose(pos.d, 1 / 12)

			const neg = nthRootDualSeries({ v: -8, d: 1 }, 3)
			assertClose(neg.v, -2)
			assertClose(neg.d, 1 / 12)

			const negDeriv = nthRootDualSeries({ v: -27, d: -9 }, 3)
			assertClose(negDeriv.v, -3)
			assertClose(negDeriv.d, -1 / 3)
		})

		test('higher even and odd roots', () => {
			const r4 = nthRootDualSeries({ v: 16, d: 32 }, 4)
			assertClose(r4.v, 2)
			assertClose(r4.d, 1)

			const r5Pos = nthRootDualSeries({ v: 32, d: 5 }, 5)
			assertClose(r5Pos.v, 2)
			assertClose(r5Pos.d, 1 / 16)

			const r5Neg = nthRootDualSeries({ v: -32, d: 5 }, 5)
			assertClose(r5Neg.v, -2)
			assertClose(r5Neg.d, 1 / 16)

			const r7Neg = nthRootDualSeries({ v: -128, d: -7 }, 7)
			assertClose(r7Neg.v, -2)
			assertClose(r7Neg.d, -1 / 64)
		})

		test('zero derivative preserves primal root and yields exact +0 derivative', () => {
			const pos = nthRootDualSeries({ v: 16, d: 0 }, 4)
			assertClose(pos.v, 2)
			assert.ok(Object.is(pos.d, 0))

			const neg = nthRootDualSeries({ v: -27, d: 0 }, 3)
			assertClose(neg.v, -3)
			assert.ok(Object.is(neg.d, 0))
		})

		test('derivative scales linearly with input d', () => {
			const base = nthRootDualSeries({ v: 5.5, d: 1 }, 5)
			const scaled = nthRootDualSeries({ v: 5.5, d: -3.25 }, 5)
			assertClose(scaled.v, base.v)
			assertClose(scaled.d, -3.25 * base.d)
		})
	})

	describe('edge cases', () => {
		test('n = 1 acts as identity for positive, negative, and zero values', () => {
			assert.deepStrictEqual(nthRootDualSeries({ v: 7.5, d: -2.25 }, 1), { v: 7.5, d: -2.25 })
			assert.deepStrictEqual(nthRootDualSeries({ v: -4.2, d: 3.1 }, 1), { v: -4.2, d: 3.1 })
			assert.deepStrictEqual(nthRootDualSeries({ v: 0, d: 9.5 }, 1), { v: 0, d: 9.5 })
			assert.deepStrictEqual(nthRootDualSeries({ v: 0, d: 0 }, 1), { v: 0, d: 0 })
			const negZero = nthRootDualSeries({ v: -0, d: -0 }, 1)
			assert.ok(Object.is(negZero.v, 0))
			assert.ok(Object.is(negZero.d, 0))
		})

		test('v = 0 with n > 1 returns {v: 0, d: 0} when d === 0 and throws RangeError when d !== 0', () => {
			for (const n of [2, 3, 4, 5, 10]) {
				const res = nthRootDualSeries({ v: 0, d: 0 }, n)
				assert.ok(Object.is(res.v, 0))
				assert.ok(Object.is(res.d, 0))

				const resNegZero = nthRootDualSeries({ v: -0, d: -0 }, n)
				assert.ok(Object.is(resNegZero.v, 0))
				assert.ok(Object.is(resNegZero.d, 0))

				assert.throws(() => nthRootDualSeries({ v: 0, d: 1 }, n), RangeError)
				assert.throws(() => nthRootDualSeries({ v: 0, d: -1e-12 }, n), RangeError)
			}
		})

		test('even root of negative v throws RangeError regardless of d', () => {
			for (const n of [2, 4, 6, 100]) {
				assert.throws(() => nthRootDualSeries({ v: -1, d: 0 }, n), RangeError)
				assert.throws(() => nthRootDualSeries({ v: -16, d: 1 }, n), RangeError)
				assert.throws(() => nthRootDualSeries({ v: -1e-10, d: -2 }, n), RangeError)
			}
		})

		test('handles large magnitudes and high n without spurious overflow', () => {
			const big = nthRootDualSeries({ v: 1e200, d: 1e200 }, 100)
			assertClose(big.v, 100, 1e-12)
			// d / (n * r^(n-1)) = r * d / (n * v) = 100 * 1 / 100 = 1
			assertClose(big.d, 1, 1e-12)

			const small = nthRootDualSeries({ v: 1e-200, d: 1e-200 }, 100)
			assertClose(small.v, 0.01, 1e-12)
			// r * d / (n * v) = 0.01 * 1 / 100 = 1e-4
			assertClose(small.d, 1e-4, 1e-12)
		})

		test('rejects invalid dual input x', () => {
			for (const bad of [null, undefined, 4, '4', true, {}, { v: 4 }, { d: 1 }, { v: '4', d: 1 }, { v: 4, d: '1' }]) {
				assert.throws(() => nthRootDualSeries(bad, 2), TypeError)
			}
			for (const bad of [
				{ v: NaN, d: 1 },
				{ v: 1, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: -Infinity, d: 1 },
				{ v: 1, d: Infinity },
				{ v: 1, d: -Infinity }
			]) {
				assert.throws(() => nthRootDualSeries(bad, 2), RangeError)
			}
		})

		test('rejects invalid root degree n', () => {
			for (const badN of [null, undefined, '2', true, {}, []]) {
				assert.throws(() => nthRootDualSeries({ v: 4, d: 1 }, badN), TypeError)
			}
			for (const badN of [0, -1, -2, 1.5, 2.0001, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => nthRootDualSeries({ v: 4, d: 1 }, badN), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('raising dual result to the n-th power recovers original dual number x', () => {
			const cases = [
				{ x: { v: 3.7, d: 1.4 }, n: 1 },
				{ x: { v: 5.25, d: -2.3 }, n: 2 },
				{ x: { v: 19.8, d: 4.1 }, n: 3 },
				{ x: { v: -19.8, d: 4.1 }, n: 3 },
				{ x: { v: 0.0625, d: 0.5 }, n: 4 },
				{ x: { v: -243.5, d: -7.2 }, n: 5 },
				{ x: { v: 12.34, d: 0 }, n: 6 },
				{ x: { v: -0.75, d: 2.5 }, n: 7 },
				{ x: { v: 1000, d: -13.7 }, n: 9 }
			]

			for (const { x, n } of cases) {
				const root = nthRootDualSeries(x, n)
				const reconstructed = dualPowInt(root, n)
				assertClose(reconstructed.v, x.v, 1e-11, `v for n=${n}, v=${x.v}`)
				assertClose(reconstructed.d, x.d, 1e-11, `d for n=${n}, v=${x.v}`)
			}
		})

		test('derivative matches central finite-difference approximation', () => {
			const cases = [
				{ v: 0.25, n: 2 },
				{ v: 7.3, n: 2 },
				{ v: 11.4, n: 3 },
				{ v: -11.4, n: 3 },
				{ v: 20.5, n: 4 },
				{ v: -3.6, n: 5 },
				{ v: 42.1, n: 6 },
				{ v: -0.85, n: 7 }
			]

			for (const { v, n } of cases) {
				const h = Math.max(Math.abs(v), 1) * 1e-6
				const fd = (scalarNthRoot(v + h, n) - scalarNthRoot(v - h, n)) / (2 * h)
				const { d } = nthRootDualSeries({ v, d: 1 }, n)
				assertClose(d, fd, 1e-8, `central FD for n=${n}, v=${v}`)
			}
		})
	})
})
