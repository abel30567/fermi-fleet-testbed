import { describe, it } from 'node:test'
import assert from 'node:assert'
import { log2DualSeries } from './log2DualSeries.js'

/**
 * Helper to assert two numbers are within an absolute/relative tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-12]
 * @param {string} [label]
 */
function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		diff <= tol * scale,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
	)
}

/**
 * Dual number multiplication: (a.v + a.d·ε)(b.v + b.d·ε) = a.v·b.v + (a.v·b.d + a.d·b.v)·ε
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	}
}

/**
 * Dual number division: (a.v + a.d·ε) / (b.v + b.d·ε)
 */
function dualDiv(a, b) {
	return {
		v: a.v / b.v,
		d: (a.d * b.v - a.v * b.d) / (b.v * b.v),
	}
}

/**
 * Dual number addition: (a.v + b.v) + (a.d + b.d)·ε
 */
function dualAdd(a, b) {
	return {
		v: a.v + b.v,
		d: a.d + b.d,
	}
}

/**
 * Dual number subtraction: (a.v - b.v) + (a.d - b.d)·ε
 */
function dualSub(a, b) {
	return {
		v: a.v - b.v,
		d: a.d - b.d,
	}
}

describe('log2DualSeries', () => {
	describe('normal cases', () => {
		it('computes value and forward derivative for general positive inputs', () => {
			const cases = [
				{ v: 3, d: 1 },
				{ v: 5, d: -2.5 },
				{ v: 10, d: 0.75 },
				{ v: Math.E, d: 2 },
				{ v: 0.3, d: 4.2 },
			]

			for (const input of cases) {
				const res = log2DualSeries(input)
				assertClose(res.v, Math.log2(input.v), 1e-15, `v for (${input.v}, ${input.d})`)
				assertClose(res.d, input.d / (input.v * Math.LN2), 1e-15, `d for (${input.v}, ${input.d})`)
			}
		})

		it('handles zero derivative cleanly without -0', () => {
			const resPos = log2DualSeries({ v: 7, d: 0 })
			assert.strictEqual(resPos.v, Math.log2(7))
			assert.strictEqual(Object.is(resPos.d, 0), true)

			const resNegZero = log2DualSeries({ v: 7, d: -0 })
			assert.strictEqual(Object.is(resNegZero.d, 0), true)
		})

		it('does not mutate the input object', () => {
			const input = Object.freeze({ v: 4, d: 3 })
			const res = log2DualSeries(input)
			assert.notStrictEqual(res, input)
			assert.strictEqual(res.v, 2)
			assertClose(res.d, 3 / (4 * Math.LN2), 1e-15)
		})
	})

	describe('edge cases', () => {
		it('handles v = 1 accurately', () => {
			const res = log2DualSeries({ v: 1, d: 1 })
			assert.strictEqual(Object.is(res.v, 0), true)
			assertClose(res.d, 1 / Math.LN2, 1e-15)

			const resZeroD = log2DualSeries({ v: 1, d: 0 })
			assert.strictEqual(Object.is(resZeroD.v, 0), true)
			assert.strictEqual(Object.is(resZeroD.d, 0), true)
		})

		it('returns exact primal exponents for powers of 2', () => {
			const exponents = [-20, -5, -1, 0, 1, 2, 3, 10, 30]
			for (const k of exponents) {
				const v = 2 ** k
				const d = 1.5
				const res = log2DualSeries({ v, d })
				assert.strictEqual(res.v, k)
				assertClose(res.d, d / (v * Math.LN2), 1e-15, `2^${k}`)
			}
		})

		it('handles very small and very large positive values', () => {
			const small = log2DualSeries({ v: 1e-100, d: 1e-100 })
			assertClose(small.v, Math.log2(1e-100), 1e-14)
			assertClose(small.d, 1 / Math.LN2, 1e-14)

			const large = log2DualSeries({ v: 1e100, d: 1e100 })
			assertClose(large.v, Math.log2(1e100), 1e-14)
			assertClose(large.d, 1 / Math.LN2, 1e-14)
		})
	})

	describe('input validation', () => {
		it('throws RangeError for v <= 0', () => {
			const invalidPrimal = [0, -0, -1, -1e-15, -100]
			for (const v of invalidPrimal) {
				assert.throws(
					() => log2DualSeries({ v, d: 1 }),
					RangeError,
					`expected RangeError for v=${v}`
				)
			}
		})

		it('throws RangeError for non-finite v or d', () => {
			const nonFiniteCases = [
				{ v: Number.NaN, d: 1 },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 2, d: Number.NaN },
				{ v: 2, d: Number.POSITIVE_INFINITY },
				{ v: 2, d: Number.NEGATIVE_INFINITY },
			]

			for (const input of nonFiniteCases) {
				assert.throws(() => log2DualSeries(input), RangeError)
			}
		})

		it('throws TypeError for non-object or malformed inputs', () => {
			const invalidInputs = [
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
				{ v: null, d: 1 },
				{ v: 4, d: undefined },
			]

			for (const input of invalidInputs) {
				assert.throws(() => log2DualSeries(input), TypeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference directional derivative', () => {
			const h = 1e-6
			const testPoints = [
				{ v: 0.5, d: 0.7 },
				{ v: 1, d: 1 },
				{ v: 2.718281828, d: -1.3 },
				{ v: 16, d: 3.5 },
				{ v: 123.456, d: 0.25 },
			]

			for (const pt of testPoints) {
				const dualRes = log2DualSeries(pt)
				const fd = (Math.log2(pt.v + h * pt.d) - Math.log2(pt.v - h * pt.d)) / (2 * h)
				assertClose(dualRes.d, fd, 1e-8, `finite-diff at v=${pt.v}, d=${pt.d}`)
			}
		})

		it('satisfies log2(a * b) = log2(a) + log2(b) over dual numbers', () => {
			const pairs = [
				[{ v: 2, d: 1 }, { v: 3, d: 2 }],
				[{ v: 0.5, d: -0.4 }, { v: 10, d: 3.1 }],
				[{ v: 7.25, d: 0 }, { v: 1.8, d: -2.5 }],
				[{ v: Math.PI, d: 1.1 }, { v: Math.E, d: -0.9 }],
			]

			for (const [a, b] of pairs) {
				const lhs = log2DualSeries(dualMul(a, b))
				const rhs = dualAdd(log2DualSeries(a), log2DualSeries(b))
				assertClose(lhs.v, rhs.v, 1e-13, 'product identity v')
				assertClose(lhs.d, rhs.d, 1e-13, 'product identity d')
			}
		})

		it('satisfies log2(a / b) = log2(a) - log2(b) over dual numbers', () => {
			const pairs = [
				[{ v: 9, d: 2 }, { v: 3, d: -1 }],
				[{ v: 0.75, d: 0.5 }, { v: 4.5, d: 1.25 }],
			]

			for (const [a, b] of pairs) {
				const lhs = log2DualSeries(dualDiv(a, b))
				const rhs = dualSub(log2DualSeries(a), log2DualSeries(b))
				assertClose(lhs.v, rhs.v, 1e-13, 'quotient identity v')
				assertClose(lhs.d, rhs.d, 1e-13, 'quotient identity d')
			}
		})

		it('inverts 2^x over dual numbers: log2(2^(v + d·ε)) = v + d·ε', () => {
			const points = [
				{ v: -3.5, d: 2 },
				{ v: 0, d: 1 },
				{ v: 4.2, d: -1.7 },
			]

			for (const x of points) {
				// 2^(v + d·ε) = 2^v + (2^v * ln(2) * d)·ε
				const exp2v = 2 ** x.v
				const pow2Dual = { v: exp2v, d: exp2v * Math.LN2 * x.d }
				const recovered = log2DualSeries(pow2Dual)
				assertClose(recovered.v, x.v, 1e-13, 'inverse identity v')
				assertClose(recovered.d, x.d, 1e-13, 'inverse identity d')
			}
		})
	})
})
