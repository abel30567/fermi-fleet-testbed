import { describe, test } from 'node:test'
import assert from 'node:assert'
import { divideDualRecursive } from './divideDualRecursive.js'

/**
 * Independent reference quotient rule for dual numbers.
 *
 * @param {{ v: number, d: number }} a
 * @param {{ v: number, d: number }} b
 * @returns {{ v: number, d: number }}
 */
function directQuotientRule(a, b) {
	return {
		v: a.v / b.v,
		d: (a.d * b.v - a.v * b.d) / (b.v * b.v),
	}
}

/**
 * Asserts two finite numbers are close within combined relative/absolute tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-12]
 * @param {number} [absTol=1e-12]
 */
function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, limit=${limit})`,
	)
}

/**
 * Asserts two dual numbers match within tolerance.
 *
 * @param {{ v: number, d: number }} actual
 * @param {{ v: number, d: number }} expected
 * @param {number} [relTol=1e-12]
 * @param {number} [absTol=1e-12]
 */
function assertDualClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	assertClose(actual.v, expected.v, relTol, absTol)
	assertClose(actual.d, expected.d, relTol, absTol)
}

describe('divideDualRecursive', () => {
	test('computes basic binary dual division accurately', () => {
		const r1 = divideDualRecursive({ v: 6, d: 1 }, { v: 2, d: 0 })
		assertDualClose(r1, { v: 3, d: 0.5 })

		const r2 = divideDualRecursive({ v: 10, d: 3 }, { v: 4, d: -2 })
		// v = 10 / 4 = 2.5
		// d = (3*4 - 10*(-2)) / 16 = 32 / 16 = 2
		assertDualClose(r2, { v: 2.5, d: 2 })

		const r3 = divideDualRecursive({ v: 1, d: 0 }, { v: 3, d: 1 })
		assertDualClose(r3, { v: 1 / 3, d: -1 / 9 })
	})

	test('handles zero numerator and avoids -0 artifacts', () => {
		const rPos = divideDualRecursive({ v: 0, d: 0 }, { v: 2, d: 3 })
		assert.strictEqual(Object.is(rPos.v, 0), true)
		assert.strictEqual(Object.is(rPos.d, 0), true)

		const rNeg = divideDualRecursive({ v: 0, d: 0 }, { v: -2, d: 3 })
		assert.strictEqual(Object.is(rNeg.v, 0), true)
		assert.strictEqual(Object.is(rNeg.d, 0), true)

		const rZeroValWithDeriv = divideDualRecursive({ v: 0, d: 5 }, { v: 2, d: 7 })
		assert.strictEqual(Object.is(rZeroValWithDeriv.v, 0), true)
		assertClose(rZeroValWithDeriv.d, 2.5)
	})

	test('handles negative values and derivatives across all sign combinations', () => {
		const pairs = [
			[{ v: -12, d: 4 }, { v: 3, d: -1 }],
			[{ v: 12, d: -4 }, { v: -3, d: 1 }],
			[{ v: -12, d: -4 }, { v: -3, d: -1 }],
			[{ v: -7.5, d: 2.25 }, { v: -1.5, d: 0.75 }],
		]
		for (const [a, b] of pairs) {
			assertDualClose(divideDualRecursive(a, b), directQuotientRule(a, b))
		}
	})

	test('satisfies identity and self-division properties', () => {
		const x = { v: 7.25, d: -3.5 }
		assertDualClose(divideDualRecursive(x, { v: 1, d: 0 }), x)
		assertDualClose(divideDualRecursive(x, x), { v: 1, d: 0 })

		const inv = divideDualRecursive({ v: 1, d: 0 }, x)
		const roundTrip = divideDualRecursive({ v: 1, d: 0 }, inv)
		assertDualClose(roundTrip, x)
	})

	test('maintains stability on extreme scales where naive b.v * b.v overflows or underflows', () => {
		const huge = divideDualRecursive({ v: 6e200, d: 3e200 }, { v: 2e200, d: 1e200 })
		assertDualClose(huge, { v: 3, d: 0 })

		const hugeDiff = divideDualRecursive({ v: 4e200, d: 1e200 }, { v: 2e200, d: -1e200 })
		// v = 2, d = (1e200*2e200 - 4e200*(-1e200)) / (2e200)^2 = 6 / 4 = 1.5
		assertDualClose(hugeDiff, { v: 2, d: 1.5 })

		const tiny = divideDualRecursive({ v: 6e-200, d: 5e-200 }, { v: 2e-200, d: 1e-200 })
		// v = 3, d = (5*2 - 6*1) / 4 = 1
		assertDualClose(tiny, { v: 3, d: 1 })

		const subnormal = divideDualRecursive(
			{ v: Number.MIN_VALUE * 4, d: Number.MIN_VALUE * 2 },
			{ v: Number.MIN_VALUE * 2, d: Number.MIN_VALUE },
		)
		assertDualClose(subnormal, { v: 2, d: 0 })

		// Extreme exponent gap between b.v and b.d with zero numerator value
		const extremeGap = divideDualRecursive({ v: 0, d: 1 }, { v: 1e-200, d: 1e200 })
		assert.strictEqual(extremeGap.v, 0)
		assertClose(extremeGap.d, 1e200)
	})

	test('supports recursive divide-and-conquer variadic chained division', () => {
		const args = [
			{ v: 120, d: 7 },
			{ v: 2, d: 0.5 },
			{ v: -3, d: 1.25 },
			{ v: 5, d: -0.2 },
			{ v: 0.4, d: 0.1 },
		]

		const actual = divideDualRecursive(...args)
		let expected = args[0]
		for (let i = 1; i < args.length; i += 1) {
			expected = directQuotientRule(expected, args[i])
		}
		assertDualClose(actual, expected)

		// Odd number of divisors (3 total args)
		const actual3 = divideDualRecursive(args[0], args[1], args[2])
		const expected3 = directQuotientRule(directQuotientRule(args[0], args[1]), args[2])
		assertDualClose(actual3, expected3)
	})

	test('cross-checks against direct quotient rule across a grid of inputs', () => {
		const samples = [
			{ v: Math.PI, d: Math.E },
			{ v: -Math.SQRT2, d: 0.123456789 },
			{ v: 0.001, d: -1000 },
			{ v: 1e6, d: 42.5 },
			{ v: -0.75, d: -0.25 },
		]
		for (const a of samples) {
			for (const b of samples) {
				assertDualClose(divideDualRecursive(a, b), directQuotientRule(a, b))
			}
		}
	})

	test('cross-checks derivative against independent central finite differences of f(x) = g(x) / h(x)', () => {
		const hStep = 1e-6

		// Case 1: rational function f(x) = (x^3 + 2x - 1) / (x^2 + 1)
		const g1 = (x) => x ** 3 + 2 * x - 1
		const g1Prime = (x) => 3 * x ** 2 + 2
		const h1 = (x) => x ** 2 + 1
		const h1Prime = (x) => 2 * x
		const f1 = (x) => g1(x) / h1(x)

		for (const x of [-2.3, -0.5, 0, 1.25, 3.7]) {
			const dual = divideDualRecursive(
				{ v: g1(x), d: g1Prime(x) },
				{ v: h1(x), d: h1Prime(x) },
			)
			const cfd = (f1(x + hStep) - f1(x - hStep)) / (2 * hStep)
			assertClose(dual.v, f1(x), 1e-13, 1e-13)
			assertClose(dual.d, cfd, 1e-7, 1e-7)
		}

		// Case 2: transcendental quotient f(x) = (sin(x) * exp(x)) / (cos(x) + 2)
		const g2 = (x) => Math.sin(x) * Math.exp(x)
		const g2Prime = (x) => (Math.cos(x) + Math.sin(x)) * Math.exp(x)
		const h2 = (x) => Math.cos(x) + 2
		const h2Prime = (x) => -Math.sin(x)
		const f2 = (x) => g2(x) / h2(x)

		for (const x of [-1.2, 0.4, 1.8]) {
			const dual = divideDualRecursive(
				{ v: g2(x), d: g2Prime(x) },
				{ v: h2(x), d: h2Prime(x) },
			)
			const cfd = (f2(x + hStep) - f2(x - hStep)) / (2 * hStep)
			assertClose(dual.v, f2(x), 1e-13, 1e-13)
			assertClose(dual.d, cfd, 1e-7, 1e-7)
		}

		// Case 3: chained variadic quotient f(x) = (x^2 + 1) / (x + 3) / (sin(x) + 2)
		const f3 = (x) => (x ** 2 + 1) / (x + 3) / (Math.sin(x) + 2)
		const x3 = 0.7
		const dual3 = divideDualRecursive(
			{ v: x3 ** 2 + 1, d: 2 * x3 },
			{ v: x3 + 3, d: 1 },
			{ v: Math.sin(x3) + 2, d: Math.cos(x3) },
		)
		const cfd3 = (f3(x3 + hStep) - f3(x3 - hStep)) / (2 * hStep)
		assertClose(dual3.v, f3(x3), 1e-13, 1e-13)
		assertClose(dual3.d, cfd3, 1e-7, 1e-7)
	})

	test('throws RangeError on division by zero', () => {
		assert.throws(
			() => divideDualRecursive({ v: 1, d: 0 }, { v: 0, d: 0 }),
			RangeError,
		)
		assert.throws(
			() => divideDualRecursive({ v: 1, d: 2 }, { v: -0, d: 5 }),
			RangeError,
		)
		assert.throws(
			() => divideDualRecursive({ v: 10, d: 1 }, { v: 2, d: 0 }, { v: 0, d: 1 }),
			RangeError,
		)
	})

	test('throws appropriate errors on invalid or non-finite inputs', () => {
		assert.throws(() => divideDualRecursive(), TypeError)
		assert.throws(() => divideDualRecursive({ v: 1, d: 0 }), TypeError)
		assert.throws(() => divideDualRecursive(null, { v: 1, d: 0 }), TypeError)
		assert.throws(() => divideDualRecursive({ v: 1, d: 0 }, null), TypeError)
		assert.throws(() => divideDualRecursive([1, 0], { v: 1, d: 0 }), TypeError)
		assert.throws(() => divideDualRecursive({ v: '1', d: 0 }, { v: 1, d: 0 }), TypeError)
		assert.throws(() => divideDualRecursive({ v: 1 }, { v: 1, d: 0 }), TypeError)
		assert.throws(() => divideDualRecursive({ v: 1, d: 0 }, { v: 1, d: undefined }), TypeError)
		assert.throws(
			() => divideDualRecursive({ v: 1, d: 0 }, { v: 2, d: 0 }, 'bad'),
			TypeError,
		)

		assert.throws(() => divideDualRecursive({ v: Number.NaN, d: 0 }, { v: 1, d: 0 }), RangeError)
		assert.throws(() => divideDualRecursive({ v: 1, d: Number.POSITIVE_INFINITY }, { v: 1, d: 0 }), RangeError)
		assert.throws(() => divideDualRecursive({ v: 1, d: 0 }, { v: Number.NEGATIVE_INFINITY, d: 0 }), RangeError)
		assert.throws(() => divideDualRecursive({ v: 1, d: 0 }, { v: 1, d: Number.NaN }), RangeError)
	})
})
