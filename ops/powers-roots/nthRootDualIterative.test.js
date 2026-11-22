import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nthRootDualIterative } from './nthRootDualIterative.js'

/**
 * Independent helper: dual multiplication.
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	}
}

/**
 * Independent helper: raise a dual number to a positive integer power n.
 */
function dualPow(a, n) {
	let res = { v: 1, d: 0 }
	for (let i = 0; i < n; i++) {
		res = dualMul(res, a)
	}
	return res
}

/**
 * Independent helper: real signed n-th root via Math.pow.
 */
function realNthRoot(v, n) {
	if (v === 0) return 0
	return v < 0 ? -Math.pow(-v, 1 / n) : Math.pow(v, 1 / n)
}

/**
 * Assert two numbers agree within relative + absolute tolerance.
 */
function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-15, label = '') {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(Math.abs(actual), Math.abs(expected))
	assert.ok(
		diff <= absTol + relTol * scale,
		`${label}expected ${expected}, got ${actual} (diff=${diff}, tol=${absTol + relTol * scale})`,
	)
}

describe('nthRootDualIterative', () => {
	describe('normal cases', () => {
		test('n = 1 acts as identity on dual numbers', () => {
			assert.deepStrictEqual(nthRootDualIterative({ v: 7, d: 3 }, 1), { v: 7, d: 3 })
			assert.deepStrictEqual(nthRootDualIterative({ v: -4.5, d: -2.5 }, 1), {
				v: -4.5,
				d: -2.5,
			})
			assert.deepStrictEqual(nthRootDualIterative({ v: 0, d: 9 }, 1), { v: 0, d: 9 })
			assert.deepStrictEqual(nthRootDualIterative({ v: 0, d: 0 }, 1), { v: 0, d: 0 })
		})

		test('exact integer roots for positive values', () => {
			// sqrt(9 + 6ε) = 3 + (6 / (2*3))ε = 3 + 1ε
			const r2 = nthRootDualIterative({ v: 9, d: 6 }, 2)
			assertClose(r2.v, 3, 1e-14)
			assertClose(r2.d, 1, 1e-14)

			// cbrt(27 + 54ε) = 3 + (54 / (3*9))ε = 3 + 2ε
			const r3 = nthRootDualIterative({ v: 27, d: 54 }, 3)
			assertClose(r3.v, 3, 1e-14)
			assertClose(r3.d, 2, 1e-14)

			// 4th root(16 - 32ε) = 2 + (-32 / (4*8))ε = 2 - 1ε
			const r4 = nthRootDualIterative({ v: 16, d: -32 }, 4)
			assertClose(r4.v, 2, 1e-14)
			assertClose(r4.d, -1, 1e-14)

			// 5th root(243 + 405ε) = 3 + (405 / (5*81))ε = 3 + 1ε
			const r5 = nthRootDualIterative({ v: 243, d: 405 }, 5)
			assertClose(r5.v, 3, 1e-14)
			assertClose(r5.d, 1, 1e-14)
		})

		test('odd roots of negative values', () => {
			// cbrt(-8 + 12ε) = -2 + (12 / (3*(-2)^2))ε = -2 + 1ε
			const r3 = nthRootDualIterative({ v: -8, d: 12 }, 3)
			assertClose(r3.v, -2, 1e-14)
			assertClose(r3.d, 1, 1e-14)

			// cbrt(-27 + 6ε) = -3 + (6 / 27)ε = -3 + (2/9)ε
			const r3b = nthRootDualIterative({ v: -27, d: 6 }, 3)
			assertClose(r3b.v, -3, 1e-14)
			assertClose(r3b.d, 2 / 9, 1e-14)

			// 5th root(-32 - 10ε) = -2 + (-10 / (5*16))ε = -2 - 0.125ε
			const r5 = nthRootDualIterative({ v: -32, d: -10 }, 5)
			assertClose(r5.v, -2, 1e-14)
			assertClose(r5.d, -0.125, 1e-14)

			// 7th root(-128 + 0ε) = -2 + 0ε
			const r7 = nthRootDualIterative({ v: -128, d: 0 }, 7)
			assertClose(r7.v, -2, 1e-14)
			assert.strictEqual(Object.is(r7.d, 0), true)
		})

		test('does not mutate input dual number', () => {
			const input = Object.freeze({ v: 16, d: 8 })
			const out = nthRootDualIterative(input, 2)
			assert.notStrictEqual(out, input)
			assertClose(out.v, 4, 1e-14)
			assertClose(out.d, 1, 1e-14)
		})
	})

	describe('edge cases', () => {
		test('v === 0 handling for n === 1 and n > 1', () => {
			assert.deepStrictEqual(nthRootDualIterative({ v: 0, d: 5 }, 1), { v: 0, d: 5 })
			assert.deepStrictEqual(nthRootDualIterative({ v: -0, d: -0 }, 1), { v: 0, d: 0 })

			for (const n of [2, 3, 4, 5, 10]) {
				const res = nthRootDualIterative({ v: 0, d: 0 }, n)
				assert.deepStrictEqual(res, { v: 0, d: 0 })
				assert.strictEqual(Object.is(res.v, 0), true)
				assert.strictEqual(Object.is(res.d, 0), true)

				const resNegZero = nthRootDualIterative({ v: -0, d: -0 }, n)
				assert.deepStrictEqual(resNegZero, { v: 0, d: 0 })
				assert.strictEqual(Object.is(resNegZero.v, 0), true)
				assert.strictEqual(Object.is(resNegZero.d, 0), true)

				assert.throws(
					() => nthRootDualIterative({ v: 0, d: 1 }, n),
					RangeError,
				)
				assert.throws(
					() => nthRootDualIterative({ v: -0, d: -1e-10 }, n),
					RangeError,
				)
			}
		})

		test('unit values v = 1 and v = -1', () => {
			for (const n of [1, 2, 3, 4, 10, 50]) {
				const pos = nthRootDualIterative({ v: 1, d: 3 }, n)
				assertClose(pos.v, 1, 1e-14)
				assertClose(pos.d, 3 / n, 1e-14)
			}
			for (const n of [1, 3, 5, 11]) {
				const neg = nthRootDualIterative({ v: -1, d: 3 }, n)
				assertClose(neg.v, -1, 1e-14)
				assertClose(neg.d, 3 / n, 1e-14)
			}
		})

		test('extreme magnitudes and large root degrees', () => {
			// Very large v
			const big = nthRootDualIterative({ v: 1e200, d: 1e100 }, 5)
			assertClose(big.v, 1e40, 1e-13)
			assertClose(big.d, 1e100 / (5 * 1e160), 1e-13)

			// Very small v where naive b^2 division would underflow
			const small = nthRootDualIterative({ v: 1e-300, d: 1e100 }, 2)
			assertClose(small.v, 1e-150, 1e-13)
			assertClose(small.d, 0.5e250, 1e-13)

			// Subnormal v
			const sub = nthRootDualIterative({ v: Number.MIN_VALUE, d: 1 }, 2)
			const expectedV = Math.sqrt(Number.MIN_VALUE)
			assertClose(sub.v, expectedV, 1e-13)
			assertClose(sub.d, 1 / (2 * expectedV), 1e-13)

			// Near Number.MAX_VALUE with large n
			const maxLargeN = nthRootDualIterative({ v: 1e300, d: 1e200 }, 100)
			const r100 = Math.pow(1e300, 1 / 100)
			assertClose(maxLargeN.v, r100, 1e-12)
			assertClose(maxLargeN.d, 1e200 / (100 * Math.pow(r100, 99)), 1e-11)

			// Large n = 1000
			const r1000 = nthRootDualIterative({ v: 2, d: 1 }, 1000)
			const expected1000 = Math.pow(2, 1 / 1000)
			assertClose(r1000.v, expected1000, 1e-12)
			assertClose(r1000.d, 1 / (1000 * Math.pow(expected1000, 999)), 1e-11)

			// Derivative underflow to 0 stays finite
			const underflowD = nthRootDualIterative({ v: 1e300, d: 1e-200 }, 2)
			assertClose(underflowD.v, 1e150, 1e-13)
			assert.strictEqual(underflowD.d, 0)

			// Derivative overflow throws RangeError
			assert.throws(
				() => nthRootDualIterative({ v: 1e-300, d: 1e200 }, 2),
				RangeError,
			)
		})
	})

	describe('input validation', () => {
		test('rejects invalid x types with TypeError', () => {
			for (const bad of [null, undefined, 42, '1', true, [1, 2], () => {}]) {
				assert.throws(() => nthRootDualIterative(bad, 2), TypeError)
			}
			for (const bad of [
				{},
				{ v: 4 },
				{ d: 1 },
				{ v: '4', d: 1 },
				{ v: 4, d: '1' },
				{ v: null, d: 1 },
				{ v: 4, d: undefined },
			]) {
				assert.throws(() => nthRootDualIterative(bad, 2), TypeError)
			}
		})

		test('rejects non-finite x components with RangeError', () => {
			for (const bad of [
				{ v: NaN, d: 1 },
				{ v: 4, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: -Infinity, d: 1 },
				{ v: 4, d: Infinity },
				{ v: 4, d: -Infinity },
			]) {
				assert.throws(() => nthRootDualIterative(bad, 2), RangeError)
			}
		})

		test('rejects invalid n values', () => {
			for (const badType of ['2', null, undefined, {}, [], 2n, true]) {
				assert.throws(() => nthRootDualIterative({ v: 4, d: 1 }, badType), TypeError)
			}
			for (const badRange of [
				0,
				-1,
				-2,
				-3,
				0.5,
				2.5,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
			]) {
				assert.throws(() => nthRootDualIterative({ v: 4, d: 1 }, badRange), RangeError)
			}
		})

		test('rejects even roots of negative values with RangeError', () => {
			for (const n of [2, 4, 6, 8, 100]) {
				assert.throws(() => nthRootDualIterative({ v: -1, d: 0 }, n), RangeError)
				assert.throws(() => nthRootDualIterative({ v: -16, d: 1 }, n), RangeError)
				assert.throws(() => nthRootDualIterative({ v: -1e-100, d: 2 }, n), RangeError)
			}
		})
	})

	describe('cross-checks', () => {
		test('matches Math.pow and analytic derivative d / (n * r^(n-1))', () => {
			const cases = [
				{ v: 2, d: 1, n: 2 },
				{ v: 3.14159, d: -2.71828, n: 2 },
				{ v: 10, d: 3.5, n: 3 },
				{ v: -10, d: 3.5, n: 3 },
				{ v: 0.001, d: 0.25, n: 3 },
				{ v: -0.001, d: -0.25, n: 3 },
				{ v: 81.5, d: 4.2, n: 4 },
				{ v: 0.37, d: -1.9, n: 5 },
				{ v: -0.37, d: -1.9, n: 5 },
				{ v: 123456.789, d: 0.01, n: 6 },
				{ v: -98765.432, d: 12.34, n: 7 },
				{ v: 42, d: 7, n: 12 },
				{ v: -42, d: -7, n: 13 },
				{ v: 1e12, d: 1e6, n: 20 },
			]

			for (const { v, d, n } of cases) {
				const res = nthRootDualIterative({ v, d }, n)
				const expectedV = realNthRoot(v, n)
				const expectedD = d / (n * Math.pow(expectedV, n - 1))
				assertClose(res.v, expectedV, 1e-13, 1e-15, `v for (${v}, ${d}, n=${n}): `)
				assertClose(res.d, expectedD, 1e-12, 1e-15, `d for (${v}, ${d}, n=${n}): `)
			}
		})

		test('matches central finite-difference derivatives', () => {
			const cases = [
				{ v: 2.5, d: 1, n: 2 },
				{ v: 7.3, d: -3.2, n: 3 },
				{ v: -7.3, d: 2.4, n: 3 },
				{ v: 12.1, d: 0.75, n: 4 },
				{ v: -5.5, d: -1.5, n: 5 },
				{ v: 0.64, d: 4.1, n: 6 },
				{ v: -0.64, d: 4.1, n: 7 },
				{ v: 100, d: 5, n: 9 },
			]

			for (const { v, d, n } of cases) {
				const h = 1e-6 * Math.max(1, Math.abs(v))
				const fPlus = realNthRoot(v + h, n)
				const fMinus = realNthRoot(v - h, n)
				const fdDeriv = ((fPlus - fMinus) / (2 * h)) * d

				const res = nthRootDualIterative({ v, d }, n)
				assertClose(
					res.d,
					fdDeriv,
					1e-8,
					1e-10,
					`finite-diff d for (${v}, ${d}, n=${n}): `,
				)
			}
		})

		test('satisfies y^n == x in dual arithmetic', () => {
			const cases = [
				{ v: 2, d: 1, n: 1 },
				{ v: 2, d: 3.5, n: 2 },
				{ v: 17.25, d: -4.1, n: 3 },
				{ v: -17.25, d: 4.1, n: 3 },
				{ v: 0.05, d: 0.02, n: 4 },
				{ v: -0.05, d: -0.02, n: 5 },
				{ v: 999.9, d: 123.4, n: 6 },
				{ v: -999.9, d: -123.4, n: 7 },
				{ v: 1.0001, d: 50, n: 15 },
			]

			for (const { v, d, n } of cases) {
				const y = nthRootDualIterative({ v, d }, n)
				const reconstructed = dualPow(y, n)
				assertClose(reconstructed.v, v, 1e-12, 1e-15, `y^${n}.v for (${v}, ${d}): `)
				assertClose(reconstructed.d, d, 1e-12, 1e-15, `y^${n}.d for (${v}, ${d}): `)
			}
		})

		test('satisfies root composition nthRoot(nthRoot(x, a), b) == nthRoot(x, a*b)', () => {
			const xPos = { v: 729, d: 12.5 }
			const nestedPos = nthRootDualIterative(nthRootDualIterative(xPos, 2), 3)
			const directPos = nthRootDualIterative(xPos, 6)
			assertClose(nestedPos.v, directPos.v, 1e-13)
			assertClose(nestedPos.d, directPos.d, 1e-12)

			const xNeg = { v: -512, d: -7.5 }
			const nestedNeg = nthRootDualIterative(nthRootDualIterative(xNeg, 3), 5)
			const directNeg = nthRootDualIterative(xNeg, 15)
			assertClose(nestedNeg.v, directNeg.v, 1e-13)
			assertClose(nestedNeg.d, directNeg.d, 1e-12)
		})
	})
})
