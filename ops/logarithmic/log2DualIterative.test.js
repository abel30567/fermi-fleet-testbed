import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { log2DualIterative } from './log2DualIterative.js'

function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-15, label = '') {
	const diff = Math.abs(actual - expected)
	const bound = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= bound,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${bound} of ${expected} (diff=${diff})`,
	)
}

describe('log2DualIterative', () => {
	it('computes exact values for integer powers of two', () => {
		const cases = [
			{ v: 1, d: 1, expectedV: 0 },
			{ v: 2, d: 1, expectedV: 1 },
			{ v: 4, d: -2, expectedV: 2 },
			{ v: 8, d: 3.5, expectedV: 3 },
			{ v: 1024, d: 5, expectedV: 10 },
			{ v: 0.5, d: 1, expectedV: -1 },
			{ v: 0.25, d: -0.5, expectedV: -2 },
			{ v: 2 ** -10, d: 0.25, expectedV: -10 },
			{ v: 2 ** 50, d: 1e6, expectedV: 50 },
		]

		for (const { v, d, expectedV } of cases) {
			const result = log2DualIterative({ v, d })
			assert.equal(result.v, expectedV)
			assertClose(result.d, d / (v * Math.LN2), 1e-14, 1e-15, `d for v=${v}`)
		}
	})

	it('computes accurate primal and derivative for non-power-of-two values', () => {
		const values = [0.1, 0.3, 0.75, Math.SQRT1_2, Math.SQRT2, 1.5, Math.E, 3, Math.PI, 5, 10, 123.456]
		const derivatives = [1, -1, 2.5, -0.125]

		for (const v of values) {
			for (const d of derivatives) {
				const result = log2DualIterative({ v, d })
				assertClose(result.v, Math.log2(v), 1e-14, 1e-15, `v for (${v}, ${d})`)
				assertClose(result.d, d / (v * Math.LN2), 1e-14, 1e-15, `d for (${v}, ${d})`)
			}
		}
	})

	it('maintains precision for values very close to 1 without cancellation', () => {
		const offsets = [1e-12, -1e-12, 1e-9, -1e-9, 1e-6, -1e-6]

		for (const eps of offsets) {
			const v = 1 + eps
			const d = 1
			const result = log2DualIterative({ v, d })
			assertClose(result.v, Math.log1p(eps) / Math.LN2, 1e-12, 1e-15, `v near 1 (eps=${eps})`)
			assertClose(result.d, 1 / (v * Math.LN2), 1e-14, 1e-15, `d near 1 (eps=${eps})`)
		}
	})

	it('handles zero and negative-zero derivatives cleanly', () => {
		const resZero = log2DualIterative({ v: 5, d: 0 })
		assertClose(resZero.v, Math.log2(5))
		assert.ok(Object.is(resZero.d, 0))

		const resNegZero = log2DualIterative({ v: 5, d: -0 })
		assertClose(resNegZero.v, Math.log2(5))
		assert.ok(Object.is(resNegZero.d, 0))
	})

	it('handles extreme magnitudes including MAX_VALUE and subnormal MIN_VALUE', () => {
		const huge = log2DualIterative({ v: Number.MAX_VALUE, d: Number.MAX_VALUE })
		assertClose(huge.v, Math.log2(Number.MAX_VALUE), 1e-14)
		assertClose(huge.d, 1 / Math.LN2, 1e-14)

		const tinyNormal = log2DualIterative({ v: 1e-300, d: 1e-300 })
		assertClose(tinyNormal.v, Math.log2(1e-300), 1e-14)
		assertClose(tinyNormal.d, 1 / Math.LN2, 1e-14)

		const subnormal = log2DualIterative({ v: Number.MIN_VALUE, d: Number.MIN_VALUE })
		assert.equal(subnormal.v, -1074)
		assertClose(subnormal.d, 1 / Math.LN2, 1e-14)
	})

	it('does not mutate the input object and returns a new object', () => {
		const input = { v: 6, d: 2 }
		const result = log2DualIterative(input)
		assert.notEqual(result, input)
		assert.deepEqual(input, { v: 6, d: 2 })
	})

	it('throws TypeError for non-object or malformed inputs', () => {
		const invalid = [
			null,
			undefined,
			42,
			'8',
			true,
			[8, 1],
			() => ({ v: 8, d: 1 }),
			{},
			{ v: 8 },
			{ d: 1 },
			{ v: '8', d: 1 },
			{ v: 8, d: '1' },
			{ v: 8, d: null },
		]

		for (const bad of invalid) {
			assert.throws(() => log2DualIterative(bad), TypeError)
		}
	})

	it('throws RangeError for non-finite or non-positive values', () => {
		const invalid = [
			{ v: 0, d: 1 },
			{ v: -0, d: 1 },
			{ v: -1, d: 1 },
			{ v: -1e-300, d: 0 },
			{ v: Number.NaN, d: 1 },
			{ v: 2, d: Number.NaN },
			{ v: Number.POSITIVE_INFINITY, d: 1 },
			{ v: Number.NEGATIVE_INFINITY, d: 1 },
			{ v: 2, d: Number.POSITIVE_INFINITY },
			{ v: 2, d: Number.NEGATIVE_INFINITY },
		]

		for (const bad of invalid) {
			assert.throws(() => log2DualIterative(bad), RangeError)
		}
	})

	it('matches central finite-difference derivative approximation', () => {
		const h = 1e-6
		const testPoints = [
			{ v: 0.25, d: 1.3 },
			{ v: 1.0, d: -2.0 },
			{ v: 2.75, d: 0.7 },
			{ v: 15.4, d: -4.2 },
			{ v: 100.5, d: 3.1 },
		]

		for (const { v, d } of testPoints) {
			const dual = log2DualIterative({ v, d })
			const finiteDiff = (Math.log2(v + h * d) - Math.log2(v - h * d)) / (2 * h)
			assertClose(dual.d, finiteDiff, 1e-8, 1e-9, `finite diff at (${v}, ${d})`)
		}
	})

	it('satisfies dual-number logarithmic identities (product, reciprocal, power, and inverse)', () => {
		const a = { v: 3.2, d: 1.7 }
		const b = { v: 5.8, d: -2.4 }

		// Product rule: log2(a * b) = log2(a) + log2(b)
		const product = { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
		const logProduct = log2DualIterative(product)
		const logA = log2DualIterative(a)
		const logB = log2DualIterative(b)
		assertClose(logProduct.v, logA.v + logB.v, 1e-14, 1e-15, 'product primal')
		assertClose(logProduct.d, logA.d + logB.d, 1e-14, 1e-15, 'product deriv')

		// Reciprocal rule: log2(1 / a) = -log2(a)
		const reciprocal = { v: 1 / a.v, d: -a.d / (a.v * a.v) }
		const logReciprocal = log2DualIterative(reciprocal)
		assertClose(logReciprocal.v, -logA.v, 1e-14, 1e-15, 'reciprocal primal')
		assertClose(logReciprocal.d, -logA.d, 1e-14, 1e-15, 'reciprocal deriv')

		// Power rule: log2(a^k) = k * log2(a)
		const k = 4
		const power = { v: a.v ** k, d: k * a.v ** (k - 1) * a.d }
		const logPower = log2DualIterative(power)
		assertClose(logPower.v, k * logA.v, 1e-14, 1e-15, 'power primal')
		assertClose(logPower.d, k * logA.d, 1e-14, 1e-15, 'power deriv')

		// Inverse check: 2^(log2(a)) = a in dual arithmetic
		const exp2Val = 2 ** logA.v
		const roundTrip = { v: exp2Val, d: exp2Val * Math.LN2 * logA.d }
		assertClose(roundTrip.v, a.v, 1e-14, 1e-15, 'inverse primal')
		assertClose(roundTrip.d, a.d, 1e-14, 1e-15, 'inverse deriv')
	})
})
