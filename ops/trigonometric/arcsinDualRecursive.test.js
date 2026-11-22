import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinDualRecursive } from './arcsinDualRecursive.js'

function assertClose(actual, expected, tol = 1e-14, label = '') {
	const scale = Math.max(1, Math.abs(expected))
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol * scale,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
	)
}

describe('arcsinDualRecursive', () => {
	describe('normal values and analytical derivative cross-checks', () => {
		const samples = [
			{ v: 0, d: 1 },
			{ v: 0, d: 0 },
			{ v: 0, d: -3.5 },
			{ v: 1e-12, d: 1 },
			{ v: -1e-12, d: 2 },
			{ v: 0.03, d: 1 },
			{ v: 0.0625, d: 1 },
			{ v: 0.1, d: 1 },
			{ v: -0.25, d: 2.5 },
			{ v: 0.5, d: 1 },
			{ v: -0.5, d: -1.5 },
			{ v: 0.5000001, d: 1 },
			{ v: Math.SQRT1_2, d: 1 },
			{ v: -Math.SQRT1_2, d: 3 },
			{ v: Math.sqrt(3) / 2, d: 1 },
			{ v: 0.9, d: 1 },
			{ v: -0.9, d: -2 },
			{ v: 0.99, d: 1 },
			{ v: -0.9999, d: 0.5 },
			{ v: 1 - 1e-12, d: 1 },
			{ v: -(1 - 1e-12), d: -1 },
		]

		for (const { v, d } of samples) {
			it(`matches Math.asin and analytical derivative at v=${v}, d=${d}`, () => {
				const input = { v, d }
				const result = arcsinDualRecursive(input)

				const expectedV = Math.asin(v)
				// Compute 1 - v^2 as (1 - v)(1 + v) to preserve accuracy near |v| = 1
				const expectedD = d / Math.sqrt((1 - v) * (1 + v))

				assertClose(result.v, expectedV, 1e-14, `v at (${v}, ${d})`)
				assertClose(result.d, expectedD, 1e-13, `d at (${v}, ${d})`)
				// Ensure input was not mutated
				assert.deepEqual(input, { v, d })
			})
		}

		it('matches exact special angles', () => {
			const r0 = arcsinDualRecursive({ v: 0, d: 1 })
			assert.equal(r0.v, 0)
			assert.equal(r0.d, 1)

			const rHalf = arcsinDualRecursive({ v: 0.5, d: 1 })
			assertClose(rHalf.v, Math.PI / 6, 1e-15, 'arcsin(0.5)')
			assertClose(rHalf.d, 2 / Math.sqrt(3), 1e-14, "arcsin'(0.5)")

			const rNegHalf = arcsinDualRecursive({ v: -0.5, d: 1 })
			assertClose(rNegHalf.v, -Math.PI / 6, 1e-15, 'arcsin(-0.5)')
			assertClose(rNegHalf.d, 2 / Math.sqrt(3), 1e-14, "arcsin'(-0.5)")
		})

		it('satisfies odd symmetry arcsin(-v, d) = (-arcsin(v), arcsin\'(v) * d)', () => {
			for (const v of [0.05, 0.2, 0.49, 0.51, 0.75, 0.95]) {
				const pos = arcsinDualRecursive({ v, d: 1.7 })
				const neg = arcsinDualRecursive({ v: -v, d: 1.7 })
				assertClose(neg.v, -pos.v, 1e-15, `odd v at ${v}`)
				assertClose(neg.d, pos.d, 1e-14, `even derivative at ${v}`)
			}
		})

		it('obeys linearity in the dual component d', () => {
			const unit = arcsinDualRecursive({ v: 0.73, d: 1 })
			for (const scale of [-5, -0.25, 0, 2.5, 100]) {
				const scaled = arcsinDualRecursive({ v: 0.73, d: scale })
				assertClose(scaled.v, unit.v, 1e-15, `v invariance scale=${scale}`)
				assertClose(scaled.d, unit.d * scale, 1e-14, `d linearity scale=${scale}`)
			}
		})

		it('preserves chain rule composition: arcsin(sin(t)) = t', () => {
			for (const t of [-1.2, -0.7, -0.1, 0, 0.1, 0.7, 1.2]) {
				const sinDual = { v: Math.sin(t), d: Math.cos(t) }
				const recovered = arcsinDualRecursive(sinDual)
				assertClose(recovered.v, t, 1e-14, `arcsin(sin(${t})) value`)
				assertClose(recovered.d, 1, 1e-14, `arcsin(sin(${t})) derivative`)
			}
		})
	})

	describe('central finite-difference cross-checks', () => {
		const h = 1e-6
		const points = [-0.95, -0.7, -0.5, -0.25, -0.05, 0, 0.05, 0.25, 0.5, 0.7, 0.95]

		for (const v of points) {
			it(`matches central finite difference at v=${v}`, () => {
				const d = 2.3
				const res = arcsinDualRecursive({ v, d })
				const fPlus = arcsinDualRecursive({ v: v + h, d: 0 }).v
				const fMinus = arcsinDualRecursive({ v: v - h, d: 0 }).v
				const fdDerivative = ((fPlus - fMinus) / (2 * h)) * d

				assertClose(res.d, fdDerivative, 1e-7, `finite-diff at v=${v}`)
			})
		}
	})

	describe('boundary cases at |v| === 1', () => {
		it('returns finite value with d=0 when v=1 and d=0', () => {
			const res = arcsinDualRecursive({ v: 1, d: 0 })
			assert.equal(res.v, Math.PI / 2)
			assert.equal(res.d, 0)
		})

		it('returns finite value with d=0 when v=-1 and d=0', () => {
			const res = arcsinDualRecursive({ v: -1, d: 0 })
			assert.equal(res.v, -Math.PI / 2)
			assert.equal(res.d, 0)
		})

		it('returns signed Infinity for d !== 0 at v=1', () => {
			const pos = arcsinDualRecursive({ v: 1, d: 2 })
			assert.equal(pos.v, Math.PI / 2)
			assert.equal(pos.d, Infinity)

			const neg = arcsinDualRecursive({ v: 1, d: -0.5 })
			assert.equal(neg.v, Math.PI / 2)
			assert.equal(neg.d, -Infinity)
		})

		it('returns signed Infinity for d !== 0 at v=-1', () => {
			const pos = arcsinDualRecursive({ v: -1, d: 1 })
			assert.equal(pos.v, -Math.PI / 2)
			assert.equal(pos.d, Infinity)

			const neg = arcsinDualRecursive({ v: -1, d: -3 })
			assert.equal(neg.v, -Math.PI / 2)
			assert.equal(neg.d, -Infinity)
		})

		it('preserves negative zero v=-0 matching Math.asin(-0)', () => {
			const res = arcsinDualRecursive({ v: -0, d: 1 })
			assert.equal(res.v, Math.asin(-0))
			assert.equal(res.d, 1)
		})
	})

	describe('domain and input validation', () => {
		it('throws RangeError when |v| > 1', () => {
			for (const v of [1.000001, -1.000001, 2, -10, Infinity, -Infinity]) {
				assert.throws(
					() => arcsinDualRecursive({ v, d: 1 }),
					RangeError,
					`expected RangeError for v=${v}`
				)
			}
		})

		it('throws RangeError for NaN or non-finite d', () => {
			assert.throws(() => arcsinDualRecursive({ v: NaN, d: 1 }), RangeError)
			assert.throws(() => arcsinDualRecursive({ v: 0.5, d: NaN }), RangeError)
			assert.throws(() => arcsinDualRecursive({ v: 0.5, d: Infinity }), RangeError)
			assert.throws(() => arcsinDualRecursive({ v: 0.5, d: -Infinity }), RangeError)
		})

		it('throws TypeError for invalid input shapes or non-numeric components', () => {
			for (const bad of [
				null,
				undefined,
				0.5,
				'0.5',
				[],
				[0.5, 1],
				{},
				{ v: 0.5 },
				{ d: 1 },
				{ v: '0.5', d: 1 },
				{ v: 0.5, d: '1' },
				{ v: null, d: 1 },
			]) {
				assert.throws(
					() => arcsinDualRecursive(bad),
					TypeError,
					`expected TypeError for ${JSON.stringify(bad)}`
				)
			}
		})
	})
})
