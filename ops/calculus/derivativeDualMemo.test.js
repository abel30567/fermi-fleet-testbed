import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { derivativeDualMemo, DUAL_OPS } from './derivativeDualMemo.js'

const EPS = 1e-12

function assertNear(actual, expected, tol = EPS, msg) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		msg ?? `Expected ${actual} to be within ${tol} of ${expected}`,
	)
}

function assertDualNear(actual, expected, tol = EPS) {
	assertNear(actual.v, expected.v, tol, `v: expected ${actual.v} ≈ ${expected.v}`)
	assertNear(actual.d, expected.d, tol, `d: expected ${actual.d} ≈ ${expected.d}`)
}

/**
 * Independent central finite-difference numerical derivative for cross-checking.
 */
function centralDiff(fn, x, h = 1e-6) {
	return (fn(x + h) - fn(x - h)) / (2 * h)
}

describe('derivativeDualMemo: table-driven unary operations', () => {
	test('trigonometric functions (sin, cos, tan)', () => {
		const x = 0.7
		assertDualNear(derivativeDualMemo('sin', x), { v: Math.sin(x), d: Math.cos(x) })
		assertDualNear(derivativeDualMemo('cos', x), { v: Math.cos(x), d: -Math.sin(x) })
		assertDualNear(derivativeDualMemo('tan', x), {
			v: Math.tan(x),
			d: 1 / (Math.cos(x) ** 2),
		})
	})

	test('inverse trig and hyperbolic functions', () => {
		const x = 0.4
		assertDualNear(derivativeDualMemo('asin', x), {
			v: Math.asin(x),
			d: 1 / Math.sqrt(1 - x * x),
		})
		assertDualNear(derivativeDualMemo('acos', x), {
			v: Math.acos(x),
			d: -1 / Math.sqrt(1 - x * x),
		})
		assertDualNear(derivativeDualMemo('atan', x), {
			v: Math.atan(x),
			d: 1 / (1 + x * x),
		})
		assertDualNear(derivativeDualMemo('sinh', x), { v: Math.sinh(x), d: Math.cosh(x) })
		assertDualNear(derivativeDualMemo('cosh', x), { v: Math.cosh(x), d: Math.sinh(x) })
		assertDualNear(derivativeDualMemo('tanh', x), {
			v: Math.tanh(x),
			d: 1 - Math.tanh(x) ** 2,
		})
	})

	test('exponential, logarithmic, and algebraic table ops', () => {
		const x = 2.5
		assertDualNear(derivativeDualMemo('exp', x), { v: Math.exp(x), d: Math.exp(x) })
		assertDualNear(derivativeDualMemo('expm1', x), { v: Math.expm1(x), d: Math.exp(x) })
		assertDualNear(derivativeDualMemo('log', x), { v: Math.log(x), d: 1 / x })
		assertDualNear(derivativeDualMemo('log1p', x), { v: Math.log1p(x), d: 1 / (1 + x) })
		assertDualNear(derivativeDualMemo('sqrt', x), {
			v: Math.sqrt(x),
			d: 1 / (2 * Math.sqrt(x)),
		})
		assertDualNear(derivativeDualMemo('cbrt', x), {
			v: Math.cbrt(x),
			d: 1 / (3 * Math.cbrt(x) ** 2),
		})
		assertDualNear(derivativeDualMemo('square', x), { v: 6.25, d: 5 })
		assertDualNear(derivativeDualMemo('cube', x), { v: 15.625, d: 18.75 })
		assertDualNear(derivativeDualMemo('reciprocal', x), { v: 0.4, d: -0.16 })
		assertDualNear(derivativeDualMemo('neg', x), { v: -2.5, d: -1 })
		assertDualNear(derivativeDualMemo('identity', x), { v: 2.5, d: 1 })
		assertDualNear(derivativeDualMemo('abs', -3.5), { v: 3.5, d: -1 })
		assertDualNear(derivativeDualMemo('abs', 3.5), { v: 3.5, d: 1 })
	})

	test('propagates incoming dual tangent via chain rule', () => {
		const seed = { v: 1.2, d: 3.5 }
		assertDualNear(derivativeDualMemo('sin', seed), {
			v: Math.sin(1.2),
			d: Math.cos(1.2) * 3.5,
		})
		// Composition: d/dx exp(sin(x)) at x = 0.8
		const inner = derivativeDualMemo('sin', { v: 0.8, d: 1 })
		const composed = derivativeDualMemo('exp', inner)
		const direct = derivativeDualMemo((x, ops) => ops.exp(ops.sin(x)), 0.8)
		assertDualNear(composed, direct)
	})
})

describe('derivativeDualMemo: composite functions and polynomials', () => {
	test('product, quotient, and power rules via DUAL_OPS', () => {
		// f(x) = (x^2 + 1) * sin(x) / (x + 2)
		const fn = (x, ops) =>
			ops.div(ops.mul(ops.add(ops.pow(x, 2), 1), ops.sin(x)), ops.add(x, 2))
		const x = 1.5
		const res = derivativeDualMemo(fn, x)

		const u = (x * x + 1) * Math.sin(x)
		const du = 2 * x * Math.sin(x) + (x * x + 1) * Math.cos(x)
		const w = x + 2
		const dw = 1
		assertDualNear(res, {
			v: u / w,
			d: (du * w - u * dw) / (w * w),
		})
	})

	test('general dual exponent x^x', () => {
		const fn = (x, ops) => ops.pow(x, x)
		const x = 2.3
		const res = derivativeDualMemo(fn, x)
		const val = x ** x
		assertDualNear(res, { v: val, d: val * (Math.log(x) + 1) })
	})

	test('polynomial coefficient arrays (Horner evaluation)', () => {
		// P(x) = 3 - 2x + 5x^2 - x^3; P'(x) = -2 + 10x - 3x^2
		const coeffs = [3, -2, 5, -1]
		const x = 2
		assert.deepStrictEqual(derivativeDualMemo(coeffs, x), {
			v: 3 - 4 + 20 - 8,
			d: -2 + 20 - 12,
		})
		// Scaled incoming tangent d = 4
		assert.deepStrictEqual(derivativeDualMemo(coeffs, { v: 2, d: 4 }), {
			v: 11,
			d: 24,
		})
		// Constant polynomial
		assert.deepStrictEqual(derivativeDualMemo([42], 7), { v: 42, d: 0 })
		// ops.poly inside a composite function
		const res = derivativeDualMemo((t, ops) => ops.sin(ops.poly([1, 0, 2], t)), 0.5)
		// sin(1 + 2x^2) => cos(1.5) * 4*0.5
		assertDualNear(res, { v: Math.sin(1.5), d: Math.cos(1.5) * 2 })
	})
})

describe('derivativeDualMemo: memoization behavior', () => {
	test('caches repeated evaluations for identical (v, d) and isolates returned objects', () => {
		let calls = 0
		const fn = (x, ops) => {
			calls++
			return ops.add(ops.sin(x), ops.pow(x, 3))
		}

		const first = derivativeDualMemo(fn, 1.25)
		const second = derivativeDualMemo(fn, { v: 1.25, d: 1 })
		assert.equal(calls, 1)
		assert.deepStrictEqual(first, second)

		// Mutating returned object must not corrupt cache
		first.v = -999
		first.d = -999
		const third = derivativeDualMemo(fn, 1.25)
		assert.equal(calls, 1)
		assert.deepStrictEqual(third, second)

		// Different input triggers evaluation
		derivativeDualMemo(fn, { v: 1.25, d: 2 })
		assert.equal(calls, 2)

		// memoize: false bypasses cache
		derivativeDualMemo(fn, 1.25, { memoize: false })
		assert.equal(calls, 3)
	})

	test('normalizes -0 and +0 to the same cache key and canonical zero', () => {
		let calls = 0
		const fn = (x, ops) => {
			calls++
			return ops.neg(x)
		}
		const r1 = derivativeDualMemo(fn, -0)
		const r2 = derivativeDualMemo(fn, 0)
		assert.equal(calls, 1)
		assert.ok(Object.is(r1.v, 0))
		assert.deepStrictEqual(r1, r2)
	})

	test('unary table cache reuses primal+derivative across varying tangents', () => {
		const a = derivativeDualMemo('exp', { v: 0.5, d: 2 })
		const b = derivativeDualMemo('exp', { v: 0.5, d: 7 })
		assertDualNear(a, { v: Math.exp(0.5), d: 2 * Math.exp(0.5) })
		assertDualNear(b, { v: Math.exp(0.5), d: 7 * Math.exp(0.5) })
	})
})

describe('derivativeDualMemo: edge cases and input validation', () => {
	test('handles zero tangent at boundary points and extreme tanh without overflow', () => {
		assert.deepStrictEqual(derivativeDualMemo('sqrt', { v: 0, d: 0 }), { v: 0, d: 0 })
		assert.deepStrictEqual(derivativeDualMemo('abs', { v: 0, d: 0 }), { v: 0, d: 0 })
		assert.deepStrictEqual(derivativeDualMemo('cbrt', { v: 0, d: 0 }), { v: 0, d: 0 })
		assert.deepStrictEqual(derivativeDualMemo('asin', { v: 1, d: 0 }), {
			v: Math.PI / 2,
			d: 0,
		})
		// tanh(100) has derivative ~0 without NaN from cosh(100)^2 overflow
		assert.deepStrictEqual(derivativeDualMemo('tanh', 100), { v: 1, d: 0 })
		// x^0 has derivative 0 even at x = 0 or x < 0
		assert.deepStrictEqual(
			derivativeDualMemo((x, ops) => ops.pow(x, 0), 0),
			{ v: 1, d: 0 },
		)
		assert.deepStrictEqual(
			derivativeDualMemo((x, ops) => ops.pow(x, 3), -2),
			{ v: -8, d: 12 },
		)
	})

	test('throws TypeError on invalid argument types', () => {
		assert.throws(() => derivativeDualMemo(null, 1), TypeError)
		assert.throws(() => derivativeDualMemo(123, 1), TypeError)
		assert.throws(() => derivativeDualMemo('sin', null), TypeError)
		assert.throws(() => derivativeDualMemo('sin', '1'), TypeError)
		assert.throws(() => derivativeDualMemo('sin', [1, 1]), TypeError)
		assert.throws(() => derivativeDualMemo('sin', { v: 1 }), TypeError)
		assert.throws(() => derivativeDualMemo([1, '2'], 1), TypeError)
		assert.throws(() => derivativeDualMemo('sin', 1, null), TypeError)
		assert.throws(() => derivativeDualMemo('sin', 1, []), TypeError)
		assert.throws(() => derivativeDualMemo('sin', 1, { memoize: 'yes' }), TypeError)
		assert.throws(() => derivativeDualMemo(() => 42, 1), TypeError)
	})

	test('throws RangeError on non-finite values and domain violations', () => {
		assert.throws(() => derivativeDualMemo('unknownOp', 1), RangeError)
		assert.throws(() => derivativeDualMemo([], 1), RangeError)
		assert.throws(() => derivativeDualMemo('sin', Number.NaN), RangeError)
		assert.throws(() => derivativeDualMemo('sin', Number.POSITIVE_INFINITY), RangeError)
		assert.throws(() => derivativeDualMemo('sin', { v: 1, d: Number.NaN }), RangeError)
		assert.throws(() => derivativeDualMemo('log', 0), RangeError)
		assert.throws(() => derivativeDualMemo('log', -2), RangeError)
		assert.throws(() => derivativeDualMemo('log1p', -1), RangeError)
		assert.throws(() => derivativeDualMemo('sqrt', -1), RangeError)
		assert.throws(() => derivativeDualMemo('sqrt', { v: 0, d: 1 }), RangeError)
		assert.throws(() => derivativeDualMemo('cbrt', { v: 0, d: 1 }), RangeError)
		assert.throws(() => derivativeDualMemo('abs', { v: 0, d: 1 }), RangeError)
		assert.throws(() => derivativeDualMemo('reciprocal', 0), RangeError)
		assert.throws(() => derivativeDualMemo('asin', 1.5), RangeError)
		assert.throws(() => derivativeDualMemo('asin', { v: 1, d: 1 }), RangeError)
		assert.throws(() => derivativeDualMemo('acos', { v: -1, d: 1 }), RangeError)
		assert.throws(
			() => derivativeDualMemo((x, ops) => ops.div(1, x), 0),
			RangeError,
		)
		assert.throws(
			() => derivativeDualMemo((x, ops) => ops.pow(-2, x), 1),
			RangeError,
		)
		assert.throws(() => derivativeDualMemo(() => ({ v: Infinity, d: 0 }), 1), RangeError)
	})

	test('DUAL_OPS is frozen and supports constant/variable helpers', () => {
		assert.ok(Object.isFrozen(DUAL_OPS))
		assert.deepStrictEqual(DUAL_OPS.constant(5), { v: 5, d: 0 })
		assert.deepStrictEqual(DUAL_OPS.variable(3, 2), { v: 3, d: 2 })
	})
})

describe('derivativeDualMemo: independent cross-checks', () => {
	test('agrees with central finite differences across diverse functions', () => {
		const cases = [
			{
				name: 'exp(sin(x)) + log(x^2 + 1)',
				dual: (x, ops) =>
					ops.add(ops.exp(ops.sin(x)), ops.log(ops.add(ops.square(x), 1))),
				scalar: (x) => Math.exp(Math.sin(x)) + Math.log(x * x + 1),
				points: [-2.1, -0.4, 0, 0.75, 2.3],
			},
			{
				name: 'atan(sinh(x)) / (1 + cos(x)^2)',
				dual: (x, ops) =>
					ops.div(
						ops.atan(ops.sinh(x)),
						ops.add(1, ops.square(ops.cos(x))),
					),
				scalar: (x) => Math.atan(Math.sinh(x)) / (1 + Math.cos(x) ** 2),
				points: [-1.3, -0.2, 0.5, 1.4],
			},
			{
				name: 'x^x * sqrt(x + 2)',
				dual: (x, ops) => ops.mul(ops.pow(x, x), ops.sqrt(ops.add(x, 2))),
				scalar: (x) => x ** x * Math.sqrt(x + 2),
				points: [0.3, 1.0, 1.8],
			},
			{
				name: 'polynomial [2, -3, 0.5, 4, -0.25]',
				dual: [2, -3, 0.5, 4, -0.25],
				scalar: (x) => 2 - 3 * x + 0.5 * x ** 2 + 4 * x ** 3 - 0.25 * x ** 4,
				points: [-3, -0.5, 0, 1.5, 4],
			},
		]

		for (const c of cases) {
			for (const pt of c.points) {
				const res = derivativeDualMemo(c.dual, pt)
				const expectedV = c.scalar(pt)
				const numericD = centralDiff(c.scalar, pt)
				assertNear(res.v, expectedV, 1e-12, `${c.name} value at x=${pt}`)
				assertNear(
					res.d,
					numericD,
					1e-6 * Math.max(1, Math.abs(numericD)),
					`${c.name} derivative at x=${pt}: dual=${res.d}, centralDiff=${numericD}`,
				)
			}
		}
	})

	test('satisfies Leibniz product rule and chain rule algebraically on arbitrary functions', () => {
		const f = (x, ops) => ops.exp(ops.mul(0.5, x))
		const g = (x, ops) => ops.cos(ops.add(ops.mul(2, x), 0.3))
		const fg = (x, ops) => ops.mul(f(x, ops), g(x, ops))
		const fog = (x, ops) => f(g(x, ops), ops)

		for (const x of [-1.2, 0.1, 1.7]) {
			const df = derivativeDualMemo(f, x)
			const dg = derivativeDualMemo(g, x)
			const dfg = derivativeDualMemo(fg, x)
			const dfog = derivativeDualMemo(fog, x)
			const dfAtG = derivativeDualMemo(f, { v: dg.v, d: dg.d })

			// Leibniz: (f*g)' = f'*g + f*g'
			assertDualNear(dfg, {
				v: df.v * dg.v,
				d: df.d * dg.v + df.v * dg.d,
			})
			// Chain rule: (f o g)(x) = f(g(x), g'(x))
			assertDualNear(dfog, dfAtG)
		}
	})
})
