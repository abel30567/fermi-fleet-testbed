import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arctanDualSeries } from './arctanDualSeries.js'

const EPS = 1e-14

function assertClose(actual, expected, tol = EPS, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	)
}

describe('arctanDualSeries', () => {
	describe('normal cases', () => {
		it('evaluates standard special angles with unit derivative', () => {
			const cases = [
				{ v: 0, expectedV: 0, expectedD: 1 },
				{ v: 1 / Math.sqrt(3), expectedV: Math.PI / 6, expectedD: 0.75 },
				{ v: 1, expectedV: Math.PI / 4, expectedD: 0.5 },
				{ v: Math.sqrt(3), expectedV: Math.PI / 3, expectedD: 0.25 },
				{ v: -1, expectedV: -Math.PI / 4, expectedD: 0.5 },
				{ v: -Math.sqrt(3), expectedV: -Math.PI / 3, expectedD: 0.25 },
			]

			for (const { v, expectedV, expectedD } of cases) {
				const res = arctanDualSeries({ v, d: 1 })
				assertClose(res.v, expectedV, 1e-15, `v=${v} primal`)
				assertClose(res.d, expectedD, 1e-15, `v=${v} deriv`)
			}
		})

		it('propagates arbitrary incoming derivatives via the chain rule', () => {
			const res = arctanDualSeries({ v: 2, d: 7.5 })
			assertClose(res.v, Math.atan(2), 1e-15)
			assertClose(res.d, 7.5 / (1 + 4), 1e-15)

			const negDeriv = arctanDualSeries({ v: -0.5, d: -3 })
			assertClose(negDeriv.v, Math.atan(-0.5), 1e-15)
			assertClose(negDeriv.d, -3 / 1.25, 1e-15)
		})

		it('matches Math.atan across all reduction regimes', () => {
			// Covers |v| <= 0.25 (direct series), (0.25, 1] (half-angle), and > 1 (reciprocal)
			const samples = [
				-1000, -10, -2.5, -1.0001, -1, -0.9999, -0.5, -0.25, -0.1, -1e-6,
				0, 1e-6, 0.1, 0.25, 0.3, 0.5, 0.9999, 1, 1.0001, 2.5, 10, 1000,
			]

			for (const v of samples) {
				const d = 1.7
				const res = arctanDualSeries({ v, d })
				assertClose(res.v, Math.atan(v), 1e-15, `primal at v=${v}`)
				assertClose(res.d, d / (1 + v * v), 1e-15, `deriv at v=${v}`)
			}
		})
	})

	describe('edge cases', () => {
		it('handles zero primal, negative zero, and zero derivative', () => {
			assert.deepStrictEqual(arctanDualSeries({ v: 0, d: 0 }), { v: 0, d: 0 })
			assert.deepStrictEqual(arctanDualSeries({ v: -0, d: 1 }), { v: 0, d: 1 })
			assert.deepStrictEqual(arctanDualSeries({ v: 1, d: -0 }), {
				v: arctanDualSeries({ v: 1, d: 0 }).v,
				d: 0,
			})
		})

		it('handles very small magnitudes without precision loss', () => {
			for (const v of [1e-12, -1e-12, 1e-100, -1e-100, Number.MIN_VALUE]) {
				const res = arctanDualSeries({ v, d: 1 })
				assertClose(res.v, v, 1e-15 * Math.abs(v) + 1e-324, `small v=${v}`)
				assertClose(res.d, 1, 1e-15, `small deriv v=${v}`)
			}
		})

		it('handles very large magnitudes without overflow in derivative', () => {
			const hugePos = arctanDualSeries({ v: 1e160, d: 1e300 })
			assertClose(hugePos.v, Math.PI / 2, 1e-15)
			assertClose(hugePos.d, 1e-20, 1e-34)

			const hugeNeg = arctanDualSeries({ v: -1e160, d: -1e300 })
			assertClose(hugeNeg.v, -Math.PI / 2, 1e-15)
			assertClose(hugeNeg.d, -1e-20, 1e-34)

			const extreme = arctanDualSeries({ v: 1e200, d: 1 })
			assertClose(extreme.v, Math.PI / 2, 1e-15)
			assert.strictEqual(extreme.d, 0)
		})

		it('does not mutate the input object', () => {
			const input = Object.freeze({ v: 0.75, d: 2 })
			const res = arctanDualSeries(input)
			assertClose(res.v, Math.atan(0.75), 1e-15)
			assertClose(res.d, 2 / (1 + 0.75 * 0.75), 1e-15)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-object or malformed inputs', () => {
			for (const bad of [null, undefined, 1, '0', true, [], [1, 2], {}, { v: 1 }, { d: 1 }, { v: '1', d: 1 }, { v: 1, d: null }]) {
				assert.throws(() => arctanDualSeries(bad), TypeError)
			}
		})

		it('throws RangeError for NaN or non-finite components', () => {
			const nonFinite = [
				{ v: Number.NaN, d: 1 },
				{ v: 1, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 1, d: Number.POSITIVE_INFINITY },
				{ v: 1, d: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFinite) {
				assert.throws(() => arctanDualSeries(bad), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivative across the real line', () => {
			const points = [-15, -3.2, -1, -0.4, 0, 0.2, 0.75, 1, 4.5, 25]
			for (const v of points) {
				const h = 1e-6 * Math.max(1, Math.abs(v))
				const fPlus = arctanDualSeries({ v: v + h, d: 0 }).v
				const fMinus = arctanDualSeries({ v: v - h, d: 0 }).v
				const fdDeriv = (fPlus - fMinus) / (2 * h)

				const dual = arctanDualSeries({ v, d: 1 })
				assertClose(dual.d, fdDeriv, 1e-9, `finite-diff at v=${v}`)
			}
		})

		it('satisfies odd symmetry and reciprocal complementarity identities in value and derivative', () => {
			const positives = [0.05, 0.25, 0.6, 1, 2.3, 17.4]
			for (const x of positives) {
				// Oddness: arctan(-x) = -arctan(x), and d/dx arctan(-x) = -d/dx arctan(x) when d_in = -1
				const pos = arctanDualSeries({ v: x, d: 1 })
				const neg = arctanDualSeries({ v: -x, d: 1 })
				assertClose(neg.v, -pos.v, 1e-15, `odd primal at x=${x}`)
				assertClose(neg.d, pos.d, 1e-15, `even deriv at x=${x}`)

				// Reciprocal identity: arctan(x) + arctan(1/x) = pi/2
				// With u(t) = x + t, (1/u)' = -1/x^2, so the sum of dual derivatives must be 0.
				const rec = arctanDualSeries({ v: 1 / x, d: -1 / (x * x) })
				assertClose(pos.v + rec.v, Math.PI / 2, 1e-15, `reciprocal primal at x=${x}`)
				assertClose(pos.d + rec.d, 0, 1e-15, `reciprocal deriv at x=${x}`)
			}
		})

		it('satisfies tan(arctan(x)) = x for both primal and tangent components', () => {
			const points = [-8, -1.5, -0.3, 0, 0.3, 1.5, 8]
			for (const v of points) {
				const d = 2.5
				const a = arctanDualSeries({ v, d })
				const tanV = Math.tan(a.v)
				const cosV = Math.cos(a.v)
				const tanD = a.d / (cosV * cosV)

				assertClose(tanV, v, 1e-13, `tan(arctan(${v})) primal`)
				assertClose(tanD, d, 1e-13, `tan(arctan(${v})) deriv`)
			}
		})

		it('agrees with direct dual-arithmetic Maclaurin series for |v| < 0.5', () => {
			// Independent dual multiplication and series summation
			const mul = (a, b) => ({ v: a.v * b.v, d: a.v * b.d + a.d * b.v })
			const directDualSeries = (x) => {
				const x2 = mul(x, x)
				let power = x
				let sumV = x.v
				let sumD = x.d
				for (let k = 1; k < 40; k++) {
					power = mul(power, { v: -x2.v, d: -x2.d })
					const denom = 2 * k + 1
					sumV += power.v / denom
					sumD += power.d / denom
				}
				return { v: sumV, d: sumD }
			}

			for (const v of [-0.4, -0.15, 0.1, 0.35]) {
				const d = -1.25
				const actual = arctanDualSeries({ v, d })
				const expected = directDualSeries({ v, d })
				assertClose(actual.v, expected.v, 1e-15, `dual series primal v=${v}`)
				assertClose(actual.d, expected.d, 1e-15, `dual series deriv v=${v}`)
			}
		})
	})
})
