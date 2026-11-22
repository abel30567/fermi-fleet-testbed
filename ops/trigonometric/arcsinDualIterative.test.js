import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinDualIterative } from './arcsinDualIterative.js'

function assertClose(actual, expected, tol = 1e-14, message = '') {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		diff <= tol * scale,
		`${message ? message + ': ' : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
	)
}

describe('arcsinDualIterative', () => {
	describe('normal cases', () => {
		it('evaluates exact special angles and their derivatives', () => {
			const cases = [
				{ input: { v: 0, d: 1 }, expectedV: 0, expectedD: 1 },
				{ input: { v: 0.5, d: 1 }, expectedV: Math.PI / 6, expectedD: 2 / Math.sqrt(3) },
				{ input: { v: -0.5, d: 1 }, expectedV: -Math.PI / 6, expectedD: 2 / Math.sqrt(3) },
				{ input: { v: Math.SQRT1_2, d: 1 }, expectedV: Math.PI / 4, expectedD: Math.SQRT2 },
				{ input: { v: -Math.SQRT1_2, d: 2 }, expectedV: -Math.PI / 4, expectedD: 2 * Math.SQRT2 },
				{ input: { v: Math.sqrt(3) / 2, d: -3 }, expectedV: Math.PI / 3, expectedD: -6 },
				{ input: { v: -Math.sqrt(3) / 2, d: 0.5 }, expectedV: -Math.PI / 3, expectedD: 1 },
			]

			for (const { input, expectedV, expectedD } of cases) {
				const res = arcsinDualIterative(input)
				assertClose(res.v, expectedV, 1e-14, `v for input (${input.v}, ${input.d})`)
				assertClose(res.d, expectedD, 1e-14, `d for input (${input.v}, ${input.d})`)
			}
		})

		it('handles continuity across the |v| = 0.5 range-reduction boundary', () => {
			const points = [-0.500001, -0.5, -0.499999, 0.499999, 0.5, 0.500001]
			for (const v of points) {
				const res = arcsinDualIterative({ v, d: 1.5 })
				assertClose(res.v, Math.asin(v), 1e-15, `v at ${v}`)
				assertClose(res.d, 1.5 / Math.sqrt(1 - v * v), 1e-14, `d at ${v}`)
			}
		})

		it('respects odd symmetry of primal and even symmetry of derivative', () => {
			const values = [0.1, 0.37, 0.5, 0.73, 0.9, 0.999]
			for (const v of values) {
				const pos = arcsinDualIterative({ v, d: 2.5 })
				const neg = arcsinDualIterative({ v: -v, d: 2.5 })
				assertClose(neg.v, -pos.v, 1e-15, `odd symmetry at ${v}`)
				assertClose(neg.d, pos.d, 1e-15, `even derivative symmetry at ${v}`)
			}
		})

		it('propagates chain-rule derivatives accurately for composite inputs', () => {
			// g(t) = 0.6 * t^2 - 0.2, g'(t) = 1.2 * t
			for (const t of [-1.2, -0.5, 0, 0.7, 1.3]) {
				const gv = 0.6 * t * t - 0.2
				const gd = 1.2 * t
				const res = arcsinDualIterative({ v: gv, d: gd })
				assertClose(res.v, Math.asin(gv), 1e-15, `composite v at t=${t}`)
				assertClose(res.d, gd / Math.sqrt(1 - gv * gv), 1e-14, `composite d at t=${t}`)
			}
		})
	})

	describe('edge cases', () => {
		it('handles zero primal and zero derivative cleanly without -0', () => {
			const r1 = arcsinDualIterative({ v: 0, d: 0 })
			assert.strictEqual(r1.v, 0)
			assert.strictEqual(r1.d, 0)

			const r2 = arcsinDualIterative({ v: -0, d: -0 })
			assert.strictEqual(r2.v, 0)
			assert.strictEqual(r2.d, 0)

			const r3 = arcsinDualIterative({ v: 0.4, d: 0 })
			assertClose(r3.v, Math.asin(0.4), 1e-15)
			assert.strictEqual(r3.d, 0)

			const r4 = arcsinDualIterative({ v: -0.9, d: -0 })
			assertClose(r4.v, Math.asin(-0.9), 1e-15)
			assert.strictEqual(r4.d, 0)
		})

		it('handles domain boundaries v = ±1 when d = 0', () => {
			const pos = arcsinDualIterative({ v: 1, d: 0 })
			assert.strictEqual(pos.v, Math.PI / 2)
			assert.strictEqual(pos.d, 0)

			const neg = arcsinDualIterative({ v: -1, d: 0 })
			assert.strictEqual(neg.v, -Math.PI / 2)
			assert.strictEqual(neg.d, 0)
		})

		it('throws RangeError at domain boundaries v = ±1 when d !== 0', () => {
			assert.throws(() => arcsinDualIterative({ v: 1, d: 1 }), RangeError)
			assert.throws(() => arcsinDualIterative({ v: 1, d: -1e-12 }), RangeError)
			assert.throws(() => arcsinDualIterative({ v: -1, d: 1 }), RangeError)
			assert.throws(() => arcsinDualIterative({ v: -1, d: -0.5 }), RangeError)
		})

		it('handles values very close to 0 and very close to ±1', () => {
			const nearBoundary = [-0.999999, -0.999, -0.9, -1e-12, 1e-12, 0.9, 0.999, 0.999999]
			for (const v of nearBoundary) {
				const res = arcsinDualIterative({ v, d: 1 })
				assertClose(res.v, Math.asin(v), 1e-14, `v near boundary ${v}`)
				const expectedD = 1 / Math.sqrt((1 - Math.abs(v)) * (1 + Math.abs(v)))
				assertClose(res.d, expectedD, 1e-13, `d near boundary ${v}`)
			}
		})

		it('throws RangeError for out-of-domain primal values', () => {
			for (const v of [-2, -1.000001, -1 - Number.EPSILON, 1 + Number.EPSILON, 1.000001, 5]) {
				assert.throws(
					() => arcsinDualIterative({ v, d: 0 }),
					RangeError,
					`expected RangeError for v=${v}`
				)
			}
		})

		it('throws RangeError if derivative overflows to non-finite', () => {
			assert.throws(
				() => arcsinDualIterative({ v: 1 - 1e-15, d: Number.MAX_VALUE }),
				RangeError
			)
		})

		it('throws TypeError for invalid inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				0.5,
				'0.5',
				true,
				[0.5, 1],
				{},
				{ v: 0.5 },
				{ d: 1 },
				{ v: NaN, d: 1 },
				{ v: 0.5, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: -Infinity, d: 1 },
				{ v: 0.5, d: Infinity },
				{ v: 0.5, d: -Infinity },
				{ v: '0.5', d: 1 },
				{ v: 0.5, d: '1' },
				{ v: null, d: 1 },
				{ v: 0.5, d: undefined },
			]

			for (const bad of invalidInputs) {
				assert.throws(
					() => arcsinDualIterative(bad),
					TypeError,
					`expected TypeError for input ${JSON.stringify(bad)}`
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches Math.asin across a dense grid in [-1, 1]', () => {
			const steps = 200
			for (let i = 0; i <= steps; i++) {
				const v = -1 + (2 * i) / steps
				const d = i === 0 || i === steps ? 0 : 1
				const res = arcsinDualIterative({ v, d })
				assertClose(res.v, Math.asin(v), 1e-14, `grid point v=${v}`)
			}
		})

		it('matches central finite-difference numerical derivatives', () => {
			const testPoints = [
				{ v: -0.99, d: 1.7, h: 1e-6 },
				{ v: -0.9, d: -2.3, h: 1e-6 },
				{ v: -0.75, d: 1, h: 1e-6 },
				{ v: -0.5, d: 3.1, h: 1e-6 },
				{ v: -0.2, d: -0.5, h: 1e-6 },
				{ v: 0, d: 2.2, h: 1e-6 },
				{ v: 0.3, d: 1, h: 1e-6 },
				{ v: 0.5, d: -1.4, h: 1e-6 },
				{ v: 0.85, d: 0.8, h: 1e-6 },
				{ v: 0.99, d: 1.2, h: 1e-6 },
				{ v: 0.999, d: 1, h: 1e-7 },
			]

			for (const { v, d, h } of testPoints) {
				const res = arcsinDualIterative({ v, d })
				const numericDeriv = ((Math.asin(v + h) - Math.asin(v - h)) / (2 * h)) * d
				assertClose(res.d, numericDeriv, 1e-6, `finite-diff derivative at v=${v}`)
			}
		})

		it('satisfies trigonometric inverse identities sin(arcsin(v)) = v and cos(arcsin(v)) * d_out = d_in', () => {
			const samples = [-0.95, -0.6, -0.25, 0, 0.25, 0.6, 0.95]
			for (const v of samples) {
				const d = 1.75
				const res = arcsinDualIterative({ v, d })
				assertClose(Math.sin(res.v), v, 1e-14, `sin(arcsin(${v}))`)
				assertClose(Math.cos(res.v) * res.d, d, 1e-14, `cos(arcsin(${v})) * d_out`)
			}
		})
	})
})
