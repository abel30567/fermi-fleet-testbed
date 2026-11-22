import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sinDualIterative } from './sinDualIterative.js'

const EPS = 1e-14

function assertClose(actual, expected, tol = EPS, label = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

describe('sinDualIterative', () => {
	describe('normal cases', () => {
		test('computes primal and derivative accurately for standard angles across all quadrants', () => {
			const cases = [
				{ v: Math.PI / 6, d: 1, expV: 0.5, expD: Math.sqrt(3) / 2 },
				{ v: Math.PI / 4, d: 1, expV: Math.SQRT1_2, expD: Math.SQRT1_2 },
				{ v: Math.PI / 3, d: 1, expV: Math.sqrt(3) / 2, expD: 0.5 },
				{ v: (2 * Math.PI) / 3, d: 2.5, expV: Math.sqrt(3) / 2, expD: -0.5 * 2.5 },
				{ v: (5 * Math.PI) / 4, d: 3, expV: -Math.SQRT1_2, expD: -Math.SQRT1_2 * 3 },
				{ v: (7 * Math.PI) / 4, d: 0.4, expV: -Math.SQRT1_2, expD: Math.SQRT1_2 * 0.4 },
			]

			for (const { v, d, expV, expD } of cases) {
				const res = sinDualIterative({ v, d })
				assertClose(res.v, expV, EPS, `v at angle ${v}`)
				assertClose(res.d, expD, EPS, `d at angle ${v}`)
			}
		})

		test('supports forward-mode chain rule via composition sin(sin(x))', () => {
			const x = { v: 0.7, d: 1 }
			const inner = sinDualIterative(x)
			const outer = sinDualIterative(inner)

			const expectedV = Math.sin(Math.sin(0.7))
			const expectedD = Math.cos(Math.sin(0.7)) * Math.cos(0.7)
			assertClose(outer.v, expectedV, EPS, 'sin(sin(0.7)) v')
			assertClose(outer.d, expectedD, EPS, 'sin(sin(0.7)) d')
		})

		test('does not mutate the input object', () => {
			const input = { v: 1.23, d: 4.56 }
			sinDualIterative(input)
			assert.deepEqual(input, { v: 1.23, d: 4.56 })
		})
	})

	describe('edge cases', () => {
		test('handles zero and negative zero cleanly', () => {
			assert.deepEqual(sinDualIterative({ v: 0, d: 1 }), { v: 0, d: 1 })
			assert.deepEqual(sinDualIterative({ v: -0, d: 1 }), { v: 0, d: 1 })
			assert.deepEqual(sinDualIterative({ v: 0, d: 0 }), { v: 0, d: 0 })
			assert.deepEqual(sinDualIterative({ v: -0, d: -0 }), { v: 0, d: 0 })
		})

		test('handles cardinal angles ±π/2, ±π, ±2π', () => {
			const cardinal = [
				{ v: Math.PI / 2, expV: 1, expD: 0 },
				{ v: -Math.PI / 2, expV: -1, expD: 0 },
				{ v: Math.PI, expV: 0, expD: -1 },
				{ v: -Math.PI, expV: 0, expD: -1 },
				{ v: 2 * Math.PI, expV: 0, expD: 1 },
				{ v: -2 * Math.PI, expV: 0, expD: 1 },
			]

			for (const { v, expV, expD } of cardinal) {
				const res = sinDualIterative({ v, d: 1 })
				assertClose(res.v, expV, 1e-15, `v at ${v}`)
				assertClose(res.d, expD, 1e-15, `d at ${v}`)
			}
		})

		test('handles d = 0 without returning -0', () => {
			for (const v of [0, Math.PI / 3, Math.PI, -Math.PI, 1000]) {
				const res = sinDualIterative({ v, d: 0 })
				assert.equal(Object.is(res.d, 0), true, `expected +0 derivative at v=${v}, got ${res.d}`)
				assertClose(res.v, Math.sin(v), EPS, `v at ${v}`)
			}
		})

		test('handles negative derivatives d < 0', () => {
			const res = sinDualIterative({ v: 0.5, d: -3.5 })
			assertClose(res.v, Math.sin(0.5), EPS)
			assertClose(res.d, Math.cos(0.5) * -3.5, EPS)
		})

		test('handles very small angles accurately', () => {
			for (const v of [1e-12, -1e-12, 1e-8, -1e-8]) {
				const res = sinDualIterative({ v, d: 2 })
				assertClose(res.v, Math.sin(v), 1e-15, `small v=${v}`)
				assertClose(res.d, Math.cos(v) * 2, 1e-15, `small d at v=${v}`)
			}
		})

		test('handles large angles like ±1000 and ±1e6 accurately', () => {
			for (const v of [1000, -1000, 12345.6789, -98765.4321, 1e6, -1e6]) {
				const d = 1.7
				const res = sinDualIterative({ v, d })
				assertClose(res.v, Math.sin(v), 1e-13, `large angle v=${v}`)
				assertClose(res.d, Math.cos(v) * d, 1e-13, `large angle d at v=${v}`)
			}
		})

		test('remains finite and bounded for huge finite angles beyond Cody-Waite limit', () => {
			const res = sinDualIterative({ v: 1e12, d: 1 })
			assert.ok(Number.isFinite(res.v) && Math.abs(res.v) <= 1)
			assert.ok(Number.isFinite(res.d) && Math.abs(res.d) <= 1)
			assertClose(res.v * res.v + res.d * res.d, 1, 1e-14, 'Pythagorean identity at 1e12')
		})

		test('throws TypeError on invalid dual objects and non-finite inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				'0',
				true,
				[1, 1],
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 1 },
				{ v: 1, d: '1' },
				{ v: NaN, d: 1 },
				{ v: 1, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: -Infinity, d: 1 },
				{ v: 1, d: Infinity },
				{ v: 1, d: -Infinity },
			]

			for (const bad of invalidInputs) {
				assert.throws(
					() => sinDualIterative(bad),
					TypeError,
					`Expected TypeError for input: ${String(bad)}`
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches Math.sin and Math.cos across a sweep of angles', () => {
			for (let i = -25; i <= 25; i++) {
				const v = i * 0.37
				const d = -0.5 + i * 0.13
				const res = sinDualIterative({ v, d })
				assertClose(res.v, Math.sin(v), 1e-14, `Math.sin sweep v=${v}`)
				assertClose(res.d, Math.cos(v) * d, 1e-14, `Math.cos sweep v=${v}`)
			}
		})

		test('matches central finite-difference numerical derivative', () => {
			const h = 1e-6
			const testPoints = [-1000, -4.2, -1.1, 0, 0.35, 1.57, 2.8, 1000]
			for (const v of testPoints) {
				const d = 2.3
				const dual = sinDualIterative({ v, d })
				const fPlus = sinDualIterative({ v: v + h, d: 0 }).v
				const fMinus = sinDualIterative({ v: v - h, d: 0 }).v
				const numericDeriv = ((fPlus - fMinus) / (2 * h)) * d
				assertClose(dual.d, numericDeriv, 1e-8, `finite-diff at v=${v}`)
			}
		})

		test('satisfies Pythagorean identity sin²(v) + cos²(v) = 1 and odd/even symmetries', () => {
			const angles = [0.1, 0.73, 1.9, 3.5, 12.4, 1000]
			for (const v of angles) {
				const pos = sinDualIterative({ v, d: 1 })
				const neg = sinDualIterative({ v: -v, d: 1 })

				assertClose(pos.v * pos.v + pos.d * pos.d, 1, 1e-14, `sin²+cos²=1 at v=${v}`)
				assertClose(neg.v, -pos.v, 1e-15, `odd symmetry sin(-v)=-sin(v) at v=${v}`)
				assertClose(neg.d, pos.d, 1e-15, `even derivative cos(-v)=cos(v) at v=${v}`)
			}
		})
	})
})
