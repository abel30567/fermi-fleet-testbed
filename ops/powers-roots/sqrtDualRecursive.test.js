import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtDualRecursive } from './sqrtDualRecursive.js'

function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-320) {
	if (expected === 0) {
		assert.ok(
			Math.abs(actual) <= absTol,
			`Expected ${actual} to be within ${absTol} of 0`,
		)
		return
	}
	const relErr = Math.abs(actual - expected) / Math.abs(expected)
	assert.ok(
		relErr <= relTol,
		`Expected ${actual} to be close to ${expected} (relErr=${relErr}, relTol=${relTol})`,
	)
}

describe('sqrtDualRecursive', () => {
	describe('normal cases', () => {
		it('computes exact values and derivatives for perfect squares', () => {
			const cases = [
				{ input: { v: 1, d: 1 }, expected: { v: 1, d: 0.5 } },
				{ input: { v: 4, d: 1 }, expected: { v: 2, d: 0.25 } },
				{ input: { v: 9, d: 6 }, expected: { v: 3, d: 1 } },
				{ input: { v: 16, d: -8 }, expected: { v: 4, d: -1 } },
				{ input: { v: 25, d: 0 }, expected: { v: 5, d: 0 } },
				{ input: { v: 100, d: -15 }, expected: { v: 10, d: -0.75 } },
				{ input: { v: 0.25, d: 2 }, expected: { v: 0.5, d: 2 } },
			]

			for (const { input, expected } of cases) {
				const res = sqrtDualRecursive(input)
				assertClose(res.v, expected.v, 1e-15)
				assertClose(res.d, expected.d, 1e-15)
			}
		})

		it('computes accurate results for non-perfect squares and irrational inputs', () => {
			const cases = [
				{ v: 2, d: 1 },
				{ v: 3, d: -2.5 },
				{ v: 5, d: 7 },
				{ v: 0.1, d: 0.3 },
				{ v: Math.PI, d: Math.E },
				{ v: 12345.6789, d: -987.654 },
			]

			for (const x of cases) {
				const res = sqrtDualRecursive(x)
				const expectedV = Math.sqrt(x.v)
				const expectedD = x.d / (2 * expectedV)
				assertClose(res.v, expectedV, 1e-15)
				assertClose(res.d, expectedD, 1e-15)
			}
		})

		it('satisfies the dual-number algebraic identity y * y === x', () => {
			const samples = [
				{ v: 0.007, d: 3.1 },
				{ v: 2.5, d: -1.7 },
				{ v: 42, d: 13.5 },
				{ v: 999999.5, d: -42.25 },
			]

			for (const x of samples) {
				const y = sqrtDualRecursive(x)
				// (y.v + y.d*eps)^2 = y.v^2 + (2 * y.v * y.d)*eps
				assertClose(y.v * y.v, x.v, 1e-14)
				assertClose(2 * y.v * y.d, x.d, 1e-14)
			}
		})

		it('satisfies forward-mode chain rule under nested composition', () => {
			// f(t) = sqrt(sqrt(t)) = t^(1/4), f'(t) = 0.25 * t^(-3/4)
			const t = 81
			const r1 = sqrtDualRecursive({ v: t, d: 1 })
			const r2 = sqrtDualRecursive(r1)
			assertClose(r2.v, 3, 1e-15)
			assertClose(r2.d, 1 / (4 * 27), 1e-15)

			// General t = 7.3 with seed d = -2.4
			const s = 7.3
			const seed = -2.4
			const nested = sqrtDualRecursive(sqrtDualRecursive({ v: s, d: seed }))
			assertClose(nested.v, s ** 0.25, 1e-15)
			assertClose(nested.d, seed * 0.25 * s ** -0.75, 1e-14)
		})

		it('does not mutate the input object', () => {
			const input = Object.freeze({ v: 9, d: 4 })
			const res = sqrtDualRecursive(input)
			assert.deepEqual(input, { v: 9, d: 4 })
			assertClose(res.v, 3, 1e-15)
			assertClose(res.d, 4 / 6, 1e-15)
		})
	})

	describe('edge cases', () => {
		it('handles v === 0 according to documented boundary semantics', () => {
			assert.deepEqual(sqrtDualRecursive({ v: 0, d: 0 }), { v: 0, d: 0 })
			assert.deepEqual(sqrtDualRecursive({ v: -0, d: -0 }), { v: 0, d: 0 })
			assert.ok(Object.is(sqrtDualRecursive({ v: -0, d: -0 }).v, 0))
			assert.ok(Object.is(sqrtDualRecursive({ v: -0, d: -0 }).d, 0))

			assert.deepEqual(sqrtDualRecursive({ v: 0, d: 1 }), { v: 0, d: Infinity })
			assert.deepEqual(sqrtDualRecursive({ v: 0, d: 1e-300 }), {
				v: 0,
				d: Infinity,
			})
			assert.deepEqual(sqrtDualRecursive({ v: 0, d: -1 }), {
				v: 0,
				d: -Infinity,
			})
			assert.deepEqual(sqrtDualRecursive({ v: -0, d: -5.5 }), {
				v: 0,
				d: -Infinity,
			})
		})

		it('normalizes negative zero derivative when v > 0', () => {
			const res = sqrtDualRecursive({ v: 4, d: -0 })
			assert.equal(res.v, 2)
			assert.ok(Object.is(res.d, 0))
		})

		it('handles range-reduction boundaries around powers of 4', () => {
			const boundaries = [
				0.25,
				0.9999999999999999,
				1,
				3.9999999999999996,
				4,
				16,
				2 ** 512,
				2 ** -512,
			]

			for (const v of boundaries) {
				const res = sqrtDualRecursive({ v, d: 3.5 })
				const expectedV = Math.sqrt(v)
				const expectedD = 3.5 / (2 * expectedV)
				assertClose(res.v, expectedV, 1e-15)
				assertClose(res.d, expectedD, 1e-15)
			}
		})

		it('handles very large and very small (including subnormal) values', () => {
			const cases = [
				{ v: 1e100, d: 1e50 },
				{ v: 1e200, d: -1e100 },
				{ v: 1e308, d: 1e308 },
				{ v: Number.MAX_VALUE, d: 1 },
				{ v: Number.MAX_VALUE, d: -Number.MAX_VALUE },
				{ v: 1e-100, d: 1e-50 },
				{ v: 1e-200, d: -1e-100 },
				{ v: 1e-308, d: 1e-308 },
				{ v: 1e-315, d: 1e-315 },
				{ v: Number.MIN_VALUE, d: Number.MIN_VALUE },
				{ v: Number.MIN_VALUE, d: 1 },
			]

			for (const x of cases) {
				const res = sqrtDualRecursive(x)
				const expectedV = Math.sqrt(x.v)
				const expectedD = x.d / (2 * expectedV)
				assertClose(res.v, expectedV, 1e-14)
				assertClose(res.d, expectedD, 1e-14)
			}
		})

		it('handles extreme derivative scaling without spurious overflow or underflow', () => {
			// True derivative is ~7.5e307 (finite near MAX_VALUE)
			const nearOverflow = sqrtDualRecursive({ v: 1e-308, d: 1.5e154 })
			assertClose(nearOverflow.v, Math.sqrt(1e-308), 1e-14)
			assertClose(nearOverflow.d, 1.5e154 / (2 * Math.sqrt(1e-308)), 1e-14)

			// True derivative genuinely overflows to +/-Infinity (must not become NaN)
			const posOverflow = sqrtDualRecursive({ v: 1e-300, d: 1e300 })
			assertClose(posOverflow.v, 1e-150, 1e-14)
			assert.equal(posOverflow.d, Infinity)

			const negOverflow = sqrtDualRecursive({ v: 1e-300, d: -1e300 })
			assertClose(negOverflow.v, 1e-150, 1e-14)
			assert.equal(negOverflow.d, -Infinity)

			// Subnormal output derivative (~5e-315) must remain non-zero and accurate
			const subnormalD = sqrtDualRecursive({ v: 1e308, d: 1e-160 })
			assertClose(subnormalD.v, Math.sqrt(1e308), 1e-14)
			assertClose(subnormalD.d, 1e-160 / (2 * Math.sqrt(1e308)), 1e-6)
		})
	})

	describe('input validation', () => {
		it('throws RangeError for negative v', () => {
			assert.throws(() => sqrtDualRecursive({ v: -1, d: 1 }), RangeError)
			assert.throws(() => sqrtDualRecursive({ v: -1e-300, d: 0 }), RangeError)
			assert.throws(
				() => sqrtDualRecursive({ v: -Number.MIN_VALUE, d: 1 }),
				RangeError,
			)
			assert.throws(() => sqrtDualRecursive({ v: -Infinity, d: 1 }), RangeError)
		})

		it('throws RangeError for NaN and non-finite inputs', () => {
			assert.throws(() => sqrtDualRecursive({ v: Number.NaN, d: 1 }), RangeError)
			assert.throws(() => sqrtDualRecursive({ v: 4, d: Number.NaN }), RangeError)
			assert.throws(() => sqrtDualRecursive({ v: Infinity, d: 1 }), RangeError)
			assert.throws(() => sqrtDualRecursive({ v: 4, d: Infinity }), RangeError)
			assert.throws(() => sqrtDualRecursive({ v: 4, d: -Infinity }), RangeError)
		})

		it('throws TypeError for non-object or malformed inputs', () => {
			const invalid = [
				null,
				undefined,
				4,
				'4',
				true,
				[4, 1],
				{},
				{ v: 4 },
				{ d: 1 },
				{ v: '4', d: 1 },
				{ v: 4, d: '1' },
				{ v: 4, d: null },
				{ v: undefined, d: 1 },
			]

			for (const bad of invalid) {
				assert.throws(() => sqrtDualRecursive(bad), TypeError)
			}
		})
	})

	describe('cross-checks against Math.sqrt, analytical derivative, and finite differences', () => {
		it('matches Math.sqrt and analytical derivative across a wide logarithmic grid', () => {
			for (let exp = -300; exp <= 300; exp += 15) {
				const v = 3.7 * 10 ** exp
				const d = (exp % 2 === 0 ? 1 : -1) * 2.3 * 10 ** (exp / 2)
				const res = sqrtDualRecursive({ v, d })
				const expectedV = Math.sqrt(v)
				const expectedD = d / (2 * expectedV)
				assertClose(res.v, expectedV, 1e-14)
				assertClose(res.d, expectedD, 1e-14)
			}
		})

		it('matches central finite differences for directional derivatives', () => {
			const samples = [
				{ v: 0.05, d: 1 },
				{ v: 0.75, d: -3.2 },
				{ v: 2, d: 1 },
				{ v: 17.4, d: 5.1 },
				{ v: 512.8, d: -12.3 },
				{ v: 1e6, d: 42 },
			]

			for (const { v, d } of samples) {
				const res = sqrtDualRecursive({ v, d })
				// Choose step h scaled to v / |d| for optimal central-difference precision
				const h = 1e-6 * (v / Math.abs(d))
				const fd = (Math.sqrt(v + h * d) - Math.sqrt(v - h * d)) / (2 * h)
				assertClose(res.d, fd, 1e-9)
			}
		})
	})
})
