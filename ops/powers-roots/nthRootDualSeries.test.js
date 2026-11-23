import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nthRootDualSeries } from './nthRootDualSeries.js'

/**
 * Assert two numbers are close within relative + absolute tolerance.
 */
function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12, msg = '') {
	assert.ok(Number.isFinite(actual), `${msg} expected finite number, got ${actual}`)
	const diff = Math.abs(actual - expected)
	const tol = Math.max(absTol, relTol * Math.abs(expected))
	assert.ok(
		diff <= tol,
		`${msg} actual=${actual}, expected=${expected}, diff=${diff}, tol=${tol}`,
	)
}

/**
 * Dual multiplication: (a + b*eps)(c + d*eps) = ac + (ad + bc)*eps
 */
function dualMul(a, b) {
	return { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
}

/**
 * Dual reciprocal: 1 / (a + b*eps) = 1/a - (b / a^2)*eps
 */
function dualInv(a) {
	return { v: 1 / a.v, d: -a.d / (a.v * a.v) }
}

/**
 * Raise a dual number to an integer power via binary exponentiation.
 */
function dualPowInt(x, exp) {
	if (exp === 0) return { v: 1, d: 0 }
	let base = exp < 0 ? dualInv(x) : x
	let e = Math.abs(exp)
	let acc = { v: 1, d: 0 }
	while (e > 0) {
		if (e & 1) acc = dualMul(acc, base)
		e >>= 1
		if (e > 0) base = dualMul(base, base)
	}
	return acc
}

/**
 * Reference scalar real nth root using Math.pow for independent finite-difference checks.
 */
function refNthRoot(v, n) {
	if (v < 0) return -Math.pow(-v, 1 / n)
	return Math.pow(v, 1 / n)
}

describe('nthRootDualSeries', () => {
	test('exact power-of-two roots and simple square/cube/fourth/fifth roots', () => {
		const r2 = nthRootDualSeries({ v: 16, d: 1 }, 2)
		assert.strictEqual(r2.v, 4)
		assertClose(r2.d, 1 / 8, 1e-15, 1e-15)

		const r3 = nthRootDualSeries({ v: 8, d: 3 }, 3)
		assert.strictEqual(r3.v, 2)
		assertClose(r3.d, 3 / (3 * 4), 1e-15, 1e-15)

		const r4 = nthRootDualSeries({ v: 16, d: 8 }, 4)
		assert.strictEqual(r4.v, 2)
		assertClose(r4.d, 8 / (4 * 8), 1e-15, 1e-15)

		const r5 = nthRootDualSeries({ v: 243, d: 5 }, 5)
		assertClose(r5.v, 3, 1e-14, 1e-14)
		assertClose(r5.d, 5 / (5 * 81), 1e-14, 1e-14)

		const r10 = nthRootDualSeries({ v: 1024, d: -2 }, 10)
		assert.strictEqual(r10.v, 2)
		assertClose(r10.d, (2 * -2) / (10 * 1024), 1e-15, 1e-15)
	})

	test('n = 1, n = -1, v = 1, and zero derivative cases', () => {
		assert.deepStrictEqual(nthRootDualSeries({ v: 7.5, d: -2.25 }, 1), { v: 7.5, d: -2.25 })
		assert.deepStrictEqual(nthRootDualSeries({ v: -7.5, d: 2.25 }, 1), { v: -7.5, d: 2.25 })

		const invPos = nthRootDualSeries({ v: 4, d: 3 }, -1)
		assert.strictEqual(invPos.v, 0.25)
		assert.strictEqual(invPos.d, -3 / 16)

		const invNeg = nthRootDualSeries({ v: -4, d: 3 }, -1)
		assert.strictEqual(invNeg.v, -0.25)
		assert.strictEqual(invNeg.d, -3 / 16)

		const atOne = nthRootDualSeries({ v: 1, d: 6 }, 3)
		assert.strictEqual(atOne.v, 1)
		assertClose(atOne.d, 2, 1e-15, 1e-15)

		const zeroD = nthRootDualSeries({ v: 27, d: 0 }, 3)
		assertClose(zeroD.v, 3, 1e-14, 1e-14)
		assert.ok(Object.is(zeroD.d, 0), 'derivative should be +0, not -0')

		const zeroDNegN = nthRootDualSeries({ v: 8, d: 0 }, -3)
		assert.strictEqual(zeroDNegN.v, 0.5)
		assert.ok(Object.is(zeroDNegN.d, 0), 'derivative should be +0, not -0')
	})

	test('negative bases with odd integer n (positive and negative)', () => {
		const cbrtNeg = nthRootDualSeries({ v: -8, d: 1 }, 3)
		assert.strictEqual(cbrtNeg.v, -2)
		assertClose(cbrtNeg.d, 1 / 12, 1e-15, 1e-15)

		const fifthNeg = nthRootDualSeries({ v: -32, d: -5 }, 5)
		assert.strictEqual(fifthNeg.v, -2)
		assertClose(fifthNeg.d, -5 / (5 * 16), 1e-15, 1e-15)

		const negOddNeg = nthRootDualSeries({ v: -8, d: 1 }, -3)
		assert.strictEqual(negOddNeg.v, -0.5)
		assertClose(negOddNeg.d, -1 / 48, 1e-15, 1e-15)

		const negOne = nthRootDualSeries({ v: -1, d: 4 }, 7)
		assert.strictEqual(negOne.v, -1)
		assertClose(negOne.d, 4 / 7, 1e-15, 1e-15)
	})

	test('fractional and negative real root degrees', () => {
		// n = 0.5 => x^2, derivative = 2*v*d
		const sq = nthRootDualSeries({ v: 5, d: 3 }, 0.5)
		assertClose(sq.v, 25, 1e-14, 1e-14)
		assertClose(sq.d, 2 * 5 * 3, 1e-14, 1e-14)

		// n = -2 => x^(-1/2), derivative = -0.5 * v^(-3/2) * d
		const invSqrt = nthRootDualSeries({ v: 9, d: 2 }, -2)
		assertClose(invSqrt.v, 1 / 3, 1e-14, 1e-14)
		assertClose(invSqrt.d, (-0.5 * 2) / 27, 1e-14, 1e-14)

		// n = 2.5 => x^0.4
		const frac = nthRootDualSeries({ v: 3.7, d: -1.4 }, 2.5)
		assertClose(frac.v, Math.pow(3.7, 0.4), 1e-14, 1e-14)
		assertClose(frac.d, 0.4 * Math.pow(3.7, -0.6) * -1.4, 1e-14, 1e-14)
	})

	test('edge cases at x.v = 0 and extreme magnitudes', () => {
		// v = 0, d = 0, n > 0 => { v: 0, d: 0 }
		const z1 = nthRootDualSeries({ v: 0, d: 0 }, 3)
		assert.ok(Object.is(z1.v, 0) && Object.is(z1.d, 0))

		// v = -0, d = -0 normalized to +0
		const z2 = nthRootDualSeries({ v: -0, d: -0 }, 2)
		assert.ok(Object.is(z2.v, 0) && Object.is(z2.d, 0))

		// v = 0, n = 1, d != 0 => identity { v: 0, d }
		assert.deepStrictEqual(nthRootDualSeries({ v: 0, d: 4.5 }, 1), { v: 0, d: 4.5 })

		// v = 0, 0 < n < 1 => exponent 1/n > 1 so derivative at 0 is 0
		const z3 = nthRootDualSeries({ v: 0, d: 5 }, 0.5)
		assert.ok(Object.is(z3.v, 0) && Object.is(z3.d, 0))

		// Very large and very small positive numbers
		const huge = nthRootDualSeries({ v: 1e300, d: 1e300 }, 3)
		assertClose(huge.v, 1e100, 1e-13, 0)
		assertClose(huge.d, 1e100 / 3, 1e-13, 0)

		const tiny = nthRootDualSeries({ v: 1e-300, d: 1e-300 }, 3)
		assertClose(tiny.v, 1e-100, 1e-13, 0)
		assertClose(tiny.d, 1e-100 / 3, 1e-13, 0)

		// Subnormal positive value: 2^-1050 => cube root is exact 2^-350
		const sub = nthRootDualSeries({ v: 2 ** -1050, d: 2 ** -1050 }, 3)
		assert.strictEqual(sub.v, 2 ** -350)
		assertClose(sub.d, 2 ** -350 / 3, 1e-14, 0)

		// Extreme d/v ratios that would spuriously overflow/underflow naive grouping
		const extHigh = nthRootDualSeries({ v: 1e-200, d: 1e200 }, 2)
		assertClose(extHigh.v, 1e-100, 1e-13, 0)
		assertClose(extHigh.d, 0.5e300, 1e-13, 0)

		const extLow = nthRootDualSeries({ v: 1e200, d: 1e-200 }, 2)
		assertClose(extLow.v, 1e100, 1e-13, 0)
		assertClose(extLow.d, 0.5e-300, 1e-13, 0)
	})

	test('dual root degree n = { v, d }', () => {
		// f(t) = (v + d*t)^(1 / (nv + nd*t))
		const x = { v: 12.5, d: 1.7 }
		const n = { v: 3.2, d: -0.4 }
		const res = nthRootDualSeries(x, n)

		const expectedV = Math.pow(x.v, 1 / n.v)
		const expectedD =
			expectedV * (x.d / (n.v * x.v) - (n.d * Math.log(x.v)) / (n.v * n.v))
		assertClose(res.v, expectedV, 1e-14, 1e-14)
		assertClose(res.d, expectedD, 1e-14, 1e-14)

		// Dual n with nd = 0 behaves identically to scalar n (including negative x.v with odd n)
		const negDualN = nthRootDualSeries({ v: -27, d: 2 }, { v: 3, d: 0 })
		assertClose(negDualN.v, -3, 1e-14, 1e-14)
		assertClose(negDualN.d, 2 / 27, 1e-14, 1e-14)
	})

	test('input validation and domain errors', () => {
		// Invalid x types
		assert.throws(() => nthRootDualSeries(null, 2), TypeError)
		assert.throws(() => nthRootDualSeries(undefined, 2), TypeError)
		assert.throws(() => nthRootDualSeries(4, 2), TypeError)
		assert.throws(() => nthRootDualSeries([4, 1], 2), TypeError)
		assert.throws(() => nthRootDualSeries({ v: '4', d: 1 }, 2), TypeError)
		assert.throws(() => nthRootDualSeries({ v: 4 }, 2), TypeError)

		// Non-finite x
		assert.throws(() => nthRootDualSeries({ v: NaN, d: 1 }, 2), RangeError)
		assert.throws(() => nthRootDualSeries({ v: 4, d: Infinity }, 2), RangeError)
		assert.throws(() => nthRootDualSeries({ v: -Infinity, d: 0 }, 3), RangeError)

		// Invalid n types and values
		assert.throws(() => nthRootDualSeries({ v: 4, d: 1 }, '2'), TypeError)
		assert.throws(() => nthRootDualSeries({ v: 4, d: 1 }, null), TypeError)
		assert.throws(() => nthRootDualSeries({ v: 4, d: 1 }, [2, 0]), TypeError)
		assert.throws(() => nthRootDualSeries({ v: 4, d: 1 }, 0), RangeError)
		assert.throws(() => nthRootDualSeries({ v: 4, d: 1 }, NaN), RangeError)
		assert.throws(() => nthRootDualSeries({ v: 4, d: 1 }, Infinity), RangeError)
		assert.throws(() => nthRootDualSeries({ v: 4, d: 1 }, { v: 0, d: 1 }), RangeError)
		assert.throws(() => nthRootDualSeries({ v: 4, d: 1 }, { v: 2, d: NaN }), RangeError)

		// Domain errors
		assert.throws(() => nthRootDualSeries({ v: -4, d: 1 }, 2), RangeError)
		assert.throws(() => nthRootDualSeries({ v: -4, d: 1 }, -2), RangeError)
		assert.throws(() => nthRootDualSeries({ v: -4, d: 1 }, 2.5), RangeError)
		assert.throws(() => nthRootDualSeries({ v: -8, d: 1 }, { v: 3, d: 0.1 }), RangeError)
		assert.throws(() => nthRootDualSeries({ v: 0, d: 0 }, -2), RangeError)
		assert.throws(() => nthRootDualSeries({ v: 0, d: 1 }, 2), RangeError)
		assert.throws(() => nthRootDualSeries({ v: 0, d: 0 }, { v: 2, d: 1 }), RangeError)
	})

	test('independent cross-check: central finite-difference derivative check', () => {
		const cases = [
			{ x: { v: 2.5, d: 1.3 }, n: 2 },
			{ x: { v: 19.7, d: -0.8 }, n: 3 },
			{ x: { v: 0.123, d: 2.1 }, n: 5 },
			{ x: { v: 42.0, d: 0.7 }, n: -4 },
			{ x: { v: 6.28, d: -1.5 }, n: 1.75 },
			{ x: { v: 3.14, d: 0.9 }, n: 0.4 },
			{ x: { v: -11.5, d: 2.4 }, n: 3 },
			{ x: { v: -2.75, d: -0.6 }, n: -5 },
		]

		const h = 1e-6
		for (const { x, n } of cases) {
			const res = nthRootDualSeries(x, n)
			const fPlus = refNthRoot(x.v + h * x.d, n)
			const fMinus = refNthRoot(x.v - h * x.d, n)
			const fdDeriv = (fPlus - fMinus) / (2 * h)

			assertClose(
				res.v,
				refNthRoot(x.v, n),
				1e-13,
				1e-13,
				`value mismatch for v=${x.v}, n=${n}:`,
			)
			assertClose(
				res.d,
				fdDeriv,
				1e-7,
				1e-7,
				`finite-diff derivative mismatch for v=${x.v}, d=${x.d}, n=${n}:`,
			)
		}

		// Finite-difference check for dual n = { v, d }
		const dualCases = [
			{ x: { v: 5.5, d: 1.2 }, n: { v: 2.7, d: 0.5 } },
			{ x: { v: 0.4, d: -0.3 }, n: { v: -1.5, d: 0.8 } },
		]
		for (const { x, n } of dualCases) {
			const res = nthRootDualSeries(x, n)
			const fPlus = Math.pow(x.v + h * x.d, 1 / (n.v + h * n.d))
			const fMinus = Math.pow(x.v - h * x.d, 1 / (n.v - h * n.d))
			const fdDeriv = (fPlus - fMinus) / (2 * h)

			assertClose(res.d, fdDeriv, 1e-7, 1e-7, 'dual-n finite-diff mismatch:')
		}
	})

	test('independent cross-check: algebraic identities over dual numbers', () => {
		// 1. Inverse identity: (nthRoot(x, n))^n === x (both value and derivative)
		const inverseCases = [
			{ x: { v: 7.3, d: 2.1 }, n: 2 },
			{ x: { v: 13.8, d: -1.9 }, n: 3 },
			{ x: { v: 0.37, d: 0.85 }, n: 4 },
			{ x: { v: 5.2, d: -3.4 }, n: -3 },
			{ x: { v: -9.4, d: 1.6 }, n: 3 },
			{ x: { v: -3.8, d: -0.7 }, n: -5 },
		]
		for (const { x, n } of inverseCases) {
			const root = nthRootDualSeries(x, n)
			const recovered = dualPowInt(root, n)
			assertClose(recovered.v, x.v, 1e-12, 1e-12, `inverse v for n=${n}:`)
			assertClose(recovered.d, x.d, 1e-12, 1e-12, `inverse d for n=${n}:`)
		}

		// 2. Multiplicative identity: nthRoot(a * b, n) === nthRoot(a, n) * nthRoot(b, n)
		const a = { v: 3.5, d: 1.2 }
		const b = { v: 6.2, d: -0.9 }
		for (const n of [2, 3, 5, -2, 1.5]) {
			const lhs = nthRootDualSeries(dualMul(a, b), n)
			const rhs = dualMul(nthRootDualSeries(a, n), nthRootDualSeries(b, n))
			assertClose(lhs.v, rhs.v, 1e-13, 1e-13, `product v for n=${n}:`)
			assertClose(lhs.d, rhs.d, 1e-13, 1e-13, `product d for n=${n}:`)
		}

		// 3. Nested root identity: nthRoot(nthRoot(x, m), n) === nthRoot(x, m * n)
		const x = { v: 11.25, d: 2.75 }
		const nested = nthRootDualSeries(nthRootDualSeries(x, 3), 4)
		const direct = nthRootDualSeries(x, 12)
		assertClose(nested.v, direct.v, 1e-13, 1e-13, 'nested root v:')
		assertClose(nested.d, direct.d, 1e-13, 1e-13, 'nested root d:')
	})
})
