import { describe, test } from 'node:test'
import assert from 'node:assert'
import { powerDualSeries } from './powerDualSeries.js'

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		diff <= tol * scale,
		`${label ? label + ': ' : ''}expected ${expected}, got ${actual} (diff ${diff})`,
	)
}

function assertDualClose(actual, expected, tol = 1e-12) {
	assertClose(actual.v, expected.v, tol, 'v')
	assertClose(actual.d, expected.d, tol, 'd')
}

function mulDual(x, y) {
	return { v: x.v * y.v, d: x.v * y.d + x.d * y.v }
}

function addDual(x, y) {
	return { v: x.v + y.v, d: x.d + y.d }
}

describe('powerDualSeries', () => {
	describe('normal cases: dual ^ dual', () => {
		test('computes positive dual base raised to dual exponent', () => {
			// (2 + 3ε)^(3 + 2ε): v = 8, d = 3*4*3 + 8*2*ln(2) = 36 + 16*ln(2)
			const res = powerDualSeries({ v: 2, d: 3 }, { v: 3, d: 2 })
			assertDualClose(res, { v: 8, d: 36 + 16 * Math.log(2) })
		})

		test('computes x^x derivative: x^x * (1 + ln(x))', () => {
			for (const x of [0.5, 1, 2.5, 4]) {
				const res = powerDualSeries({ v: x, d: 1 }, { v: x, d: 1 })
				const val = Math.pow(x, x)
				assertDualClose(res, { v: val, d: val * (1 + Math.log(x)) })
			}
		})

		test('computes constant base with varying exponent: a^b * ln(a) * b\'', () => {
			const res = powerDualSeries({ v: Math.E, d: 0 }, { v: 2, d: 3 })
			assertDualClose(res, { v: Math.E ** 2, d: 3 * Math.E ** 2 })
		})

		test('computes fractional dual exponent', () => {
			// (4 + 1ε)^(0.5 + 0.25ε): v = 2, d = 0.5 * 4^(-0.5) * 1 + 2 * 0.25 * ln(4) = 0.25 + 0.5*ln(4)
			const res = powerDualSeries({ v: 4, d: 1 }, { v: 0.5, d: 0.25 })
			assertDualClose(res, { v: 2, d: 0.25 + 0.5 * Math.log(4) })
		})
	})

	describe('normal cases: dual ^ scalar', () => {
		test('accepts scalar integer exponent', () => {
			const res = powerDualSeries({ v: 3, d: 2 }, 4)
			assert.deepStrictEqual(res, { v: 81, d: 4 * 27 * 2 })
		})

		test('accepts scalar fractional exponent (square root)', () => {
			const res = powerDualSeries({ v: 9, d: 5 }, 0.5)
			assertDualClose(res, { v: 3, d: 5 / 6 })
		})

		test('accepts scalar negative exponent', () => {
			const res = powerDualSeries({ v: 2, d: 3 }, -3)
			assertDualClose(res, { v: 0.125, d: -3 * Math.pow(2, -4) * 3 })
		})

		test('matches equivalent dual exponent { v: n, d: 0 }', () => {
			const a = { v: 2.7, d: -1.3 }
			for (const n of [-2.5, -1, 0, 0.5, 1, 3.2]) {
				assert.deepStrictEqual(
					powerDualSeries(a, n),
					powerDualSeries(a, { v: n, d: 0 }),
				)
			}
		})
	})

	describe('edge cases', () => {
		test('exponent 0 (scalar and dual with d = 0) yields { v: 1, d: 0 } for any base', () => {
			for (const base of [
				{ v: 5, d: 2 },
				{ v: -5, d: 2 },
				{ v: 0, d: 7 },
				{ v: 0, d: 0 },
			]) {
				assert.deepStrictEqual(powerDualSeries(base, 0), { v: 1, d: 0 })
				assert.deepStrictEqual(powerDualSeries(base, { v: 0, d: 0 }), { v: 1, d: 0 })
			}
		})

		test('exponent { v: 0, d: b\' } on positive base', () => {
			// (1 + 5ε)^(0 + 7ε) = 1 + 0ε (since ln(1) = 0)
			assert.deepStrictEqual(powerDualSeries({ v: 1, d: 5 }, { v: 0, d: 7 }), { v: 1, d: 0 })
			// (2 + 5ε)^(0 + 7ε) = 1 + 7*ln(2)ε
			assertDualClose(powerDualSeries({ v: 2, d: 5 }, { v: 0, d: 7 }), {
				v: 1,
				d: 7 * Math.log(2),
			})
		})

		test('exponent 1 preserves base value and derivative for positive, zero, and negative bases', () => {
			for (const base of [
				{ v: 3.5, d: -2 },
				{ v: 0, d: 4.25 },
				{ v: -7, d: 1.5 },
			]) {
				assert.deepStrictEqual(powerDualSeries(base, 1), base)
				assert.deepStrictEqual(powerDualSeries(base, { v: 1, d: 0 }), base)
			}
		})

		test('negative base with positive and negative integer exponents', () => {
			assert.deepStrictEqual(powerDualSeries({ v: -3, d: 2 }, 2), { v: 9, d: -12 })
			assert.deepStrictEqual(powerDualSeries({ v: -3, d: 2 }, 3), { v: -27, d: 54 })
			assertDualClose(powerDualSeries({ v: -2, d: 3 }, -2), { v: 0.25, d: 0.75 })
			assertDualClose(powerDualSeries({ v: -2, d: 3 }, -3), { v: -0.125, d: -0.5625 })
		})

		test('zero base with exponents >= 1', () => {
			assert.deepStrictEqual(powerDualSeries({ v: 0, d: 5 }, 1), { v: 0, d: 5 })
			assert.deepStrictEqual(powerDualSeries({ v: 0, d: 5 }, 2), { v: 0, d: 0 })
			assert.deepStrictEqual(powerDualSeries({ v: 0, d: -3 }, 3), { v: 0, d: 0 })
			assert.deepStrictEqual(powerDualSeries({ v: 0, d: 2 }, 1.5), { v: 0, d: 0 })
		})

		test('normalizes -0 to +0 in outputs', () => {
			const res = powerDualSeries({ v: -0, d: -0 }, 3)
			assert.ok(Object.is(res.v, 0))
			assert.ok(Object.is(res.d, 0))

			const resNeg = powerDualSeries({ v: -2, d: -0 }, 2)
			assert.ok(Object.is(resNeg.d, 0))
		})

		test('avoids spurious overflow in derivative when a^(b-1) overflows but result is finite', () => {
			const res = powerDualSeries({ v: 0.01, d: 1e-5 }, -154)
			assert.ok(Number.isFinite(res.v))
			assert.ok(Number.isFinite(res.d))
			assertClose(res.v, 1e308, 1e-12, 'v')
			assertClose(res.d, -1.54e307, 1e-12, 'd')
		})
	})

	describe('input validation and domain errors', () => {
		test('rejects invalid base types with TypeError', () => {
			for (const badBase of [null, undefined, 2, '2', [2, 1], { v: 2 }, { d: 1 }, { v: '2', d: 1 }]) {
				assert.throws(() => powerDualSeries(badBase, 2), TypeError)
			}
		})

		test('rejects invalid exponent types with TypeError', () => {
			const base = { v: 2, d: 1 }
			for (const badExp of [null, undefined, '2', [2, 0], true, { v: 2 }, { d: 0 }, { v: 2, d: '0' }]) {
				assert.throws(() => powerDualSeries(base, badExp), TypeError)
			}
		})

		test('rejects non-finite components with RangeError', () => {
			assert.throws(() => powerDualSeries({ v: NaN, d: 1 }, 2), RangeError)
			assert.throws(() => powerDualSeries({ v: 2, d: Infinity }, 2), RangeError)
			assert.throws(() => powerDualSeries({ v: -Infinity, d: 0 }, 2), RangeError)
			assert.throws(() => powerDualSeries({ v: 2, d: 1 }, NaN), RangeError)
			assert.throws(() => powerDualSeries({ v: 2, d: 1 }, Infinity), RangeError)
			assert.throws(() => powerDualSeries({ v: 2, d: 1 }, { v: 2, d: -Infinity }), RangeError)
		})

		test('rejects negative base with non-integer exponent or non-zero exponent derivative', () => {
			assert.throws(() => powerDualSeries({ v: -2, d: 1 }, 0.5), RangeError)
			assert.throws(() => powerDualSeries({ v: -2, d: 0 }, -1.5), RangeError)
			assert.throws(() => powerDualSeries({ v: -2, d: 1 }, { v: 2, d: 0.1 }), RangeError)
			assert.throws(() => powerDualSeries({ v: -2, d: 0 }, { v: 0, d: 1 }), RangeError)
		})

		test('rejects zero base with negative exponent, exponent in (0, 1), or non-zero exponent derivative', () => {
			assert.throws(() => powerDualSeries({ v: 0, d: 1 }, -1), RangeError)
			assert.throws(() => powerDualSeries({ v: 0, d: 0 }, -2), RangeError)
			assert.throws(() => powerDualSeries({ v: 0, d: 1 }, 0.5), RangeError)
			assert.throws(() => powerDualSeries({ v: 0, d: 0 }, 0.25), RangeError)
			assert.throws(() => powerDualSeries({ v: 0, d: 0 }, { v: 2, d: 1 }), RangeError)
			assert.throws(() => powerDualSeries({ v: 0, d: 1 }, { v: 0, d: 1 }), RangeError)
		})

		test('rejects overflow in value or derivative', () => {
			assert.throws(() => powerDualSeries({ v: 1e200, d: 1 }, 2), RangeError)
			assert.throws(() => powerDualSeries({ v: -1e200, d: 1 }, 2), RangeError)
			assert.throws(() => powerDualSeries({ v: 1e150, d: 1e200 }, 2), RangeError)
			assert.throws(() => powerDualSeries({ v: -1e150, d: 1e200 }, 2), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		test('matches central finite-difference derivative across varied dual inputs', () => {
			const h = 1e-6
			const cases = [
				[{ v: 2.3, d: 1.7 }, { v: 1.4, d: -0.9 }],
				[{ v: 0.75, d: -0.4 }, { v: -2.2, d: 1.1 }],
				[{ v: 5.0, d: 2.5 }, { v: 0.0, d: 3.1 }],
				[{ v: 1.2, d: 0.0 }, { v: 3.5, d: -2.0 }],
				[{ v: -3.2, d: 1.4 }, { v: 3, d: 0 }],
				[{ v: -2.5, d: -0.8 }, { v: -2, d: 0 }],
			]

			for (const [base, exp] of cases) {
				const res = powerDualSeries(base, exp)
				const fPlus = Math.pow(base.v + h * base.d, exp.v + h * exp.d)
				const fMinus = Math.pow(base.v - h * base.d, exp.v - h * exp.d)
				const fd = (fPlus - fMinus) / (2 * h)
				assertClose(res.v, Math.pow(base.v, exp.v), 1e-12, 'primal')
				assertClose(res.d, fd, 1e-7, `finite-diff for (${base.v},${base.d})^(${exp.v},${exp.d})`)
			}
		})

		test('matches algebraic dual multiplication for integer powers and reciprocal', () => {
			for (const x of [
				{ v: 3.25, d: -1.75 },
				{ v: -2.5, d: 4.1 },
				{ v: 0, d: 2.3 },
			]) {
				const sq = mulDual(x, x)
				assertDualClose(powerDualSeries(x, 2), sq)

				const cube = mulDual(sq, x)
				assertDualClose(powerDualSeries(x, 3), cube)

				if (x.v !== 0) {
					const recip = { v: 1 / x.v, d: -x.d / (x.v * x.v) }
					assertDualClose(powerDualSeries(x, -1), recip)
				}
			}
		})

		test('satisfies exponent laws: (x^p)^q = x^(p*q) and x^p * x^q = x^(p+q)', () => {
			const x = { v: 2.4, d: 0.9 }
			const p = { v: 1.3, d: -0.5 }
			const q = { v: -0.8, d: 0.7 }

			const lhsPow = powerDualSeries(powerDualSeries(x, p), q)
			const rhsPow = powerDualSeries(x, mulDual(p, q))
			assertDualClose(lhsPow, rhsPow, 1e-11)

			const lhsProd = mulDual(powerDualSeries(x, p), powerDualSeries(x, q))
			const rhsProd = powerDualSeries(x, addDual(p, q))
			assertDualClose(lhsProd, rhsProd, 1e-11)
		})
	})
})
