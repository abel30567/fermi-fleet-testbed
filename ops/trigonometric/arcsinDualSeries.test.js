import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinDualSeries } from './arcsinDualSeries.js'

function assertClose(actual, expected, tol = 1e-14, label = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

describe('arcsinDualSeries', () => {
	test('evaluates standard trigonometric values and derivatives', () => {
		const cases = [
			{ v: 0, d: 1, expV: 0, expD: 1 },
			{ v: 0.5, d: 1, expV: Math.PI / 6, expD: 2 / Math.sqrt(3) },
			{ v: -0.5, d: 1, expV: -Math.PI / 6, expD: 2 / Math.sqrt(3) },
			{ v: Math.SQRT1_2, d: 1, expV: Math.PI / 4, expD: Math.SQRT2 },
			{ v: -Math.SQRT1_2, d: 1, expV: -Math.PI / 4, expD: Math.SQRT2 },
			{ v: Math.sqrt(3) / 2, d: 1, expV: Math.PI / 3, expD: 2 },
			{ v: -Math.sqrt(3) / 2, d: 1, expV: -Math.PI / 3, expD: 2 },
		]

		for (const { v, d, expV, expD } of cases) {
			const res = arcsinDualSeries({ v, d })
			assertClose(res.v, expV, 1e-15, `v at ${v}`)
			assertClose(res.d, expD, 1e-14, `d at ${v}`)
		}
	})

	test('scales linearly with the dual tangent component d', () => {
		const base = arcsinDualSeries({ v: 0.6, d: 1 })
		for (const scale of [0, -1, 2.5, -7.25, 1e-6]) {
			const res = arcsinDualSeries({ v: 0.6, d: scale })
			assertClose(res.v, base.v, 1e-15, `primal for scale=${scale}`)
			assertClose(res.d, base.d * scale, 1e-14, `tangent for scale=${scale}`)
		}
	})

	test('handles signed zero and very small inputs accurately', () => {
		const negZero = arcsinDualSeries({ v: -0, d: 1 })
		assert.ok(Object.is(negZero.v, -0))
		assert.equal(negZero.d, 1)

		for (const v of [1e-12, -1e-12, 1e-100, -1e-100]) {
			const res = arcsinDualSeries({ v, d: 3 })
			assert.equal(res.v, v)
			assertClose(res.d, 3, 1e-15, `tiny v=${v}`)
		}
	})

	test('is continuous across the |v| = 0.5 range-reduction boundary', () => {
		const eps = 1e-12
		for (const sign of [1, -1]) {
			const below = arcsinDualSeries({ v: sign * (0.5 - eps), d: 1 })
			const exact = arcsinDualSeries({ v: sign * 0.5, d: 1 })
			const above = arcsinDualSeries({ v: sign * (0.5 + eps), d: 1 })

			assertClose(below.v, exact.v, 1e-11, `below v sign=${sign}`)
			assertClose(above.v, exact.v, 1e-11, `above v sign=${sign}`)
			assertClose(below.d, exact.d, 1e-11, `below d sign=${sign}`)
			assertClose(above.d, exact.d, 1e-11, `above d sign=${sign}`)
		}
	})

	test('maintains high accuracy near |v| = 1 without catastrophic cancellation', () => {
		const deltas = [1e-4, 1e-8, 1e-12, 1e-15]
		for (const delta of deltas) {
			for (const sign of [1, -1]) {
				const v = sign * (1 - delta)
				const res = arcsinDualSeries({ v, d: 1 })
				const expectedV = Math.asin(v)
				const expectedD = 1 / Math.sqrt((1 - Math.abs(v)) * (1 + Math.abs(v)))

				assertClose(res.v, expectedV, 1e-14, `near-endpoint v=${v}`)
				const relErr = Math.abs(res.d - expectedD) / expectedD
				assert.ok(
					relErr < 1e-13,
					`near-endpoint derivative relErr=${relErr} too large at v=${v}`,
				)
			}
		}
	})

	test('handles vertical-tangent endpoints v = ±1', () => {
		const posPos = arcsinDualSeries({ v: 1, d: 1 })
		assertClose(posPos.v, Math.PI / 2, 1e-15)
		assert.equal(posPos.d, Infinity)

		const posNeg = arcsinDualSeries({ v: 1, d: -2 })
		assertClose(posNeg.v, Math.PI / 2, 1e-15)
		assert.equal(posNeg.d, -Infinity)

		const negPos = arcsinDualSeries({ v: -1, d: 1 })
		assertClose(negPos.v, -Math.PI / 2, 1e-15)
		assert.equal(negPos.d, Infinity)

		const negNeg = arcsinDualSeries({ v: -1, d: -0.5 })
		assertClose(negNeg.v, -Math.PI / 2, 1e-15)
		assert.equal(negNeg.d, -Infinity)

		const posZero = arcsinDualSeries({ v: 1, d: 0 })
		assertClose(posZero.v, Math.PI / 2, 1e-15)
		assert.ok(Number.isNaN(posZero.d))

		const negZero = arcsinDualSeries({ v: -1, d: 0 })
		assertClose(negZero.v, -Math.PI / 2, 1e-15)
		assert.ok(Number.isNaN(negZero.d))
	})

	test('cross-check: algebraic inverse identity sin(arcsin(x)) = x and chain rule', () => {
		const points = [-0.99, -0.85, -0.6, -0.49, -0.25, -0.05, 0, 0.1, 0.35, 0.51, 0.75, 0.95, 0.999]
		for (const v of points) {
			const d = 1.7
			const { v: y, d: dy } = arcsinDualSeries({ v, d })
			// sin(arcsin(v)) = v
			assertClose(Math.sin(y), v, 1e-14, `sin(arcsin(${v}))`)
			// d/dt [sin(arcsin(v(t)))] = cos(arcsin(v)) * dy = d
			assertClose(Math.cos(y) * dy, d, 1e-13, `cos(arcsin(${v})) * dy`)
		}
	})

	test('cross-check: central finite-difference derivative matches dual tangent', () => {
		const h = 1e-6
		const points = [-0.9, -0.7, -0.5, -0.3, -0.1, 0, 0.15, 0.45, 0.55, 0.8, 0.95]
		for (const v of points) {
			const { d } = arcsinDualSeries({ v, d: 1 })
			const fPlus = arcsinDualSeries({ v: v + h, d: 0 }).v
			const fMinus = arcsinDualSeries({ v: v - h, d: 0 }).v
			const fd = (fPlus - fMinus) / (2 * h)
			const relErr = Math.abs(d - fd) / Math.abs(d)
			assert.ok(
				relErr < 1e-7,
				`finite-difference mismatch at v=${v}: dual=${d}, fd=${fd}, relErr=${relErr}`,
			)
		}
	})

	test('cross-check: odd symmetry and chain rule composition f(t) = arcsin(0.5 * sin(t))', () => {
		for (const v of [0.12, 0.48, 0.52, 0.87]) {
			const pos = arcsinDualSeries({ v, d: 2.3 })
			const neg = arcsinDualSeries({ v: -v, d: 2.3 })
			assertClose(neg.v, -pos.v, 1e-15, `odd symmetry primal at ${v}`)
			assertClose(neg.d, pos.d, 1e-14, `even derivative symmetry at ${v}`)
		}

		// Composition: g(t) = 0.5 * sin(t), g'(t) = 0.5 * cos(t)
		for (const t of [-1.2, -0.4, 0, 0.7, 1.5, 2.3]) {
			const g = { v: 0.5 * Math.sin(t), d: 0.5 * Math.cos(t) }
			const res = arcsinDualSeries(g)
			const expectedV = Math.asin(0.5 * Math.sin(t))
			const expectedD = (0.5 * Math.cos(t)) / Math.sqrt(1 - 0.25 * Math.sin(t) ** 2)
			assertClose(res.v, expectedV, 1e-15, `composition v at t=${t}`)
			assertClose(res.d, expectedD, 1e-14, `composition d at t=${t}`)
		}
	})

	test('validates inputs and does not mutate the input object', () => {
		const invalidTypes = [
			null,
			undefined,
			0.5,
			'0.5',
			true,
			[0.5, 1],
			{},
			{ v: 0.5 },
			{ d: 1 },
			{ v: '0.5', d: 1 },
			{ v: 0.5, d: '1' },
		]
		for (const bad of invalidTypes) {
			assert.throws(() => arcsinDualSeries(bad), TypeError)
		}

		const invalidRanges = [
			{ v: NaN, d: 1 },
			{ v: 0.5, d: NaN },
			{ v: Infinity, d: 1 },
			{ v: -Infinity, d: 1 },
			{ v: 0.5, d: Infinity },
			{ v: 0.5, d: -Infinity },
			{ v: 1.0000001, d: 1 },
			{ v: -1.0000001, d: 1 },
			{ v: 2, d: 0 },
			{ v: -5, d: 1 },
		]
		for (const bad of invalidRanges) {
			assert.throws(() => arcsinDualSeries(bad), RangeError)
		}

		const input = Object.freeze({ v: 0.3, d: 2 })
		const out = arcsinDualSeries(input)
		assert.notEqual(out, input)
		assert.equal(input.v, 0.3)
		assert.equal(input.d, 2)
	})
})
